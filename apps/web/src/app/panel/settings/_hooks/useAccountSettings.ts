'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AddToast, SetUser, User } from '../types';

/**
 * Display name, login password, encryption passphrase and email verification —
 * the plain account-maintenance actions, none of which need their own hook.
 */
export function useAccountSettings(user: User | null, setUser: SetUser, addToast: AddToast) {
    //  Display name — seeded once from the cached user.
    const [nameInput, setNameInput] = useState('');
    const [savingName, setSavingName] = useState(false);
    const nameSeeded = useRef(false);

    useEffect(() => {
        if (user && !nameSeeded.current) {
            setNameInput(user.name ?? '');
            nameSeeded.current = true;
        }
    }, [user]);

    const saveName = useCallback(
        async (e: React.FormEvent) => {
            e.preventDefault();
            const trimmed = nameInput.trim();
            if (!trimmed) {
                addToast('error', 'Name cannot be empty');
                return;
            }
            setSavingName(true);
            try {
                const res = await fetch('/api/auth/profile', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: trimmed }),
                });
                const data = await res.json();
                if (data.success) {
                    setUser((u) => (u ? { ...u, name: trimmed } : null));
                    addToast('success', 'Name updated');
                } else {
                    addToast('error', data.error || 'Failed to update name');
                }
            } catch {
                addToast('error', 'Something went wrong');
            } finally {
                setSavingName(false);
            }
        },
        [addToast, nameInput, setUser],
    );

    //  Password
    // Field names avoid a bare `current`: the React Compiler reads `x.current`
    // as a ref access and bails out of memoizing the callback below.
    const [showPasswords, setShowPasswords] = useState({
        currentPassword: false,
        newPassword: false,
        confirmPassword: false,
    });
    const [passwordForm, setPasswordForm] = useState({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
    });
    const [changingPassword, setChangingPassword] = useState(false);
    const passwordsMatch =
        !passwordForm.confirmPassword || passwordForm.newPassword === passwordForm.confirmPassword;

    const changePassword = useCallback(
        async (e: React.FormEvent) => {
            e.preventDefault();
            if (passwordForm.newPassword !== passwordForm.confirmPassword) {
                addToast('error', 'New passwords do not match');
                return;
            }
            if (passwordForm.newPassword.length < 8) {
                addToast('error', 'New password must be at least 8 characters');
                return;
            }
            setChangingPassword(true);
            try {
                const res = await fetch('/api/auth/password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        currentPassword: passwordForm.currentPassword,
                        newPassword: passwordForm.newPassword,
                    }),
                });
                const data = await res.json();
                if (data.success) {
                    setPasswordForm({
                        currentPassword: '',
                        newPassword: '',
                        confirmPassword: '',
                    });
                    addToast('success', 'Password changed successfully');
                } else addToast('error', data.error || 'Failed to change password');
            } catch {
                addToast('error', 'Failed to change password');
            } finally {
                setChangingPassword(false);
            }
        },
        [addToast, passwordForm],
    );

    //  Encryption passphrase (Google accounts only)
    const [passphrase, setPassphrase] = useState('');
    const [passphraseConfirm, setPassphraseConfirm] = useState('');
    const [savingPassphrase, setSavingPassphrase] = useState(false);
    const [resettingEncryption, setResettingEncryption] = useState(false);
    const [showEncryptionResetConfirm, setShowEncryptionResetConfirm] = useState(false);

    const changePassphrase = useCallback(
        async (e: React.FormEvent) => {
            e.preventDefault();
            if (passphrase !== passphraseConfirm || passphrase.length < 8) return;
            setSavingPassphrase(true);
            try {
                const res = await fetch('/api/auth/setup-encryption', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ passphrase }),
                });
                const data = await res.json();
                if (data.success) {
                    addToast('success', 'Encryption passphrase updated');
                    setPassphrase('');
                    setPassphraseConfirm('');
                    setUser((u) => (u ? { ...u, hasMasterKey: true } : u));
                } else addToast('error', data.error || 'Failed to update passphrase');
            } catch {
                addToast('error', 'Something went wrong');
            } finally {
                setSavingPassphrase(false);
            }
        },
        [addToast, passphrase, passphraseConfirm, setUser],
    );

    const resetEncryption = useCallback(async () => {
        setResettingEncryption(true);
        try {
            const res = await fetch('/api/auth/reset-encryption-key', { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                addToast('success', 'Encryption key reset successfully.');
                window.location.href = '/setup-encryption';
            } else {
                addToast('error', data.error || 'Failed to reset encryption key.');
                setShowEncryptionResetConfirm(false);
            }
        } catch {
            addToast('error', 'Something went wrong.');
            setShowEncryptionResetConfirm(false);
        } finally {
            setResettingEncryption(false);
        }
    }, [addToast]);

    //  Email verification
    const [resendingVerification, setResendingVerification] = useState(false);
    const [verificationSent, setVerificationSent] = useState(false);

    const resendVerification = useCallback(async () => {
        setResendingVerification(true);
        try {
            await fetch('/api/auth/send-verification', { method: 'POST' });
            setVerificationSent(true);
        } finally {
            setResendingVerification(false);
        }
    }, []);

    return {
        name: { value: nameInput, set: setNameInput, saving: savingName, save: saveName },
        password: {
            form: passwordForm,
            setForm: setPasswordForm,
            show: showPasswords,
            setShow: setShowPasswords,
            changing: changingPassword,
            matches: passwordsMatch,
            change: changePassword,
        },
        encryption: {
            passphrase,
            setPassphrase,
            confirm: passphraseConfirm,
            setConfirm: setPassphraseConfirm,
            saving: savingPassphrase,
            change: changePassphrase,
            resetting: resettingEncryption,
            showResetConfirm: showEncryptionResetConfirm,
            setShowResetConfirm: setShowEncryptionResetConfirm,
            reset: resetEncryption,
        },
        verification: {
            resending: resendingVerification,
            sent: verificationSent,
            resend: resendVerification,
        },
    };
}
