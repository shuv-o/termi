'use client';

import { useCallback, useEffect, useState } from 'react';
import { isPasskeySupported, webauthnRegister } from '@/lib/webauthn/client';
import type { AddToast, Passkey, SetUser } from '../types';

/** WebAuthn registration can sit on a system dialog; give up after this long. */
const REGISTER_TIMEOUT_MS = 32000;

function registrationErrorMessage(err: unknown, timedOut: boolean): string {
    if (err instanceof Error) {
        if (timedOut) return 'Passkey setup timed out — check for a system dialog on your screen';
        if (err.name === 'NotAllowedError') return 'Passkey registration was cancelled or denied';
        if (err.name === 'InvalidStateError')
            return 'A passkey for this device is already registered';
        if (err.name === 'NotSupportedError')
            return 'Passkeys are not supported on this device or browser';
        if (err.name === 'SecurityError')
            return 'Security error — ensure you are on a secure origin';
    }
    return 'Passkey creation failed';
}

/** Loads, registers and removes the account's passkeys. */
export function usePasskeys(addToast: AddToast, setUser: SetUser) {
    const [passkeys, setPasskeys] = useState<Passkey[]>([]);
    const [loading, setLoading] = useState(false);
    const [adding, setAdding] = useState(false);
    const [newName, setNewName] = useState('');
    const [showAdd, setShowAdd] = useState(false);
    const [error, setError] = useState('');

    const reload = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/auth/passkey');
            const data = await res.json();
            if (data.success) setPasskeys(data.data.passkeys);
        } catch {
            /* ignore */
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void reload();
    }, [reload]);

    const add = useCallback(async () => {
        setAdding(true);
        setError('');
        let timedOut = false;
        const timeoutId = setTimeout(() => {
            timedOut = true;
        }, REGISTER_TIMEOUT_MS);
        try {
            if (!(await isPasskeySupported())) {
                clearTimeout(timeoutId);
                throw new Error('Passkeys are not available on this device');
            }

            const optRes = await fetch('/api/auth/passkey/register-options');
            const optData = await optRes.json();
            if (!optRes.ok || !optData.success) {
                clearTimeout(timeoutId);
                throw new Error(optData.error || 'Failed to get registration options');
            }

            let registration;
            try {
                registration = await webauthnRegister(optData.data);
                clearTimeout(timeoutId);
            } catch (err: unknown) {
                clearTimeout(timeoutId);
                throw new Error(registrationErrorMessage(err, timedOut));
            }

            const regRes = await fetch('/api/auth/passkey/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: newName.trim() || 'My Passkey',
                    response: registration,
                }),
            });
            const regData = await regRes.json();
            if (!regRes.ok || !regData.success)
                throw new Error(regData.error || 'Failed to register passkey');

            setUser((u) => (u ? { ...u, passkeyEnabled: true } : null));
            setShowAdd(false);
            setNewName('');
            addToast('success', 'Passkey added successfully');
            void reload();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to add passkey');
        } finally {
            setAdding(false);
        }
    }, [addToast, newName, reload, setUser]);

    const remove = useCallback(
        async (id: string) => {
            try {
                const res = await fetch(`/api/auth/passkey/${id}`, { method: 'DELETE' });
                const data = await res.json();
                if (data.success) {
                    setPasskeys((prev) => {
                        const next = prev.filter((p) => p.id !== id);
                        if (next.length === 0)
                            setUser((u) => (u ? { ...u, passkeyEnabled: false } : null));
                        return next;
                    });
                    addToast('success', 'Passkey removed');
                } else addToast('error', data.error || 'Failed to remove passkey');
            } catch {
                addToast('error', 'Failed to remove passkey');
            }
        },
        [addToast, setUser],
    );

    return {
        passkeys,
        loading,
        adding,
        newName,
        setNewName,
        showAdd,
        setShowAdd,
        error,
        setError,
        add,
        remove,
    };
}
