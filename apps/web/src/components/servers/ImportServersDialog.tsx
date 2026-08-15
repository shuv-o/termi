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

interface Props {
    onClose: () => void;
    onImported: () => void;
}

interface ImportResult {
    imported: number;
    skipped: number;
    failed: { name: string; reason: string }[];
    total: number;
}

/** Matches MAX_CONTENT_LENGTH on the server, checked early for a clear message. */
const MAX_FILE_BYTES = 8 * 1024 * 1024;

export default function ImportServersDialog({ onClose, onImported }: Props) {
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [content, setContent] = useState('');
    const [fileType, setFileType] = useState<'json' | 'csv'>('json');
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
                triggerDownload(await res.blob(), 'termix-import-template.xlsx');
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
            isCsv ? 'termix-import-template.csv' : 'termix-import-template.json',
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

        const text = await file.text();
        const type = file.name.toLowerCase().endsWith('.csv') ? 'csv' : 'json';

        setContent(text);
        setFileName(file.name);
        setFileType(type);

        // Peek at a JSON file to decide whether to prompt for a passphrase. A
        // parse failure here is not fatal — the server gives the real verdict.
        if (type === 'json') {
            try {
                const parsed = JSON.parse(text);
                setIsEncrypted(parsed?.encrypted === true);
            } catch {
                setIsEncrypted(false);
            }
        } else {
            setIsEncrypted(false);
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
                            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                            Import complete
                        </DialogTitle>
                    </DialogHeader>

                    <div className="space-y-3">
                        <div className="grid grid-cols-3 gap-2 text-center">
                            <Stat value={result.imported} label="Imported" tone="good" />
                            <Stat value={result.skipped} label="Skipped" tone="muted" />
                            <Stat value={result.failed.length} label="Failed" tone="bad" />
                        </div>

                        {result.failed.length > 0 && (
                            <div className="space-y-1.5 max-h-48 overflow-y-auto">
                                <p className="text-xs text-muted-foreground">
                                    These rows were not imported:
                                </p>
                                {result.failed.map((f, i) => (
                                    <div
                                        key={i}
                                        className="flex items-start gap-2 text-xs p-2 rounded bg-secondary/50"
                                    >
                                        <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-destructive" />
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
                        accept=".json,.csv,application/json,text/csv"
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
                                {fileType === 'csv' ? (
                                    <FileText className="w-8 h-8 text-primary" />
                                ) : (
                                    <FileJson className="w-8 h-8 text-primary" />
                                )}
                                <span className="text-sm font-medium">{fileName}</span>
                                <span className="text-xs text-muted-foreground">
                                    Click to choose a different file
                                </span>
                            </>
                        ) : (
                            <>
                                <Upload className="w-8 h-8 text-muted-foreground" />
                                <span className="text-sm font-medium">
                                    Choose a Termix export file
                                </span>
                                <span className="text-xs text-muted-foreground">
                                    JSON or CSV, up to 8 MB
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
                            <span>What should the file look like?</span>
                        </button>

                        {showFormat && (
                            <div className="px-3 pb-3 space-y-2 border-t border-border pt-3">
                                <p className="text-xs text-muted-foreground">
                                    Import a file you exported from Termix, or build your own.
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
                                                className="flex items-center gap-1 px-2 py-1 rounded text-xs text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                                            >
                                                {copied ? (
                                                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                                                ) : (
                                                    <Copy className="w-3.5 h-3.5" />
                                                )}
                                                {copied ? 'Copied' : 'Copy'}
                                            </button>
                                        )}
                                        <button
                                            onClick={downloadSample}
                                            title="Download as a template file"
                                            className="flex items-center gap-1 px-2 py-1 rounded text-xs text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                                        >
                                            <FileDown className="w-3.5 h-3.5" />
                                            Template
                                        </button>
                                    </div>
                                </div>

                                {sampleTab === 'xlsx' ? (
                                    <SampleTable />
                                ) : (
                                    <pre className="text-[11px] leading-relaxed p-2.5 rounded bg-secondary/50 overflow-x-auto">
                                        <code>{sampleText}</code>
                                    </pre>
                                )}

                                {sampleTab === 'xlsx' ? (
                                    <p className="text-[11px] text-muted-foreground">
                                        Download the template, fill it in Excel, then{' '}
                                        <span className="text-foreground">
                                            save it as CSV to import
                                        </span>{' '}
                                        — Termix reads spreadsheets as CSV. Leave the{' '}
                                        <code>Password</code> / <code>Private Key</code> columns
                                        blank unless you need them.
                                    </p>
                                ) : (
                                    <p className="text-[11px] text-muted-foreground">
                                        To include secrets, add <code>Password</code>,{' '}
                                        <code>Private Key</code>, <code>Key Passphrase</code> and{' '}
                                        <code>Notes</code> columns.
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

                    {error && <p className="text-sm text-destructive">{error}</p>}

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
                            Import
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
        <div className="overflow-x-auto rounded border border-border">
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
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
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
        tone === 'good'
            ? 'text-emerald-500'
            : tone === 'bad'
              ? 'text-destructive'
              : 'text-foreground';
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
