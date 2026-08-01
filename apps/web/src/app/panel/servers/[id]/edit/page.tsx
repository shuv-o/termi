'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { ServerForm } from '@/components/servers/form/ServerForm';
import { useServerForm } from '@/components/servers/form/useServerForm';
import {
    EMPTY_SERVER_FORM,
    NO_STORED_CREDENTIALS,
    type ProtocolValue,
    type RdpSecurity,
    type StoredCredentials,
} from '@/components/servers/form/types';

export default function EditServerPage() {
    const router = useRouter();
    const { id } = useParams<{ id: string }>();
    const state = useServerForm();
    const { replace } = state;

    const [pageLoading, setPageLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [storedCreds, setStoredCreds] = useState<StoredCredentials>(NO_STORED_CREDENTIALS);

    useEffect(() => {
        fetch(`/api/servers/${id}`)
            .then((r) => r.json())
            .then((serverData) => {
                if (!serverData.success) {
                    router.push('/panel');
                    return;
                }
                const s = serverData.data.server;
                setStoredCreds({
                    hasPassword: s.hasPassword ?? false,
                    hasPrivateKey: s.hasPrivateKey ?? false,
                    hasPassphrase: s.hasPassphrase ?? false,
                });
                replace({
                    ...EMPTY_SERVER_FORM,
                    name: s.name ?? '',
                    description: s.description ?? '',
                    groupId: s.group?.id ?? '',
                    protocol: s.protocol as ProtocolValue,
                    host: s.host ?? '',
                    port: s.port ?? 22,
                    username: s.username ?? '',
                    authMethod: s.hasPrivateKey ? 'key' : 'password',
                    // Secrets are never sent back to the browser; blank means "keep".
                    notes: s.notes ?? '',
                    tags: s.tags ?? [],
                    displayWidth: s.displayWidth ?? 1920,
                    displayHeight: s.displayHeight ?? 1080,
                    rdpSecurity: (s.rdpSecurity ?? 'any') as RdpSecurity,
                });
            })
            .catch(() => router.push('/panel'))
            .finally(() => setPageLoading(false));
    }, [id, router, replace]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSaving(true);

        const { form } = state;
        try {
            // Optionally save credentials to keychain before updating the server.
            await state.persistToKeychain();

            const payload: Record<string, unknown> = {
                name: form.name,
                description: form.description || undefined,
                groupId: form.groupId || undefined,
                protocol: form.protocol,
                host: form.host,
                port: form.port,
                username: form.username,
                notes: form.notes || undefined,
                tags: form.tags.length > 0 ? form.tags : [],
                ...(form.protocol === 'RDP' || form.protocol === 'VNC'
                    ? { displayWidth: form.displayWidth, displayHeight: form.displayHeight }
                    : {}),
                ...(form.protocol === 'RDP' ? { rdpSecurity: form.rdpSecurity } : {}),
            };
            // Blank credential fields are omitted so the stored ones survive.
            if (form.authMethod === 'password' && form.password.trim()) {
                payload.password = form.password;
            }
            if (form.authMethod === 'key') {
                if (form.privateKey.trim()) payload.privateKey = form.privateKey;
                if (form.passphrase.trim()) payload.passphrase = form.passphrase;
            }

            const res = await fetch(`/api/servers/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (!data.success) {
                setError(data.error || 'Failed to update server');
                setSaving(false);
                return;
            }
            router.push('/panel');
        } catch {
            setError('An error occurred. Please try again.');
            setSaving(false);
        }
    };

    if (pageLoading) {
        return (
            <div className="flex items-center justify-center h-48">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <ServerForm
            mode="edit"
            state={state}
            subtitle={state.form.name}
            storedCreds={storedCreds}
            submitting={saving}
            error={error}
            onSubmit={handleSubmit}
        />
    );
}
