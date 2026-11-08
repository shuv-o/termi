'use client';

import { useState } from 'react';
import { startRegistration } from '@simplewebauthn/browser';
import { Check, Copy, KeySquare, Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { mutateCache, revalidate, useCachedFetch } from '@/lib/hooks/useCachedFetch';

interface KeysData {
    sshdConfigLine: string;
    keys: { id: string; label: string; authorizedKey: string; lastUsedAt: string | null }[];
}

function CopyButton({ text, label }: { text: string; label: string }) {
    const [done, setDone] = useState(false);
    return (
        <Button
            size="sm"
            variant="secondary"
            aria-label={label}
            onClick={() =>
                navigator.clipboard
                    .writeText(text)
                    .then(() => {
                        setDone(true);
                        setTimeout(() => setDone(false), 1500);
                    })
                    .catch(() => {})
            }
        >
            {done ? <Check /> : <Copy />}
        </Button>
    );
}

/**
 * FIDO2 security keys (YubiKey, Titan, …) as SSH keys: the private key never
 * leaves the device, and every login needs a touch.
 */
export function SecurityKeysSection() {
    const url = '/api/ssh-security-keys';
    const { data } = useCachedFetch<KeysData>(url);
    const [label, setLabel] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const add = async () => {
        setBusy(true);
        setError('');
        try {
            const opt = await fetch(`${url}/options`, { method: 'POST' }).then((r) => r.json());
            if (!opt.success) throw new Error(opt.error);
            const response = await startRegistration({ optionsJSON: opt.data.options });
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ label: label.trim() || 'Security key', response }),
            }).then((r) => r.json());
            if (!res.success) throw new Error(res.error);
            setLabel('');
            revalidate(url, url);
        } catch (err) {
            const msg = (err as Error).message;
            setError(
                /NotAllowed|cancel|timed out/i.test(msg)
                    ? 'Adding the key was cancelled.'
                    : msg || 'Could not add the security key',
            );
        } finally {
            setBusy(false);
        }
    };

    const remove = async (id: string) => {
        mutateCache<KeysData>(url, (prev) =>
            prev ? { ...prev, keys: prev.keys.filter((k) => k.id !== id) } : prev!,
        );
        await fetch(`${url}/${id}`, { method: 'DELETE' }).catch(() => {});
    };

    return (
        <Card className="space-y-3 p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
                <KeySquare className="h-4 w-4 text-primary" /> Security keys for SSH
            </h2>
            <p className="text-xs text-muted-foreground">
                Use a FIDO2 security key (YubiKey and similar) as an SSH key: the private key never
                leaves the device, and each login needs a touch. Add the key&apos;s line to the
                server&apos;s <code className="font-mono">~/.ssh/authorized_keys</code>, allow it in
                the server&apos;s <code className="font-mono">sshd_config</code>, then choose it in
                the server&apos;s settings. Works for terminals (someone has to touch the key).
            </p>
            {data?.sshdConfigLine && (
                <div className="flex items-center gap-2">
                    <code className="min-w-0 flex-1 truncate rounded-md bg-secondary px-2 py-1.5 font-mono text-xs">
                        {data.sshdConfigLine}
                    </code>
                    <CopyButton text={data.sshdConfigLine} label="Copy sshd_config line" />
                </div>
            )}
            {(data?.keys ?? []).map((k) => (
                <div key={k.id} className="space-y-1 rounded-lg border border-border p-2">
                    <div className="flex items-center gap-2">
                        <span className="flex-1 text-sm font-medium">{k.label}</span>
                        <CopyButton
                            text={k.authorizedKey}
                            label={`Copy public key of ${k.label}`}
                        />
                        <Button
                            size="sm"
                            variant="ghost"
                            aria-label={`Remove ${k.label}`}
                            onClick={() => remove(k.id)}
                        >
                            <Trash2 />
                        </Button>
                    </div>
                    <code
                        data-testid="security-key-line"
                        className="block truncate font-mono text-[11px] text-muted-foreground"
                    >
                        {k.authorizedKey}
                    </code>
                </div>
            ))}
            <div className="flex gap-2">
                <Input
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="Name, e.g. YubiKey 5C"
                    maxLength={40}
                    aria-label="Security key name"
                />
                <Button onClick={add} disabled={busy} className="shrink-0">
                    {busy ? <Loader2 className="animate-spin" /> : <Plus />} Add security key
                </Button>
            </div>
            {error && <p className="text-sm text-danger">{error}</p>}
        </Card>
    );
}
