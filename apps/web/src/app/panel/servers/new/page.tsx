'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ServerForm } from '@/components/servers/form/ServerForm';
import { useServerForm } from '@/components/servers/form/useServerForm';

export default function NewServerPage() {
    const router = useRouter();
    const state = useServerForm();
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSaving(true);

        const { form } = state;
        try {
            // Optionally save credentials to keychain before creating the server.
            await state.persistToKeychain();

            const res = await fetch('/api/servers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: form.name,
                    description: form.description || undefined,
                    groupId: form.groupId || undefined,
                    protocol: form.protocol,
                    host: form.host,
                    port: form.port,
                    username: form.username,
                    password: form.authMethod === 'password' ? form.password : undefined,
                    privateKey: form.authMethod === 'key' ? form.privateKey : undefined,
                    passphrase: form.authMethod === 'key' ? form.passphrase : undefined,
                    notes: form.notes || undefined,
                    tags: form.tags.length > 0 ? form.tags : undefined,
                    ...(form.protocol === 'RDP' || form.protocol === 'VNC'
                        ? { displayWidth: form.displayWidth, displayHeight: form.displayHeight }
                        : {}),
                    ...(form.protocol === 'RDP' ? { rdpSecurity: form.rdpSecurity } : {}),
                }),
            });
            const data = await res.json();
            if (!data.success) {
                setError(data.error || 'Failed to create server');
                setSaving(false);
                return;
            }
            router.push('/panel');
        } catch {
            setError('An error occurred. Please try again.');
            setSaving(false);
        }
    };

    return (
        <ServerForm
            mode="create"
            state={state}
            subtitle="Configure a new connection"
            submitting={saving}
            error={error}
            onSubmit={handleSubmit}
        />
    );
}
