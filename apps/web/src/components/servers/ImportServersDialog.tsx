'use client';

/**
 * Import dialog.
 *
 * The file never leaves the browser until the user commits: we read it locally,
 * show what it contains, and only then POST it. That preview is the safety
 * feature — a user talked into importing a hostile file sees "412 servers,
 * unknown group names" before anything touches their account.
 *
 * All real validation (schema, SSRF on every host, decryption) happens on the
 * server; this component is a thin, honest front end to /api/servers/import.
 */

import { useState, useRef } from 'react';
import {
    Upload,
    FileJson,
    FileText,
    Lock,
    Loader2,
    CheckCircle2,
    AlertTriangle,
    XCircle,
    ChevronDown,
    ChevronRight,
    FileDown,
    Copy,
    Check,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SAMPLE_CSV, SAMPLE_JSON, SAMPLE_COLUMNS, SAMPLE_ROWS } from '@/lib/transfer/samples';
import { detectFormat } from '@/lib/transfer/detect';

type FileType = 'json' | 'csv' | 'ssh-config' | 'putty' | 'mobaxterm';

const FORMAT_LABEL: Record<FileType, string> = {
    json: 'Termi export',
    csv: 'CSV',
    'ssh-config': 'OpenSSH config',
    putty: 'PuTTY sessions',
    mobaxterm: 'MobaXterm sessions',
};

interface Preview {
    total: number;
    withCredentials: number;
    groups: string[];
    notes: string[];
    servers: {
        name: string;
        host: string;
        port: number;
        protocol: string;
        username: string | null;
        group: string | null;
        jump: string | null;
    }[];
}

/**
 * Decode a file the way the tool that wrote it did: `reg export` writes
 * UTF-16 with a BOM, MobaXterm writes Windows-1252, everything else UTF-8.
 */
async function decodeFile(file: File): Promise<string> {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
    if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes);
    try {
        return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
        return new TextDecoder('windows-1252').decode(bytes);
    }
}

interface Props {
    onClose: () => void;
    onImported: () => void;
}

interface ImportResult {
    imported: number;
    skipped: number;
    failed: { name: string; reason: string }[];
    total: number;
    notes?: string[];
}

/** Matches MAX_CONTENT_LENGTH on the server, checked early for a clear message. */
const MAX_FILE_BYTES = 8 * 1024 * 1024;

