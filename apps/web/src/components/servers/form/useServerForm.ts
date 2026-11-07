'use client';

import { useCallback, useMemo, useState } from 'react';
import { useCachedFetch } from '@/lib/hooks/useCachedFetch';
import {
    EMPTY_SERVER_FORM,
    defaultPorts,
    isSshLike,
    type Group,
    type KeychainEntry,
    type ProtocolValue,
    type ServerFormValues,
    type TestStatus,
} from './types';

type CredentialSource = 'new' | 'keychain';

/**
 * Form state shared by the Add Server and Edit Server pages: field values,
 * keychain selection, and the connection test.
 */
export function useServerForm(initialValues?: Partial<ServerFormValues>) {
    const [form, setForm] = useState<ServerFormValues>({
        ...EMPTY_SERVER_FORM,
        ...initialValues,
    });

    // Groups and keychain entries share their cache with the Groups/Keychain
    // pages, so opening this form reuses lists that are usually already loaded.
    const { data: groupsData } = useCachedFetch<{ groups: Group[] }>('/api/groups');
    const groups = groupsData?.groups ?? [];
    const { data: keychainData } = useCachedFetch<{ entries: KeychainEntry[] }>('/api/keychain');
    const keychainEntries = useMemo(() => keychainData?.entries ?? [], [keychainData]);

    const [credSource, setCredSource] = useState<CredentialSource>('new');
    const [selectedKeychainId, setSelectedKeychainId] = useState('');
    const [saveToKeychain, setSaveToKeychain] = useState(false);
    const [keychainLabel, setKeychainLabel] = useState('');

    const [testStatus, setTestStatus] = useState<TestStatus>('idle');
    const [testResult, setTestResult] = useState<{ latency?: number; error?: string } | null>(null);

    const update = useCallback(
        (fields: Partial<ServerFormValues>) => setForm((f) => ({ ...f, ...fields })),
        [],
    );

    /** Replaces every field at once — used when edit mode loads the server. */
    const replace = useCallback((values: ServerFormValues) => setForm(values), []);

    const resetTest = useCallback(() => {
        setTestStatus('idle');
        setTestResult(null);
    }, []);

    const changeProtocol = useCallback(
        (protocol: ProtocolValue) => {
            update({ protocol, port: defaultPorts[protocol] });
            resetTest();
        },
        [update, resetTest],
    );

    /**
     * Picks a keychain entry. Only its username and auth type come to the
     * browser; the secret stays on the server, which resolves `keychainId`
     * when the server is saved or tested.
     */
    const applyKeychain = useCallback(
        (keychainId: string) => {
            const entry = keychainEntries.find((k) => k.id === keychainId);
            if (!entry) return;
            update({
                username: entry.username,
                password: '',
                privateKey: '',
                passphrase: '',
                authMethod: entry.hasPrivateKey ? 'key' : 'password',
            });
        },
        [keychainEntries, update],
    );

    /** The keychain entry to send instead of secrets, when one is in use. */
    const keychainId =
        credSource === 'keychain' && selectedKeychainId ? selectedKeychainId : undefined;

    const isSSHProto = isSshLike(form.protocol);
    const hasAuth =
        !!keychainId || form.authMethod === 'password'
            ? !!form.password.trim()
            : !!form.privateKey.trim();
    const canTest = !!(
        form.host.trim() &&
        form.port > 0 &&
        form.username.trim() &&
        (!isSSHProto || hasAuth)
    );

    const runTest = useCallback(async () => {
        if (!canTest) return;
        setTestStatus('testing');
        setTestResult(null);
        try {
            const res = await fetch('/api/servers/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    host: form.host,
                    port: form.port,
                    protocol: form.protocol,
                    username: form.username,
                    password: form.authMethod === 'password' ? form.password : undefined,
                    privateKey: form.authMethod === 'key' ? form.privateKey : undefined,
                    passphrase: form.authMethod === 'key' ? form.passphrase : undefined,
                    jumpServerId:
                        form.protocol !== 'TELNET' && form.jumpServerId
                            ? form.jumpServerId
                            : undefined,
                    keychainId,
                }),
            });
            const data = await res.json();
            if (data.success) {
                setTestStatus('success');
                setTestResult({ latency: data.latency });
            } else {
                setTestStatus('failed');
                setTestResult({ error: data.error });
            }
        } catch {
            setTestStatus('failed');
            setTestResult({ error: 'Network error' });
        }
    }, [canTest, form, keychainId]);

    /**
     * Persists the entered credentials as a keychain entry, when the user asked
     * for it. Failure is non-fatal — the server save still goes ahead.
     */
    const persistToKeychain = useCallback(async () => {
        if (credSource !== 'new' || !saveToKeychain || !keychainLabel.trim()) return;
        try {
            await fetch('/api/keychain', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    label: keychainLabel.trim(),
                    username: form.username,
                    password:
                        form.authMethod === 'password' && form.password.trim()
                            ? form.password
                            : undefined,
                    privateKey:
                        form.authMethod === 'key' && form.privateKey.trim()
                            ? form.privateKey
                            : undefined,
                    passphrase:
                        form.authMethod === 'key' && form.passphrase.trim()
                            ? form.passphrase
                            : undefined,
                }),
            });
        } catch {
            // keychain save failure is non-fatal
        }
    }, [credSource, saveToKeychain, keychainLabel, form]);

    return {
        form,
        update,
        replace,
        groups,
        keychainEntries,
        credSource,
        setCredSource,
        selectedKeychainId,
        setSelectedKeychainId,
        applyKeychain,
        keychainId,
        saveToKeychain,
        setSaveToKeychain,
        keychainLabel,
        setKeychainLabel,
        persistToKeychain,
        changeProtocol,
        resetTest,
        isSSHProto,
        canTest,
        testStatus,
        testResult,
        runTest,
    };
}

export type ServerFormState = ReturnType<typeof useServerForm>;
