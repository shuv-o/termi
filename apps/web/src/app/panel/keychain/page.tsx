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
        <div className="max-w-3xl mx-auto">
            {/* Header */}
            <div className="flex items-center gap-3 mb-5">
                <Button variant="ghost" size="icon" asChild className="h-8 w-8">
                    <Link href="/panel">
                        <ArrowLeft className="w-4 h-4" />
                    </Link>
                </Button>
                <div className="flex-1">
                    <h1 className="text-xl font-semibold flex items-center gap-2">
                        <BookKey className="w-5 h-5 text-primary" />
                        Keychain
                    </h1>
                    <p className="text-muted-foreground text-sm">
                        Reusable encrypted credentials for your servers
                    </p>
                </div>
                <Button size="sm" onClick={openCreate} className="gap-1.5">
                    <Plus className="w-4 h-4" />
                    New Entry
                </Button>
            </div>

            {successMsg && (
                <div className="mb-4 flex items-center gap-2 text-sm text-green-400 bg-green-500/10 border border-green-500/20 rounded-lg px-4 py-2.5">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    {successMsg}
                </div>
            )}

            {/* Create / Edit Form */}
            {showForm && (
                <Card className="mb-4">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-sm font-semibold">
                                {editId ? 'Edit Keychain Entry' : 'New Keychain Entry'}
                            </h2>
                            <button
                                type="button"
                                onClick={() => setShowForm(false)}
                                className="text-muted-foreground hover:text-foreground"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <form onSubmit={handleSave} className="space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label className="text-xs">
                                        Label <span className="text-red-400">*</span>
                                    </Label>
                                    <Input
                                        value={form.label}
                                        onChange={(e) => update({ label: e.target.value })}
                                        className="bg-secondary border-border text-sm h-9"
                                        placeholder="e.g. root@production"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs">
                                        Username <span className="text-red-400">*</span>
                                    </Label>
                                    <Input
                                        value={form.username}
                                        onChange={(e) => update({ username: e.target.value })}
                                        className="bg-secondary border-border text-sm h-9"
                                        placeholder="root"
                                    />
                                </div>
                            </div>

                            {/* Auth method toggle */}
                            <div>
                                <Label className="text-xs mb-1.5 block">Authentication</Label>
                                <div className="flex gap-1 p-1 bg-background/60 rounded-lg w-fit border border-border/50 mb-3">
                                    {(['password', 'key'] as const).map((m) => (
                                        <button
                                            key={m}
                                            type="button"
                                            onClick={() => update({ authMethod: m })}
                                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
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

                                {form.authMethod === 'password' ? (
                                    <div className="space-y-1.5">
                                        <Label className="text-xs">
                                            Password
                                            {editId && (
                                                <span className="text-muted-foreground/50 ml-1">
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
                                                className="bg-secondary border-border text-sm h-9 pr-10"
                                                placeholder="••••••••"
                                            />
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => setShowPassword(!showPassword)}
                                                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 text-muted-foreground hover:text-foreground"
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
                                    <div className="space-y-3">
                                        <div className="space-y-1.5">
                                            <Label className="text-xs">
                                                Private Key
                                                {editId && (
                                                    <span className="text-muted-foreground/50 ml-1">
                                                        (leave blank to keep)
                                                    </span>
                                                )}
                                            </Label>
                                            <Textarea
                                                value={form.privateKey}
                                                onChange={(e) =>
                                                    update({ privateKey: e.target.value })
                                                }
                                                className="bg-secondary border-border text-xs font-mono min-h-[100px] resize-none leading-relaxed"
                                                placeholder={
                                                    '-----BEGIN OPENSSH PRIVATE KEY-----\n...\n-----END OPENSSH PRIVATE KEY-----'
                                                }
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label className="text-xs">
                                                Passphrase{' '}
                                                <span className="text-muted-foreground/50">
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
                                                    className="bg-secondary border-border text-sm h-9 pr-10"
                                                    placeholder="••••••••"
                                                />
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() =>
                                                        setShowPassphrase(!showPassphrase)
                                                    }
                                                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 text-muted-foreground hover:text-foreground"
                                                >
                                                    {showPassphrase ? (
                                                        <EyeOff className="w-4 h-4" />
                                                    ) : (
                                                        <Eye className="w-4 h-4" />
                                                    )}
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {formError && (
                                <p className="text-sm text-destructive">{formError}</p>
                            )}

                            <div className="flex justify-end gap-2 pt-1">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setShowForm(false)}
                                >
                                    Cancel
                                </Button>
                                <Button type="submit" size="sm" disabled={saving} className="gap-1.5">
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

            {/* Entries list */}
            {loading ? (
                <div className="flex items-center justify-center h-32">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
            ) : entries.length === 0 ? (
                <Card>
                    <CardContent className="flex flex-col items-center justify-center py-14 gap-3">
                        <BookKey className="w-8 h-8 text-muted-foreground/40" />
                        <p className="text-sm text-muted-foreground">No keychain entries yet</p>
                        <Button size="sm" onClick={openCreate} variant="secondary" className="gap-1.5">
                            <Plus className="w-4 h-4" />
                            Create your first entry
                        </Button>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-2">
                    {entries.map((entry) => (
                        <Card key={entry.id}>
                            <CardContent className="p-4 flex items-center gap-4">
                                <div
                                    className={`p-2 rounded-lg border shrink-0 ${
                                        entry.hasPrivateKey
                                            ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                                            : 'bg-primary/10 text-primary border-primary/30'
                                    }`}
                                >
                                    {entry.hasPrivateKey ? (
                                        <Key className="w-4 h-4" />
                                    ) : (
                                        <Lock className="w-4 h-4" />
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate">{entry.label}</p>
                                    <p className="text-xs text-muted-foreground font-mono truncate">
                                        {entry.username}
                                        <span className="ml-2 text-muted-foreground/50">
                                            {entry.hasPrivateKey ? '· SSH key' : '· password'}
                                        </span>
                                    </p>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                        onClick={() => openEdit(entry.id)}
                                    >
                                        <Pencil className="w-3.5 h-3.5" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                        onClick={() => handleDelete(entry.id)}
                                        disabled={deletingId === entry.id}
                                    >
                                        {deletingId === entry.id ? (
                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        ) : (
                                            <Trash2 className="w-3.5 h-3.5" />
                                        )}
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
