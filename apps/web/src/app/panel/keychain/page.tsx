'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
    ArrowLeft,
    BookKey,
    Plus,
    Trash2,
    Pencil,
    Eye,
    EyeOff,
    Lock,
    Key,
    Loader2,
    CheckCircle2,
    X,
    Save,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';

interface KeychainEntry {
    id: string;
    label: string;
    username: string;
    hasPassword: boolean;
    hasPrivateKey: boolean;
    createdAt: string;
}

interface EntryForm {
    label: string;
    username: string;
    authMethod: 'password' | 'key';
    password: string;
    privateKey: string;
    passphrase: string;
}

const emptyForm = (): EntryForm => ({
    label: '',
    username: '',
    authMethod: 'password',
    password: '',
    privateKey: '',
    passphrase: '',
});

export default function KeychainPage() {
    const [entries, setEntries] = useState<KeychainEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);
    const [form, setForm] = useState<EntryForm>(emptyForm());
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showPassphrase, setShowPassphrase] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [successMsg, setSuccessMsg] = useState('');

    const update = (fields: Partial<EntryForm>) => setForm((f) => ({ ...f, ...fields }));

    const fetchEntries = async () => {
        try {
            const res = await fetch('/api/keychain');
            const data = await res.json();
            if (data.success) setEntries(data.data.entries);
        } catch {
            // ignore
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchEntries();
    }, []);

    const flash = (msg: string) => {
        setSuccessMsg(msg);
        setTimeout(() => setSuccessMsg(''), 3000);
    };

    const openCreate = () => {
        setEditId(null);
        setForm(emptyForm());
        setFormError('');
        setShowPassword(false);
        setShowPassphrase(false);
        setShowForm(true);
    };

    const openEdit = async (id: string) => {
        setEditId(id);
        setFormError('');
        setShowPassword(false);
        setShowPassphrase(false);
        try {
            const res = await fetch(`/api/keychain/${id}`);
            const data = await res.json();
            if (data.success) {
                const e = data.data.entry;
                setForm({
                    label: e.label,
                    username: e.username,
                    authMethod: e.privateKey ? 'key' : 'password',
                    password: e.password ?? '',
                    privateKey: e.privateKey ?? '',
                    passphrase: e.passphrase ?? '',
                });
                setShowForm(true);
            }
        } catch {
            // ignore
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormError('');
        if (!form.label.trim()) {
            setFormError('Label is required');
            return;
        }
        if (!form.username.trim()) {
            setFormError('Username is required');
            return;
        }
        if (form.authMethod === 'password' && !form.password.trim() && !editId) {
            setFormError('Password is required');
            return;
        }
        if (form.authMethod === 'key' && !form.privateKey.trim() && !editId) {
            setFormError('Private key is required');
            return;
        }

        setSaving(true);
        try {
            const body = {
                label: form.label.trim(),
                username: form.username.trim(),
                password: form.authMethod === 'password' ? form.password || undefined : undefined,
                privateKey: form.authMethod === 'key' ? form.privateKey || undefined : undefined,
                passphrase: form.authMethod === 'key' ? form.passphrase || undefined : undefined,
            };

            const res = await fetch(editId ? `/api/keychain/${editId}` : '/api/keychain', {
                method: editId ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const data = await res.json();
            if (!data.success) {
                setFormError(data.error || 'Failed to save');
                return;
            }
            setShowForm(false);
            setEditId(null);
            await fetchEntries();
            flash(editId ? 'Keychain entry updated' : 'Keychain entry created');
        } catch {
            setFormError('An error occurred');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        setDeletingId(id);
        try {
            await fetch(`/api/keychain/${id}`, { method: 'DELETE' });
            setEntries((prev) => prev.filter((e) => e.id !== id));
            flash('Keychain entry deleted');
        } catch {
            // ignore
        } finally {
            setDeletingId(null);
        }
    };

    return (
        <div className="space-y-6">
            <div className="-mx-4 sticky top-0 z-10 border-b border-border bg-background/95 px-4 py-3 backdrop-blur-sm lg:-mx-8 lg:px-8">
                <div className="mx-auto flex max-w-screen-2xl items-center gap-3">
                    <Button variant="ghost" size="icon" asChild className="h-9 w-9 rounded-xl">
                        <Link href="/panel">
                            <ArrowLeft className="w-4 h-4" />
                        </Link>
                    </Button>
                    <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                            Encrypted credentials
                        </p>
                        <h1 className="flex items-center gap-2 text-xl font-semibold">
                            <BookKey className="h-5 w-5 text-primary" />
                            Keychain
                        </h1>
                    </div>
                    <Button onClick={openCreate} className="h-10 gap-1.5 px-4">
                        <Plus className="w-4 h-4" />
                        New Entry
                    </Button>
                </div>
            </div>

            <div className="mx-auto max-w-screen-2xl space-y-6">
                <p className="text-sm text-muted-foreground">
                    Reusable encrypted credentials for your servers.
                </p>

                {successMsg && (
                    <div className="flex items-center gap-2 rounded-xl border border-green-500/20 bg-green-500/10 px-4 py-2.5 text-sm text-green-400">
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        {successMsg}
                    </div>
                )}

                {showForm && (
                    <Card className="mx-auto mb-6 max-w-4xl border-border hover:border-border/80 transition-all duration-200">
                        <CardContent className="p-6">
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                                    {editId ? 'Update entry' : 'Create entry'}
                                </p>
                                <h2 className="mt-1 text-lg font-semibold">
                                {editId ? 'Edit Keychain Entry' : 'New Keychain Entry'}
                                </h2>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowForm(false)}
                                className="text-muted-foreground hover:text-foreground"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <form onSubmit={handleSave} className="space-y-6">
                            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)]">
                                <div className="space-y-6">
                                    <div className="grid gap-4 md:grid-cols-2">
                                        <div className="space-y-1.5">
                                            <Label className="text-xs uppercase tracking-widest text-muted-foreground">
                                        Label <span className="text-red-400">*</span>
                                            </Label>
                                            <Input
                                                value={form.label}
                                                onChange={(e) => update({ label: e.target.value })}
                                                className="h-10 bg-secondary text-sm"
                                                placeholder="e.g. root@production"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label className="text-xs uppercase tracking-widest text-muted-foreground">
                                        Username <span className="text-red-400">*</span>
                                            </Label>
                                            <Input
                                                value={form.username}
                                                onChange={(e) => update({ username: e.target.value })}
                                                className="h-10 bg-secondary text-sm"
                                                placeholder="root"
                                            />
                                        </div>
                                    </div>

                                    {form.authMethod === 'password' ? (
                                        <div className="space-y-1.5">
                                            <Label className="text-xs uppercase tracking-widest text-muted-foreground">
                                                Password
                                                {editId && (
                                                    <span className="ml-1 text-muted-foreground/50 normal-case tracking-normal">
                                                        (leave blank to keep)
                                                    </span>
                                                )}
                                            </Label>
                                            <div className="relative">
                                                <Input
                                                    type={showPassword ? 'text' : 'password'}
                                                    value={form.password}
                                                    onChange={(e) =>
                                                        update({ password: e.target.value })
                                                    }
                                                    className="h-10 bg-secondary pr-10 text-sm"
                                                    placeholder="••••••••"
                                                />
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => setShowPassword(!showPassword)}
                                                    className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                                >
                                                    {showPassword ? (
                                                        <EyeOff className="w-4 h-4" />
                                                    ) : (
                                                        <Eye className="w-4 h-4" />
                                                    )}
                                                </Button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-1.5">
                                            <Label className="text-xs uppercase tracking-widest text-muted-foreground">
                                                Private key
                                                {editId && (
                                                    <span className="ml-1 text-muted-foreground/50 normal-case tracking-normal">
                                                        (leave blank to keep)
                                                    </span>
                                                )}
                                            </Label>
                                            <Textarea
                                                value={form.privateKey}
                                                onChange={(e) =>
                                                    update({ privateKey: e.target.value })
                                                }
                                                className="min-h-[220px] resize-none bg-secondary font-mono text-xs leading-relaxed"
                                                placeholder={
                                                    '-----BEGIN OPENSSH PRIVATE KEY-----\n...\n-----END OPENSSH PRIVATE KEY-----'
                                                }
                                            />
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-4 rounded-2xl border border-border/60 bg-secondary/20 p-4">
                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                                            Authentication
                                        </p>
                                        <div className="mt-3 flex gap-1 rounded-xl border border-border/50 bg-background/60 p-1">
                                            {(['password', 'key'] as const).map((m) => (
                                                <button
                                                    key={m}
                                                    type="button"
                                                    onClick={() => update({ authMethod: m })}
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
                                    </div>

                                    {form.authMethod === 'key' && (
                                        <div className="space-y-1.5">
                                            <Label className="text-xs uppercase tracking-widest text-muted-foreground">
                                                Passphrase{' '}
                                                <span className="normal-case tracking-normal text-muted-foreground/50">
                                                    (if encrypted)
                                                </span>
                                            </Label>
                                            <div className="relative">
                                                <Input
                                                    type={showPassphrase ? 'text' : 'password'}
                                                    value={form.passphrase}
                                                    onChange={(e) =>
                                                        update({ passphrase: e.target.value })
                                                    }
                                                    className="h-10 bg-secondary pr-10 text-sm"
                                                    placeholder="••••••••"
                                                />
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() =>
                                                        setShowPassphrase(!showPassphrase)
                                                    }
                                                    className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                                >
                                                    {showPassphrase ? (
                                                        <EyeOff className="w-4 h-4" />
                                                    ) : (
                                                        <Eye className="w-4 h-4" />
                                                    )}
                                                </Button>
                                            </div>
                                        </div>
                                    )}

                                    <div className="rounded-xl border border-border/50 bg-background/70 p-4 text-sm text-muted-foreground">
                                        Termi encrypts these credentials before storing them.
                                    </div>
                                </div>
                            </div>

                            {formError && (
                                <p className="text-sm text-destructive">{formError}</p>
                            )}

                            <div className="flex justify-end gap-2 pt-1">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    onClick={() => setShowForm(false)}
                                    className="h-10 px-4"
                                >
                                    Cancel
                                </Button>
                                <Button type="submit" disabled={saving} className="h-10 gap-1.5 px-4">
                                    {saving ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                        <Save className="w-3.5 h-3.5" />
                                    )}
                                    {editId ? 'Update' : 'Save'}
                                </Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>
                )}

                {loading ? (
                    <div className="flex h-32 items-center justify-center">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                ) : entries.length === 0 ? (
                    <Card className="border-border">
                        <CardContent className="flex min-h-[320px] flex-col items-center justify-center gap-4 py-14 text-center">
                            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-secondary/30">
                                <BookKey className="h-8 w-8 text-muted-foreground/40" />
                            </div>
                            <div>
                                <h2 className="text-lg font-semibold">No keychain entries yet</h2>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    Save reusable credentials once, then attach them to servers in seconds.
                                </p>
                            </div>
                            <Button onClick={openCreate} variant="secondary" className="h-10 gap-1.5 px-4">
                                <Plus className="w-4 h-4" />
                                Create your first entry
                            </Button>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {entries.map((entry) => (
                            <Card
                                key={entry.id}
                                className="border-border hover:border-border/80 hover:shadow-md transition-all duration-200"
                            >
                                <CardContent className="flex h-full flex-col gap-4 p-5">
                                    <div className="flex items-start justify-between gap-3">
                                        <div
                                            className={`flex h-11 w-11 items-center justify-center rounded-xl border shrink-0 ${
                                                entry.hasPrivateKey
                                                    ? 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                                                    : 'border-primary/30 bg-primary/10 text-primary'
                                            }`}
                                        >
                                            {entry.hasPrivateKey ? (
                                                <Key className="w-5 h-5" />
                                            ) : (
                                                <Lock className="w-5 h-5" />
                                            )}
                                        </div>
                                        <span
                                            className={`inline-flex items-center rounded-full border px-2 py-1 text-[10px] font-medium ${
                                                entry.hasPrivateKey
                                                    ? 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                                                    : 'border-primary/30 bg-primary/10 text-primary'
                                            }`}
                                        >
                                            {entry.hasPrivateKey ? 'SSH key' : 'Password'}
                                        </span>
                                    </div>

                                    <div className="min-w-0">
                                        <p className="truncate text-base font-semibold">{entry.label}</p>
                                        <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                                            {entry.username}
                                        </p>
                                    </div>

                                    <div className="mt-auto flex items-center justify-between gap-2 border-t border-border/60 pt-4">
                                        <p className="text-[11px] text-muted-foreground">
                                            Added {new Date(entry.createdAt).toLocaleDateString()}
                                        </p>
                                        <div className="flex items-center gap-1">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-9 w-9 rounded-lg text-muted-foreground hover:text-foreground"
                                                onClick={() => openEdit(entry.id)}
                                            >
                                                <Pencil className="w-4 h-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-9 w-9 rounded-lg text-muted-foreground hover:text-destructive"
                                                onClick={() => handleDelete(entry.id)}
                                                disabled={deletingId === entry.id}
                                            >
                                                {deletingId === entry.id ? (
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                ) : (
                                                    <Trash2 className="w-4 h-4" />
                                                )}
                                            </Button>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
