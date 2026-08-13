'use client';

import { useState } from 'react';
import { useCachedFetch } from '@/lib/hooks/useCachedFetch';
import { BookKey, CheckCircle2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

import { KeychainEntryCard } from './_components/KeychainEntryCard';
import { KeychainEntryModal } from './_components/KeychainEntryModal';
import { emptyForm, type EntryForm, type KeychainEntry } from './_components/types';

export default function KeychainPage() {
    // Cached so returning to the keychain shows the list instantly instead of
    // re-fetching behind a spinner; it revalidates in the background.
    const {
        data: keychainData,
        isLoading: loading,
        refresh: fetchEntries,
        mutate: mutateEntries,
    } = useCachedFetch<{ entries: KeychainEntry[] }>('/api/keychain');
    const entries = keychainData?.entries ?? [];
    const setEntries = (updater: (prev: KeychainEntry[]) => KeychainEntry[]) =>
        mutateEntries((prev) => ({ entries: updater(prev?.entries ?? []) }));

    const [showForm, setShowForm] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);
    const [form, setForm] = useState<EntryForm>(emptyForm());
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');
    // copied[entryId] = 'user' | 'pass' | null — which field just got copied
    const [copied, setCopied] = useState<Record<string, 'user' | 'pass' | null>>({});

    const markCopied = (id: string, field: 'user' | 'pass') => {
        setCopied((prev) => ({ ...prev, [id]: field }));
        setTimeout(() => setCopied((prev) => ({ ...prev, [id]: null })), 2000);
    };

    const copyUsername = (entry: KeychainEntry) => {
        navigator.clipboard.writeText(entry.username).then(() => markCopied(entry.id, 'user'));
    };

    const copyPassword = async (entry: KeychainEntry) => {
        try {
            const res = await fetch(`/api/keychain/${entry.id}`);
            const data = await res.json();
            if (data.success) {
                const secret = entry.hasPrivateKey
                    ? data.data.entry.privateKey
                    : data.data.entry.password;
                if (secret) {
                    await navigator.clipboard.writeText(secret);
                    markCopied(entry.id, 'pass');
                }
            }
        } catch {
            // ignore
        }
    };

    const update = (fields: Partial<EntryForm>) => setForm((f) => ({ ...f, ...fields }));

    const flash = (msg: string) => {
        setSuccessMsg(msg);
        setTimeout(() => setSuccessMsg(''), 3000);
    };

    const openCreate = () => {
        setEditId(null);
        setForm(emptyForm());
        setFormError('');
        setShowForm(true);
    };

    const openEdit = async (id: string) => {
        setEditId(id);
        setFormError('');
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
        try {
            await fetch(`/api/keychain/${id}`, { method: 'DELETE' });
            setEntries((prev) => prev.filter((e) => e.id !== id));
            flash('Keychain entry deleted');
        } catch {
            // ignore
        }
    };

    return (
        <div className="space-y-4 sm:space-y-6">
            <div className="mx-auto max-w-screen-2xl space-y-4 sm:space-y-6">
                <div className="flex items-center justify-between gap-4">
                    <div>
                        <h1 className="mt-0.5 text-xl sm:text-2xl font-bold">Keychain</h1>
                        <p className="mt-0.5 text-xs sm:text-sm text-muted-foreground">
                            {entries.length > 0
                                ? `${entries.length} saved credential${entries.length === 1 ? '' : 's'} · reuse across servers`
                                : 'Save credentials once, reuse them across servers'}
                        </p>
                    </div>
                    <Button onClick={openCreate}>
                        <Plus className="w-4 h-4" />
                        <span className="hidden sm:inline">New Entry</span>
                        <span className="sm:hidden">New</span>
                    </Button>
                </div>

                {successMsg && (
                    <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-400">
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        {successMsg}
                    </div>
                )}

                {loading ? (
                    <div className="rounded-2xl border border-border bg-card/30 divide-y divide-border/60 overflow-hidden">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3.5">
                                <Skeleton className="h-10 w-10 rounded-xl shrink-0" />
                                <div className="flex-1 space-y-1.5">
                                    <Skeleton className="h-3.5 w-32" />
                                    <Skeleton className="h-3 w-24" />
                                </div>
                                <Skeleton className="h-8 w-8 rounded-lg shrink-0" />
                                <Skeleton className="h-8 w-8 rounded-lg shrink-0" />
                            </div>
                        ))}
                    </div>
                ) : entries.length === 0 ? (
                    <Card className="border-border">
                        <CardContent className="flex min-h-[320px] flex-col items-center justify-center gap-4 py-14 text-center">
                            <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-border bg-secondary/30">
                                <BookKey className="h-10 w-10 text-muted-foreground/35" />
                            </div>
                            <div>
                                <h2 className="text-xl font-semibold">No keychain entries yet</h2>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    Save reusable credentials once, then attach them to servers in
                                    seconds.
                                </p>
                            </div>
                            <Button
                                onClick={openCreate}
                                variant="secondary"
                                className="h-10 gap-1.5 px-4"
                            >
                                <Plus className="w-4 h-4" />
                                Create your first entry
                            </Button>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="rounded-2xl border border-border bg-card/30 divide-y divide-border/60 overflow-hidden">
                        {entries.map((entry) => (
                            <KeychainEntryCard
                                key={entry.id}
                                entry={entry}
                                copiedField={copied[entry.id] ?? null}
                                onCopyUsername={() => copyUsername(entry)}
                                onCopySecret={() => copyPassword(entry)}
                                onEdit={() => openEdit(entry.id)}
                                onDelete={() => handleDelete(entry.id)}
                            />
                        ))}
                    </div>
                )}
            </div>

            <KeychainEntryModal
                open={showForm}
                editing={!!editId}
                form={form}
                onChange={update}
                saving={saving}
                error={formError}
                onSubmit={handleSave}
                onClose={() => setShowForm(false)}
            />
        </div>
    );
}
