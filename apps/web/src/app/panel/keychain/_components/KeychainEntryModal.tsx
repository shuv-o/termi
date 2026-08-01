'use client';

import { useState } from 'react';
import { Eye, EyeOff, Key, Loader2, Lock, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { EntryForm } from './types';

/** Password/private-key input with a reveal toggle. */
function SecretInput({
    value,
    onChange,
    multiline,
    placeholder,
}: {
    value: string;
    onChange: (v: string) => void;
    multiline?: boolean;
    placeholder: string;
}) {
    const [visible, setVisible] = useState(false);

    if (multiline) {
        // Textareas don't support type="password", so masking only applies to
        // the single-line password field below.
        return (
            <Textarea
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="min-h-[180px] resize-none bg-secondary font-mono text-xs leading-relaxed"
                placeholder={placeholder}
            />
        );
    }

    return (
        <div className="relative">
            <Input
                type={visible ? 'text' : 'password'}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="h-10 bg-secondary pr-10 text-sm"
                placeholder={placeholder}
            />
            <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setVisible((v) => !v)}
                className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
                {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </Button>
        </div>
    );
}

export function KeychainEntryModal({
    open,
    editing,
    form,
    onChange,
    saving,
    error,
    onSubmit,
    onClose,
}: {
    open: boolean;
    editing: boolean;
    form: EntryForm;
    onChange: (fields: Partial<EntryForm>) => void;
    saving: boolean;
    error: string;
    onSubmit: (e: React.FormEvent) => void;
    onClose: () => void;
}) {
    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="bg-card border-border max-w-lg">
                <DialogHeader>
                    <DialogTitle>
                        {editing ? 'Edit Keychain Entry' : 'New Keychain Entry'}
                    </DialogTitle>
                </DialogHeader>

                <form onSubmit={onSubmit} className="space-y-4">
                    <div className="flex gap-1 rounded-xl border border-border/50 bg-secondary/40 p-1">
                        {(['password', 'key'] as const).map((m) => (
                            <button
                                key={m}
                                type="button"
                                onClick={() => onChange({ authMethod: m })}
                                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-all ${
                                    form.authMethod === m
                                        ? 'bg-primary text-primary-foreground shadow-sm'
                                        : 'text-muted-foreground hover:text-foreground'
                                }`}
                            >
                                {m === 'password' ? (
                                    <Lock className="w-3 h-3" />
                                ) : (
                                    <Key className="w-3 h-3" />
                                )}
                                {m === 'password' ? 'Password' : 'SSH Key'}
                            </button>
                        ))}
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label className="text-xs">
                                Label <span className="text-red-400">*</span>
                            </Label>
                            <Input
                                value={form.label}
                                onChange={(e) => onChange({ label: e.target.value })}
                                className="h-10 bg-secondary text-sm"
                                placeholder="e.g. root@production"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs">
                                Username <span className="text-red-400">*</span>
                            </Label>
                            <Input
                                value={form.username}
                                onChange={(e) => onChange({ username: e.target.value })}
                                className="h-10 bg-secondary text-sm"
                                placeholder="root"
                            />
                        </div>
                    </div>

                    {form.authMethod === 'password' ? (
                        <div className="space-y-1.5">
                            <Label className="text-xs">
                                Password{' '}
                                {editing && (
                                    <span className="text-muted-foreground/50 font-normal">
                                        (leave blank to keep)
                                    </span>
                                )}
                            </Label>
                            <SecretInput
                                value={form.password}
                                onChange={(password) => onChange({ password })}
                                placeholder="••••••••"
                            />
                        </div>
                    ) : (
                        <>
                            <div className="space-y-1.5">
                                <Label className="text-xs">
                                    Private key{' '}
                                    {editing && (
                                        <span className="text-muted-foreground/50 font-normal">
                                            (leave blank to keep)
                                        </span>
                                    )}
                                </Label>
                                <SecretInput
                                    multiline
                                    value={form.privateKey}
                                    onChange={(privateKey) => onChange({ privateKey })}
                                    placeholder={
                                        '-----BEGIN OPENSSH PRIVATE KEY-----\n...\n-----END OPENSSH PRIVATE KEY-----'
                                    }
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs">
                                    Passphrase{' '}
                                    <span className="text-muted-foreground/50 font-normal">
                                        (if encrypted)
                                    </span>
                                </Label>
                                <SecretInput
                                    value={form.passphrase}
                                    onChange={(passphrase) => onChange({ passphrase })}
                                    placeholder="••••••••"
                                />
                            </div>
                        </>
                    )}

                    <p className="rounded-lg border border-border/50 bg-secondary/30 px-3 py-2.5 text-xs text-muted-foreground">
                        Termi encrypts these credentials before storing them.
                    </p>

                    {error && <p className="text-sm text-destructive">{error}</p>}

                    <div className="flex justify-end gap-2 pt-1">
                        <Button type="button" variant="secondary" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={saving} className="gap-1.5">
                            {saving ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                                <Save className="w-3.5 h-3.5" />
                            )}
                            {editing ? 'Update' : 'Save'}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