export default function ImportServersDialog({ onClose, onImported }: Props) {
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [content, setContent] = useState('');
    const [fileType, setFileType] = useState<FileType>('json');
    const [preview, setPreview] = useState<Preview | null>(null);
    const [previewing, setPreviewing] = useState(false);
    const [keychain, setKeychain] = useState<{ id: string; label: string; username: string }[]>([]);
    const [keychainId, setKeychainId] = useState('');
    const [fileName, setFileName] = useState('');
    const [isEncrypted, setIsEncrypted] = useState(false);
    const [passphrase, setPassphrase] = useState('');
    const [onDuplicate, setOnDuplicate] = useState<'skip' | 'rename'>('skip');

    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [result, setResult] = useState<ImportResult | null>(null);

    // Format-help panel
    const [showFormat, setShowFormat] = useState(false);
    const [sampleTab, setSampleTab] = useState<'csv' | 'json' | 'xlsx'>('csv');
    const [copied, setCopied] = useState(false);

    // Only the text formats have something to copy; Excel is binary.
    const sampleText = sampleTab === 'json' ? SAMPLE_JSON : SAMPLE_CSV;

    async function copySample() {
        try {
            await navigator.clipboard.writeText(sampleText);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            // Clipboard blocked (insecure context / permissions) — the sample is
            // visible on screen to copy by hand, so this is not worth surfacing.
        }
    }

    /**
     * Download a ready-to-edit template.
     *
     * Text formats are built here; .xlsx is binary and must come from the server
     * (the browser cannot assemble a spreadsheet), so it is fetched instead.
     */
    async function downloadSample() {
        if (sampleTab === 'xlsx') {
            try {
                const res = await fetch('/api/servers/import/template?format=xlsx');
                if (!res.ok) throw new Error();
                triggerDownload(await res.blob(), 'termi-import-template.xlsx');
            } catch {
                setError('Could not download the Excel template. Try CSV instead.');
            }
            return;
        }

        const isCsv = sampleTab === 'csv';
        triggerDownload(
            new Blob([sampleText], {
                type: isCsv ? 'text/csv;charset=utf-8' : 'application/json',
            }),
            isCsv ? 'termi-import-template.csv' : 'termi-import-template.json',
        );
    }

    function triggerDownload(blob: Blob, filename: string) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    }

    async function onFileChosen(file: File) {
        setError('');
        setResult(null);

        if (file.size > MAX_FILE_BYTES) {
            setError('That file is too large to import (limit 8 MB).');
            return;
        }

        const text = await decodeFile(file);
        const type = detectFormat(file.name, text);
        setPreview(null);
        setKeychainId('');
        if (!type) {
            setContent('');
            setFileName(file.name);
            setError(
                "Termi can't read this file. Choose a Termi export, an OpenSSH config, a PuTTY .reg export, a MobaXterm sessions file or a CSV.",
            );
            return;
        }

        setContent(text);
        setFileName(file.name);
        setFileType(type);

        // Peek at a JSON file to decide whether to prompt for a passphrase. A
        // parse failure here is not fatal — the server gives the real verdict.
        if (type === 'json') {
            let encrypted = false;
            try {
                encrypted = JSON.parse(text)?.encrypted === true;
            } catch {
                /* the preview reports a broken file */
            }
            setIsEncrypted(encrypted);
            if (encrypted) return; // previewed once the passphrase is known
        } else {
            setIsEncrypted(false);
        }
        void loadPreview(text, type);
    }

    async function loadPreview(text: string, type: FileType, pass?: string) {
        setPreviewing(true);
        setError('');
        try {
            const res = await fetch('/api/servers/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content: text,
                    fileType: type,
                    passphrase: pass,
                    dryRun: true,
                }),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok || !data?.success) {
                setError(data?.error || `Could not read the file (${res.status}).`);
                return;
            }
            const p = data.data as Preview;
            setPreview(p);
            if (p.withCredentials < p.total && keychain.length === 0) {
                const kc = await fetch('/api/keychain')
                    .then((r) => r.json())
                    .catch(() => null);
                if (kc?.success) setKeychain(kc.data.entries ?? []);
            }
        } catch {
            setError('Could not read the file.');
        } finally {
            setPreviewing(false);
        }
    }

    async function runImport() {
        setBusy(true);
        setError('');
        setResult(null);

        try {
            const res = await fetch('/api/servers/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content,
                    fileType,
                    passphrase: isEncrypted ? passphrase : undefined,
                    onDuplicate,
                    keychainId: keychainId || undefined,
                }),
            });

            const data = await res.json().catch(() => null);

            if (res.status === 422) {
                // Encrypted file, passphrase missing — reveal the field and stop.
                setIsEncrypted(true);
                setError(data?.error || 'This file is encrypted. Enter its passphrase.');
                return;
            }

            if (!res.ok || !data?.success) {
                setError(data?.error || `Import failed (${res.status}).`);
                return;
            }

            setResult(data.data as ImportResult);
            onImported();
        } catch {
            setError('Import failed. Please try again.');
        } finally {
            setBusy(false);
        }
    }

    //   Result screen

    if (result) {
        return (
            <Dialog open onOpenChange={onClose}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <CheckCircle2 className="w-5 h-5 text-success" />
                            Import complete
                        </DialogTitle>
                    </DialogHeader>

                    <div className="space-y-3">
                        <div className="grid grid-cols-3 gap-2 text-center">
                            <Stat value={result.imported} label="Imported" tone="good" />
                            <Stat value={result.skipped} label="Skipped" tone="muted" />
                            <Stat value={result.failed.length} label="Failed" tone="bad" />
                        </div>

                        {result.notes && result.notes.length > 0 && (
                            <ul className="space-y-1 text-xs text-muted-foreground">
                                {result.notes.map((n, i) => (
                                    <li key={i} className="flex gap-2">
                                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-warning" />
                                        {n}
                                    </li>
                                ))}
                            </ul>
                        )}

                        {result.failed.length > 0 && (
                            <div className="space-y-1.5 max-h-48 overflow-y-auto">
                                <p className="text-xs text-muted-foreground">
                                    These rows were not imported:
                                </p>
                                {result.failed.map((f, i) => (
                                    <div
                                        key={i}
                                        className="flex items-start gap-2 text-xs p-2 rounded-sm bg-secondary/50"
                                    >
                                        <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-danger" />
                                        <span>
                                            <span className="font-medium">{f.name}</span> —{' '}
                                            {f.reason}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="flex justify-end">
                            <Button onClick={onClose}>Done</Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        );
    }

    //   Upload screen

    return (
        <Dialog open onOpenChange={onClose}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Upload className="w-5 h-5" />
                        Import servers
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    <input
                        ref={fileInputRef}
                        type="file"
                        className="hidden"
                        onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) onFileChosen(file);
                        }}
                    />

                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full flex flex-col items-center gap-2 p-6 rounded-lg border-2 border-dashed border-border hover:border-primary/50 transition-colors"
                    >
                        {fileName ? (
                            <>
                                {fileType === 'json' ? (
                                    <FileJson className="w-8 h-8 text-primary" />
                                ) : (
                                    <FileText className="w-8 h-8 text-primary" />
                                )}
                                <span className="text-sm font-medium">{fileName}</span>
                                <span className="text-xs text-muted-foreground">
                                    {content ? `${FORMAT_LABEL[fileType]} · ` : ''}Click to choose a
                                    different file
                                </span>
                            </>
                        ) : (
                            <>
                                <Upload className="w-8 h-8 text-muted-foreground" />
                                <span className="text-sm font-medium">Choose a file</span>
                                <span className="text-xs text-muted-foreground">
                                    Termi export, ~/.ssh/config, PuTTY, MobaXterm or CSV — up to 8
                                    MB
                                </span>
                            </>
                        )}
                    </button>

                    {/*   Format help   */}
                    <div className="rounded-lg border border-border">
                        <button
                            onClick={() => setShowFormat((s) => !s)}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                        >
                            {showFormat ? (
                                <ChevronDown className="w-4 h-4 shrink-0" />
                            ) : (
                                <ChevronRight className="w-4 h-4 shrink-0" />
                            )}
                            <span>Where do I get this file?</span>
                        </button>

                        {showFormat && (
                            <div className="px-3 pb-3 space-y-2 border-t border-border pt-3">
                                <ul className="space-y-1.5 text-xs text-muted-foreground">
                                    <li>
                                        <span className="text-foreground">OpenSSH:</span> choose{' '}
                                        <code>~/.ssh/config</code> (press ⌘⇧. in the macOS file
                                        picker to show hidden folders).
                                    </li>
                                    <li>
                                        <span className="text-foreground">PuTTY / KiTTY:</span> on
                                        Windows run{' '}
                                        <code>
                                            reg export HKCU\Software\SimonTatham\PuTTY\Sessions
                                            putty.reg
                                        </code>{' '}
                                        and choose <code>putty.reg</code>.
                                    </li>
                                    <li>
                                        <span className="text-foreground">MobaXterm:</span>{' '}
                                        right-click a session folder → Export, or choose{' '}
                                        <code>MobaXterm.ini</code>.
                                    </li>
                                    <li>
                                        <span className="text-foreground">Other clients:</span>{' '}
                                        export a CSV — columns like Label, Hostname, Port, Username
                                        and Group are recognised.
                                    </li>
                                </ul>
                                <p className="text-xs text-muted-foreground">
                                    Or build your own file.
                                    <span className="text-foreground">
                                        {' '}
                                        Only <code>Name</code> and <code>Host</code> are required
                                    </span>{' '}
                                    — protocol defaults to SSH, port to the protocol&apos;s default,
                                    and username to <code>root</code>.
                                </p>

                                <div className="flex items-center gap-1">
                                    <TabButton
                                        active={sampleTab === 'csv'}
                                        onClick={() => setSampleTab('csv')}
                                    >
                                        CSV
                                    </TabButton>
                                    <TabButton
                                        active={sampleTab === 'json'}
                                        onClick={() => setSampleTab('json')}
                                    >
                                        JSON
                                    </TabButton>
                                    <TabButton
                                        active={sampleTab === 'xlsx'}
                                        onClick={() => setSampleTab('xlsx')}
                                    >
                                        Excel
                                    </TabButton>

                                    <div className="ml-auto flex items-center gap-1">
                                        {/* Excel is binary — nothing to copy. */}
                                        {sampleTab !== 'xlsx' && (
                                            <button
                                                onClick={copySample}
                                                title="Copy sample"
                                                className="flex items-center gap-1 px-2 py-1 rounded-sm text-xs text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                                            >
                                                {copied ? (
                                                    <Check className="w-3.5 h-3.5 text-success" />
                                                ) : (
                                                    <Copy className="w-3.5 h-3.5" />
                                                )}
                                                {copied ? 'Copied' : 'Copy'}
                                            </button>
                                        )}
                                        <button
                                            onClick={downloadSample}
                                            title="Download as a template file"
                                            className="flex items-center gap-1 px-2 py-1 rounded-sm text-xs text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                                        >
                                            <FileDown className="w-3.5 h-3.5" />
                                            Template
                                        </button>
                                    </div>
                                </div>

                                {sampleTab === 'xlsx' ? (
                                    <SampleTable />
                                ) : (
                                    <pre className="text-[11px] leading-relaxed p-2.5 rounded-sm bg-secondary/50 overflow-x-auto">
                                        <code>{sampleText}</code>
                                    </pre>
                                )}

                                {sampleTab === 'xlsx' ? (
                                    <p className="text-[11px] text-muted-foreground">
                                        Download the template, fill it in Excel, then{' '}
                                        <span className="text-foreground">
                                            save it as CSV to import
                                        </span>{' '}
                                        — Termi reads spreadsheets as CSV. Leave the{' '}
                                        <code>Password</code> / <code>Private Key</code> columns
                                        blank unless you need them.
                                    </p>
                                ) : (
                                    <p className="text-[11px] text-muted-foreground">
                                        To include secrets, add <code>Password</code>,{' '}
                                        <code>Private Key</code>, <code>Key Passphrase</code> and{' '}
                                        <code>Notes</code> columns. To reach a server through a
                                        bastion, add a <code>Jump host</code> column with the
                                        bastion&apos;s name.
                                    </p>
                                )}
                            </div>
                        )}
                    </div>

                    {isEncrypted && (
                        <div className="space-y-1.5">
                            <Label
                                htmlFor="import-passphrase"
                                className="flex items-center gap-1.5"
                            >
                                <Lock className="w-3.5 h-3.5" />
                                Passphrase
                            </Label>
                            <Input
                                id="import-passphrase"
                                type="password"
                                placeholder="The passphrase used to encrypt this file"
                                value={passphrase}
                                onChange={(e) => setPassphrase(e.target.value)}
                                autoComplete="off"
                            />
                        </div>
                    )}

                    {isEncrypted && passphrase && !preview && (
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => loadPreview(content, fileType, passphrase)}
                            disabled={previewing}
                        >
                            Unlock and preview
                        </Button>
                    )}

                    {previewing && (
                        <p className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Reading the file…
                        </p>
                    )}

                    {preview && (
                        <PreviewPanel
                            preview={preview}
                            keychain={keychain}
                            keychainId={keychainId}
                            setKeychainId={setKeychainId}
                        />
                    )}

                    {content && (
                        <div className="space-y-1.5">
                            <Label>If a server of the same name already exists</Label>
                            <div className="grid grid-cols-2 gap-2">
                                <DupOption
                                    active={onDuplicate === 'skip'}
                                    title="Skip it"
                                    hint="Keep what you have"
                                    onClick={() => setOnDuplicate('skip')}
                                />
                                <DupOption
                                    active={onDuplicate === 'rename'}
                                    title="Import a copy"
                                    hint="Adds “(2)” to the name"
                                    onClick={() => setOnDuplicate('rename')}
                                />
                            </div>
                        </div>
                    )}

                    <div className="flex gap-2 p-3 rounded-lg bg-secondary/50 text-xs text-muted-foreground">
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>
                            Import only adds servers — it never overwrites or deletes existing ones.
                            Every host is safety-checked before it&apos;s saved.
                        </span>
                    </div>

                    {error && <p className="text-sm text-danger">{error}</p>}

                    <div className="flex justify-end gap-2">
                        <Button variant="ghost" onClick={onClose} disabled={busy}>
                            Cancel
                        </Button>
                        <Button
                            onClick={runImport}
                            disabled={busy || !content || (isEncrypted && !passphrase)}
                        >
                            {busy ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <Upload className="w-4 h-4" />
                            )}
                            {preview ? `Import ${preview.total}` : 'Import'}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

/**
 * Preview of the spreadsheet template as a scrollable table.
 *
 * Only the identifying columns are shown — the credential columns exist in the
 * downloaded file but are empty and pushing them into this preview would just
 * be a row of blanks. The full column list is stated in the caption.
 */
function SampleTable() {
    // Name, Host, Protocol, Port, Username, Group, Tags — the first seven.
    const shownCols = SAMPLE_COLUMNS.slice(0, 7);

    return (
        <div className="overflow-x-auto rounded-sm border border-border">
            <table className="w-full text-[11px] border-collapse">
                <thead>
                    <tr className="bg-secondary/70">
                        {shownCols.map((col) => (
                            <th
                                key={col}
                                className="px-2 py-1.5 text-left font-semibold whitespace-nowrap border-b border-border"
                            >
                                {col}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {SAMPLE_ROWS.map((row, r) => (
                        <tr key={r} className="odd:bg-transparent even:bg-secondary/30">
                            {shownCols.map((_, c) => (
                                <td
                                    key={c}
                                    className="px-2 py-1.5 whitespace-nowrap text-muted-foreground"
                                >
                                    {String(row[c] ?? '')}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function TabButton({
    active,
    onClick,
    children,
}: {
    active: boolean;
    onClick: () => void;
    children: React.ReactNode;
}) {
    return (
        <button
            onClick={onClick}
            className={`px-2.5 py-1 rounded-sm text-xs font-medium transition-colors ${
                active
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
            }`}
        >
            {children}
        </button>
    );
}

function Stat({
    value,
    label,
    tone,
}: {
    value: number;
    label: string;
    tone: 'good' | 'bad' | 'muted';
}) {
    const color =
        tone === 'good' ? 'text-success' : tone === 'bad' ? 'text-danger' : 'text-foreground';
    return (
        <div className="p-3 rounded-lg bg-secondary/50">
            <div className={`text-2xl font-bold ${color}`}>{value}</div>
            <div className="text-xs text-muted-foreground">{label}</div>
        </div>
    );
}

function DupOption({
    active,
    title,
    hint,
    onClick,
}: {
    active: boolean;
    title: string;
    hint: string;
    onClick: () => void;
}) {
    return (
        <button
            onClick={onClick}
            className={`p-3 rounded-lg border text-left transition-colors ${
                active
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:border-muted-foreground/40'
            }`}
        >
            <div className="text-sm font-medium">{title}</div>
            <div className="text-xs text-muted-foreground">{hint}</div>
        </button>
    );
}

/** What the file contains, before anything is written. */
function PreviewPanel({
    preview,
    keychain,
    keychainId,
    setKeychainId,
}: {
    preview: Preview;
    keychain: { id: string; label: string; username: string }[];
    keychainId: string;
    setKeychainId: (id: string) => void;
}) {
    const missing = preview.total - preview.withCredentials;
    return (
        <div className="space-y-3 rounded-lg border border-border p-3">
            <p className="text-sm">
                <span className="font-medium">
                    {preview.total} server{preview.total === 1 ? '' : 's'}
                </span>
                {preview.groups.length > 0 && (
                    <span className="text-muted-foreground">
                        {' '}
                        in {preview.groups.length} group{preview.groups.length === 1 ? '' : 's'}
                    </span>
                )}
            </p>

            <div className="max-h-48 overflow-auto rounded-sm border border-border">
                <table className="w-full border-collapse text-[11px]">
                    <thead className="sticky top-0 bg-secondary">
                        <tr>
                            {['Name', 'Address', 'User', 'Group', 'Via'].map((h) => (
                                <th
                                    key={h}
                                    className="whitespace-nowrap px-2 py-1.5 text-left font-semibold"
                                >
                                    {h}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {preview.servers.map((s, i) => (
                            <tr key={i} className="even:bg-secondary/30">
                                <td className="whitespace-nowrap px-2 py-1">{s.name}</td>
                                <td className="whitespace-nowrap px-2 py-1 text-muted-foreground">
                                    {s.protocol === 'SSH' ? '' : `${s.protocol} `}
                                    {s.host}:{s.port}
                                </td>
                                <td className="whitespace-nowrap px-2 py-1 text-muted-foreground">
                                    {s.username ?? '—'}
                                </td>
                                <td className="whitespace-nowrap px-2 py-1 text-muted-foreground">
                                    {s.group ?? ''}
                                </td>
                                <td className="whitespace-nowrap px-2 py-1 text-muted-foreground">
                                    {s.jump ?? ''}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {preview.servers.length < preview.total && (
                <p className="text-[11px] text-muted-foreground">
                    Showing the first {preview.servers.length}.
                </p>
            )}

            {preview.notes.length > 0 && (
                <ul className="space-y-1 text-xs text-muted-foreground">
                    {preview.notes.map((n, i) => (
                        <li key={i} className="flex gap-2">
                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                            {n}
                        </li>
                    ))}
                </ul>
            )}

            {missing > 0 && (
                <div className="space-y-1.5">
                    <Label htmlFor="import-keychain">
                        Login for the {missing} server{missing === 1 ? '' : 's'} without one
                    </Label>
                    {keychain.length > 0 ? (
                        <select
                            id="import-keychain"
                            value={keychainId}
                            onChange={(e) => setKeychainId(e.target.value)}
                            className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                        >
                            <option value="">None — I&apos;ll add credentials later</option>
                            {keychain.map((k) => (
                                <option key={k.id} value={k.id}>
                                    {k.label}
                                    {k.username ? ` (${k.username})` : ''}
                                </option>
                            ))}
                        </select>
                    ) : (
                        <p className="text-xs text-muted-foreground">
                            Save a login in Keys &amp; passwords first to apply it here, or add
                            credentials to each server after importing.
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}
