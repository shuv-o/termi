'use client';

import { useState } from 'react';
import Link from 'next/link';
import { BookKey, CheckCircle2, Eye, EyeOff, Key, KeyRound, Lock, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { PrivateKeyField } from './PrivateKeyField';
import { isSshLike, type AuthMethod, type StoredCredentials } from './types';
import type { ServerFormState } from './useServerForm';

/** Password/passphrase input with a reveal toggle. */
function SecretInput({
    value,
    onChange,
    autoComplete,
}: {
    value: string;
    onChange: (v: string) => void;
    autoComplete?: string;
}) {
    const [visible, setVisible] = useState(false);
    return (
        <div className="relative">
            <Input
                type={visible ? 'text' : 'password'}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="h-9 bg-secondary pr-10 text-sm"
                placeholder="••••••••"
                autoComplete={autoComplete}
            />
            <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setVisible(!visible)}
                className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
                {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </Button>
        </div>
    );
}

/** Small "credential already saved" hint shown in edit mode. */
function StoredHint({ icon: Icon, children }: { icon: React.ElementType; children: string }) {
    return (
        <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/60 px-3 py-2 text-[11px] text-muted-foreground">
            <Icon className="w-3 h-3 text-green-500/70" />
            {children}
        </div>
    );
}

export function AuthCard({
    state,
    mode,
    storedCreds,
}: {
    state: ServerFormState;
    mode: 'create' | 'edit';
    storedCreds: StoredCredentials;
}) {
    const {
        form,
        update,
        keychainEntries,
        credSource,
        setCredSource,
        selectedKeychainId,
        setSelectedKeychainId,
        applyKeychain,
        saveToKeychain,
        setSaveToKeychain,
        keychainLabel,
        setKeychainLabel,
    } = state;

    const isEdit = mode === 'edit';
    const keychainCheckboxId = `${mode}-save-keychain`;

    return (
        <Card className="border-border hover:border-border/80 transition-all duration-200">
            <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                        Authentication
                    </p>
                    <div className="flex gap-1 rounded-lg border border-border/50 bg-background/60 p-1">
                        {(['new', 'keychain'] as const).map((src) => (
                            <button
                                key={src}
                                type="button"
                                onClick={() => {
                                    setCredSource(src);
                                    if (src === 'new') setSelectedKeychainId('');
                                }}
                                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
                                    credSource === src
                                        ? 'bg-primary text-primary-foreground shadow-sm'
                                        : 'text-muted-foreground hover:text-foreground'
                                }`}
                            >
                                {src === 'keychain' ? (
                                    <BookKey className="w-3 h-3" />
                                ) : (
                                    <KeyRound className="w-3 h-3" />
                                )}
                                {src === 'keychain' ? 'Keychain' : 'New'}
                            </button>
                        ))}
                    </div>
                </div>

                {credSource === 'keychain' && (
                    <div className="space-y-2">
                        {keychainEntries.length === 0 ? (
                            <p className="py-2 text-center text-xs text-muted-foreground">
                                No keychain entries yet.{' '}
                                <Link href="/panel/keychain" className="text-primary underline">
                                    Create one
                                </Link>{' '}
                                first.
                            </p>
                        ) : (
                            <div className="space-y-1.5">
                                <Label className="text-xs">Select keychain entry</Label>
                                <Select
                                    value={selectedKeychainId || 'none'}
                                    onValueChange={(v) => {
                                        const id = v === 'none' ? '' : v;
                                        setSelectedKeychainId(id);
                                        if (id) applyKeychain(id);
                                    }}
                                >
                                    <SelectTrigger className="h-9 bg-secondary border-border text-sm">
                                        <SelectValue placeholder="Choose a keychain entry…" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-card border-border">
                                        <SelectItem value="none">— Choose an entry —</SelectItem>
                                        {keychainEntries.map((kc) => (
                                            <SelectItem key={kc.id} value={kc.id}>
                                                <span className="font-medium">{kc.label}</span>
                                                <span className="ml-2 text-xs text-muted-foreground">
                                                    {kc.username}
                                                </span>
                                                <span className="ml-1.5 text-[10px] text-muted-foreground/60">
                                                    {kc.hasPrivateKey ? '(SSH key)' : '(password)'}
                                                </span>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {selectedKeychainId && (
                                    <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                        <CheckCircle2 className="w-3 h-3 text-green-400" />
                                        Credentials loaded from keychain
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {credSource === 'new' && (
                    <>
                        {isSshLike(form.protocol) && (
                            <div className="flex w-fit gap-1 rounded-lg border border-border/50 bg-background/60 p-1">
                                {(['password', 'key'] as AuthMethod[]).map((method) => (
                                    <button
                                        key={method}
                                        type="button"
                                        onClick={() => update({ authMethod: method })}
                                        className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                                            form.authMethod === method
                                                ? 'bg-primary text-primary-foreground shadow-sm'
                                                : 'text-muted-foreground hover:text-foreground'
                                        }`}
                                    >
                                        {method === 'password' ? (
                                            <Lock className="w-3 h-3" />
                                        ) : (
                                            <Key className="w-3 h-3" />
                                        )}
                                        {method === 'password' ? 'Password' : 'SSH Key'}
                                    </button>
                                ))}
                            </div>
                        )}

                        {form.authMethod === 'password' && storedCreds.hasPassword && (
                            <StoredHint icon={Lock}>
                                Password saved — leave blank to keep it, or enter a new one to
                                replace it
                            </StoredHint>
                        )}
                        {form.authMethod === 'key' && storedCreds.hasPrivateKey && (
                            <StoredHint icon={Key}>
                                Private key saved — leave blank to keep it, or paste a new key to
                                replace it
                            </StoredHint>
                        )}

                        {form.authMethod === 'password' && (
                            <div className="space-y-1.5">
                                <Label className="text-xs">
                                    {isEdit ? (
                                        <>
                                            New Password{' '}
                                            <span className="text-muted-foreground/50">
                                                (leave blank to keep existing)
                                            </span>
                                        </>
                                    ) : (
                                        'Password'
                                    )}
                                </Label>
                                <SecretInput
                                    value={form.password}
                                    onChange={(password) => update({ password })}
                                    autoComplete={isEdit ? 'new-password' : undefined}
                                />
                            </div>
                        )}

                        {form.authMethod === 'key' && (
                            <div className="space-y-3">
                                <PrivateKeyField
                                    value={form.privateKey}
                                    onChange={(privateKey) => update({ privateKey })}
                                    allowFileUpload={!isEdit}
                                    label={
                                        isEdit ? (
                                            <>
                                                New Private Key{' '}
                                                <span className="text-muted-foreground/50">
                                                    (leave blank to keep existing)
                                                </span>
                                            </>
                                        ) : (
                                            'Private Key'
                                        )
                                    }
                                />
                                <div className="space-y-1.5">
                                    <Label className="text-xs">
                                        Passphrase{' '}
                                        <span className="text-muted-foreground/50">
                                            {storedCreds.hasPassphrase
                                                ? '(leave blank to keep existing)'
                                                : '(if encrypted)'}
                                        </span>
                                    </Label>
                                    <SecretInput
                                        value={form.passphrase}
                                        onChange={(passphrase) => update({ passphrase })}
                                        autoComplete={isEdit ? 'new-password' : undefined}
                                    />
                                </div>
                            </div>
                        )}

                        <div className="space-y-2 border-t border-border/60 pt-2">
                            <div className="flex items-center gap-2">
                                <Checkbox
                                    id={keychainCheckboxId}
                                    checked={saveToKeychain}
                                    onCheckedChange={(v) => setSaveToKeychain(v === true)}
                                    className="h-4 w-4"
                                />
                                <label
                                    htmlFor={keychainCheckboxId}
                                    className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground"
                                >
                                    <Save className="w-3 h-3" />
                                    Save these credentials to Keychain
                                </label>
                            </div>
                            {saveToKeychain && (
                                <Input
                                    type="text"
                                    value={keychainLabel}
                                    onChange={(e) => setKeychainLabel(e.target.value)}
                                    className="h-9 bg-secondary text-sm"
                                    placeholder="Label (e.g. root@production)"
                                />
                            )}
                        </div>
                    </>
                )}
            </CardContent>
        </Card>
    );
}
