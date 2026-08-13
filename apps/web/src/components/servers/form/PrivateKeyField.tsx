'use client';

import { useState } from 'react';
import { FileKey, Key, Upload } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const KEY_PLACEHOLDER =
    '-----BEGIN OPENSSH PRIVATE KEY-----\n...\n-----END OPENSSH PRIVATE KEY-----';

type KeyInputMethod = 'paste' | 'file';

function MethodToggle({
    method,
    onChange,
}: {
    method: KeyInputMethod;
    onChange: (m: KeyInputMethod) => void;
}) {
    return (
        <div className="flex w-fit gap-1 rounded-lg border border-border/50 bg-background/60 p-1">
            {(['paste', 'file'] as const).map((m) => (
                <button
                    key={m}
                    type="button"
                    onClick={() => onChange(m)}
                    className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                        method === m
                            ? 'bg-secondary text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground'
                    }`}
                >
                    {m === 'paste' ? <Key className="w-3 h-3" /> : <Upload className="w-3 h-3" />}
                    {m === 'paste' ? 'Paste Key' : 'Upload File'}
                </button>
            ))}
        </div>
    );
}

function KeyFileDropzone({
    fileName,
    onFile,
}: {
    fileName: string | null;
    onFile: (name: string, contents: string) => void;
}) {
    return (
        <div className="space-y-1.5">
            <Label className="text-xs">Key File (.pem, .ppk)</Label>
            <label
                className={`flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 transition-colors ${
                    fileName
                        ? 'border-emerald-500/40 bg-emerald-500/5 hover:bg-emerald-500/8'
                        : 'border-border bg-secondary/40 hover:border-border/80 hover:bg-accent/20'
                }`}
            >
                <input
                    type="file"
                    accept=".pem,.ppk,application/x-pem-file"
                    className="sr-only"
                    onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = (ev) =>
                            onFile(file.name, (ev.target?.result as string) ?? '');
                        reader.readAsText(file);
                    }}
                />
                {fileName ? (
                    <>
                        <FileKey className="w-5 h-5 text-emerald-400" />
                        <span className="break-all text-center text-xs font-medium text-emerald-400">
                            {fileName}
                        </span>
                        <span className="text-[10px] text-muted-foreground">Click to replace</span>
                    </>
                ) : (
                    <>
                        <Upload className="w-5 h-5 text-muted-foreground" />
                        <span className="text-center text-xs text-muted-foreground">
                            Click to select a <span className="font-mono">.pem</span> or{' '}
                            <span className="font-mono">.ppk</span> file
                        </span>
                    </>
                )}
            </label>
        </div>
    );
}

/**
 * Private key entry. Create mode offers paste-or-upload; edit mode is
 * paste-only, since a blank field means "keep the stored key".
 */
export function PrivateKeyField({
    value,
    onChange,
    label,
    allowFileUpload,
}: {
    value: string;
    onChange: (v: string) => void;
    label: React.ReactNode;
    allowFileUpload: boolean;
}) {
    const [method, setMethod] = useState<KeyInputMethod>('paste');
    const [fileName, setFileName] = useState<string | null>(null);

    const changeMethod = (m: KeyInputMethod) => {
        setMethod(m);
        // Switching back to paste clears whatever the file put in the field.
        if (m === 'paste') {
            setFileName(null);
            onChange('');
        }
    };

    return (
        <>
            {allowFileUpload && <MethodToggle method={method} onChange={changeMethod} />}

            {allowFileUpload && method === 'file' ? (
                <KeyFileDropzone
                    fileName={fileName}
                    onFile={(name, contents) => {
                        setFileName(name);
                        onChange(contents);
                    }}
                />
            ) : (
                <div className="space-y-1.5">
                    <Label className="text-xs">{label}</Label>
                    <Textarea
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        className="min-h-[140px] resize-none bg-secondary font-mono text-xs leading-relaxed"
                        placeholder={KEY_PLACEHOLDER}
                    />
                </div>
            )}
        </>
    );
}
