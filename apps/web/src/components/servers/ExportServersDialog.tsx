'use client';

/**
 * Export dialog.
 *
 * The security story lives mostly on the server (step-up auth, rate limit,
 * audit log — see /api/servers/export). This component's job is to make the
 * *consequences* impossible to miss: it will not let the user produce an
 * unencrypted credential file without first choosing encryption or ticking a
 * box that spells out exactly what they are about to create.
 */

import { useState } from 'react';
import {
    Download,
    Lock,
    FileJson,
    FileSpreadsheet,
    FileText,
    ShieldAlert,
    Loader2,
    AlertTriangle,
    Fingerprint,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { webauthnAuthenticate, isPasskeySupported } from '@/lib/webauthn/client';

type Format = 'json' | 'xlsx' | 'csv';

const MIN_PASSPHRASE = 12;

interface Props {
    onClose: () => void;
}

const FORMATS: { value: Format; label: string; hint: string; icon: typeof FileJson }[] = [
    { value: 'json', label: 'JSON', hint: 'Can be encrypted · re-importable', icon: FileJson },
    { value: 'xlsx', label: 'Excel', hint: 'Spreadsheet · never encrypted', icon: FileSpreadsheet },
    { value: 'csv', label: 'CSV', hint: 'Plain text · re-importable', icon: FileText },
];

export default function ExportServersDialog({ onClose }: Props) {
    const [format, setFormat] = useState<Format>('json');
    const [includeCredentials, setIncludeCredentials] = useState(false);
    const [passphrase, setPassphrase] = useState('');
    const [confirmPassphrase, setConfirmPassphrase] = useState('');
    const [acknowledgePlaintext, setAcknowledgePlaintext] = useState(false);

    // Step-up auth
    const [authPassword, setAuthPassword] = useState('');
    const [authCode, setAuthCode] = useState('');

    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const canEncrypt = format === 'json';
    // Encryption is offered only for JSON and only when credentials are in play.
    const encrypting = canEncrypt && includeCredentials && passphrase.length > 0;

    // A plaintext credential file is the dangerous outcome: credentials, but no
    // passphrase protecting them.
    const willBePlaintextSecrets = includeCredentials && !encrypting;

    function validate(): string | null {
        if (encrypting) {
            if (passphrase.length < MIN_PASSPHRASE) {
                return `Passphrase must be at least ${MIN_PASSPHRASE} characters.`;
            }
            if (passphrase !== confirmPassphrase) {
                return 'Passphrases do not match.';
            }
        }
        if (willBePlaintextSecrets && !acknowledgePlaintext) {
            return 'Please acknowledge that this file will contain unencrypted secrets.';
        }
        if (!authPassword && !authCode) {
            // Passkey is handled separately; this covers the typed proofs.
            return null;
        }
        return null;
    }

    async function runExport(passkeyResponse?: unknown) {
        const validationError = validate();
        if (validationError) {
            setError(validationError);
            return;
        }
        if (!authPassword && !authCode && !passkeyResponse) {
            setError('Confirm your identity to export.');
            return;
        }

        setBusy(true);
        setError('');

        try {
            const res = await fetch('/api/servers/export', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    format,
                    includeCredentials,
                    passphrase: encrypting ? passphrase : undefined,
                    acknowledgePlaintext: willBePlaintextSecrets ? acknowledgePlaintext : undefined,
                    authPassword: authPassword || undefined,
                    authCode: authCode || undefined,
                    passkeyResponse,
                }),
            });

            if (!res.ok) {
                // The error body is JSON even though a success is a file.
                const data = await res.json().catch(() => null);
                setError(data?.error || `Export failed (${res.status}).`);
                return;
            }

            // Turn the response into a download.
            const blob = await res.blob();
            const filename =
                res.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] ??
                `termi-servers.${format}`;

            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);

            onClose();
        } catch {
            setError('Export failed. Please try again.');
        } finally {
            setBusy(false);
        }
    }

    async function exportWithPasskey() {
        setError('');
        try {
            if (!(await isPasskeySupported())) {
                setError('Passkeys are not available here. Use your password or 2FA code.');
                return;
            }

            const optionsRes = await fetch('/api/auth/passkey/authenticate-options', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            });
            const optionsData = await optionsRes.json().catch(() => ({}));
            if (!optionsRes.ok || !optionsData.success) {
                setError('Could not start passkey authentication.');
                return;
            }

            // The route returns the options object directly as `data`; the server
            // has already stashed the matching challenge in the session.
            const assertion = await webauthnAuthenticate(optionsData.data);
            await runExport(assertion);
        } catch {
            setError('Passkey authentication was cancelled or failed.');
        }
    }

    return (
        <Dialog open onOpenChange={onClose}>
            <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Download className="w-5 h-5" />
                        Export servers
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-5">
                    {/*   Format   */}
                    <div className="space-y-2">
                        <Label>Format</Label>
                        <div className="grid grid-cols-3 gap-2">
                            {FORMATS.map((f) => {
                                const Icon = f.icon;
                                const active = format === f.value;
                                return (
                                    <button
                                        key={f.value}
                                        onClick={() => setFormat(f.value)}
                                        className={`flex flex-col items-start gap-1 p-3 rounded-lg border text-left transition-colors ${
                                            active
                                                ? 'border-primary bg-primary/10'
                                                : 'border-border hover:border-muted-foreground/40'
                                        }`}
                                    >
                                        <Icon className="w-4 h-4" />
                                        <span className="text-sm font-medium">{f.label}</span>
                                        <span className="text-[10px] leading-tight text-muted-foreground">
                                            {f.hint}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/*   Credentials toggle   */}
                    <label className="flex items-start gap-3 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={includeCredentials}
                            onChange={(e) => {
                                setIncludeCredentials(e.target.checked);
                                setAcknowledgePlaintext(false);
                            }}
                            className="mt-1 accent-primary"
                        />
                        <span>
                            <span className="text-sm font-medium">Include credentials</span>
                            <span className="block text-xs text-muted-foreground">
                                Passwords, private keys, passphrases and notes. Without this, the
                                export lists only hosts, ports and usernames.
                            </span>
                        </span>
                    </label>

                    {/*   Encryption (JSON + credentials only)   */}
                    {canEncrypt && includeCredentials && (
                        <div className="space-y-3 pl-1 border-l-2 border-primary/30 pl-4">
                            <div className="flex items-center gap-2 text-sm font-medium">
                                <Lock className="w-4 h-4" />
                                Encrypt the file (recommended)
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Protects the file with a passphrase you choose. You&apos;ll need it
                                to import again — it cannot be recovered.
                            </p>
                            <div className="grid gap-2">
                                <Input
                                    type="password"
                                    placeholder={`Passphrase (min ${MIN_PASSPHRASE} chars)`}
                                    value={passphrase}
                                    onChange={(e) => setPassphrase(e.target.value)}
                                    autoComplete="new-password"
                                />
                                <Input
                                    type="password"
                                    placeholder="Confirm passphrase"
                                    value={confirmPassphrase}
                                    onChange={(e) => setConfirmPassphrase(e.target.value)}
                                    autoComplete="new-password"
                                />
                            </div>
                        </div>
                    )}

                    {/*   Plaintext warning   */}
                    {willBePlaintextSecrets && (
                        <div className="space-y-3 p-3 rounded-lg bg-destructive/10 border border-destructive/30">
                            <div className="flex gap-2 text-sm text-destructive">
                                <ShieldAlert className="w-5 h-5 shrink-0" />
                                <div>
                                    <p className="font-semibold">
                                        This file will contain unencrypted secrets
                                    </p>
                                    <p className="text-xs mt-1 text-destructive/90">
                                        Anyone who opens it can read every password and private key.
                                        Store it somewhere encrypted, and delete it as soon as
                                        you&apos;re done.
                                        {format !== 'json' &&
                                            ' Spreadsheet formats cannot be encrypted — choose JSON if you need protection.'}
                                    </p>
                                </div>
                            </div>
                            <label className="flex items-start gap-2 cursor-pointer text-xs">
                                <input
                                    type="checkbox"
                                    checked={acknowledgePlaintext}
                                    onChange={(e) => setAcknowledgePlaintext(e.target.checked)}
                                    className="mt-0.5 accent-destructive"
                                />
                                <span>
                                    I understand this file will hold my credentials in plain text.
                                </span>
                            </label>
                        </div>
                    )}

                    {/*   Step-up auth   */}
                    <div className="space-y-3 pt-2 border-t border-border">
                        <div className="flex items-start gap-2 text-xs text-muted-foreground">
                            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                            <span>
                                Exporting reveals your saved connections, so we need to confirm
                                it&apos;s you.
                            </span>
                        </div>

                        <div className="grid gap-2">
                            <div className="space-y-1.5">
                                <Label htmlFor="export-password">Account password</Label>
                                <Input
                                    id="export-password"
                                    type="password"
                                    placeholder="Your login password"
                                    value={authPassword}
                                    onChange={(e) => setAuthPassword(e.target.value)}
                                    autoComplete="current-password"
                                />
                            </div>
                            <div className="text-center text-[11px] uppercase tracking-wide text-muted-foreground">
                                or
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="export-code">2FA code</Label>
                                <Input
                                    id="export-code"
                                    inputMode="numeric"
                                    placeholder="6-digit code"
                                    value={authCode}
                                    onChange={(e) => setAuthCode(e.target.value)}
                                    autoComplete="one-time-code"
                                />
                            </div>
                        </div>

                        <Button
                            variant="outline"
                            className="w-full"
                            onClick={exportWithPasskey}
                            disabled={busy}
                        >
                            <Fingerprint className="w-4 h-4" />
                            Use a passkey instead
                        </Button>
                    </div>

                    {error && <p className="text-sm text-destructive">{error}</p>}

                    <div className="flex justify-end gap-2 pt-1">
                        <Button variant="ghost" onClick={onClose} disabled={busy}>
                            Cancel
                        </Button>
                        <Button onClick={() => runExport()} disabled={busy}>
                            {busy ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <Download className="w-4 h-4" />
                            )}
                            Export
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
