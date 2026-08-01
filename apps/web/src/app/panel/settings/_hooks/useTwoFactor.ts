'use client';

import { useCallback, useState } from 'react';
import type { AddToast, SetUser } from '../types';

/** TOTP enrolment, email-OTP enrolment, and disabling 2FA. */
export function useTwoFactor(setUser: SetUser, addToast: AddToast) {
    const [setupOpen, setSetupOpen] = useState(false);
    const [qrCode, setQrCode] = useState('');
    const [secret, setSecret] = useState('');
    const [verifyCode, setVerifyCode] = useState('');
    const [enabling, setEnabling] = useState(false);
    const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
    const [copiedCode, setCopiedCode] = useState<string | null>(null);
    const [enablingEmailOtp, setEnablingEmailOtp] = useState(false);
    const [showDisable, setShowDisable] = useState(false);
    const [disablePassword, setDisablePassword] = useState('');
    const [disabling, setDisabling] = useState(false);

    const startTotpSetup = useCallback(async () => {
        try {
            const res = await fetch('/api/auth/2fa');
            const data = await res.json();
            if (data.success) {
                setQrCode(data.data.qrCode);
                setSecret(data.data.secret);
                setSetupOpen(true);
            } else addToast('error', data.error || 'Failed to setup 2FA');
        } catch {
            addToast('error', 'Failed to setup 2FA');
        }
    }, [addToast]);

    const enableTotp = useCallback(async () => {
        setEnabling(true);
        try {
            const res = await fetch('/api/auth/2fa', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ secret, code: verifyCode }),
            });
            const data = await res.json();
            if (data.success) {
                setUser((u) => (u ? { ...u, totpEnabled: true, twoFactorMethod: 'TOTP' } : null));
                setSetupOpen(false);
                setVerifyCode('');
                setRecoveryCodes(data.data.recoveryCodes || []);
                addToast('success', 'Authenticator app enabled! Save your recovery codes.');
            } else addToast('error', data.error || 'Invalid code — please try again');
        } catch {
            addToast('error', 'Failed to enable 2FA');
        } finally {
            setEnabling(false);
        }
    }, [addToast, secret, setUser, verifyCode]);

    const enableEmailOtp = useCallback(async () => {
        setEnablingEmailOtp(true);
        try {
            const res = await fetch('/api/auth/2fa/email', { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                setUser((u) =>
                    u ? { ...u, emailOtpEnabled: true, twoFactorMethod: 'EMAIL' } : null,
                );
                addToast('success', 'Email OTP enabled — a code will be sent on each login.');
            } else addToast('error', data.error || 'Failed to enable email OTP');
        } catch {
            addToast('error', 'Failed to enable email OTP');
        } finally {
            setEnablingEmailOtp(false);
        }
    }, [addToast, setUser]);

    const disable = useCallback(async () => {
        setDisabling(true);
        try {
            const res = await fetch('/api/auth/2fa', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: disablePassword }),
            });
            const data = await res.json();
            if (data.success) {
                setUser((u) =>
                    u
                        ? {
                              ...u,
                              totpEnabled: false,
                              emailOtpEnabled: false,
                              twoFactorMethod: 'NONE',
                          }
                        : null,
                );
                setShowDisable(false);
                setDisablePassword('');
                addToast('success', '2FA disabled successfully');
            } else addToast('error', data.error || 'Failed to disable 2FA');
        } catch {
            addToast('error', 'Failed to disable 2FA');
        } finally {
            setDisabling(false);
        }
    }, [addToast, disablePassword, setUser]);

    const copyRecoveryCode = useCallback(async (code: string) => {
        await navigator.clipboard.writeText(code);
        setCopiedCode(code);
        setTimeout(() => setCopiedCode(null), 2000);
    }, []);

    return {
        setupOpen,
        setSetupOpen,
        qrCode,
        secret,
        verifyCode,
        setVerifyCode,
        enabling,
        recoveryCodes,
        setRecoveryCodes,
        copiedCode,
        copyRecoveryCode,
        enablingEmailOtp,
        showDisable,
        setShowDisable,
        disablePassword,
        setDisablePassword,
        disabling,
        startTotpSetup,
        enableTotp,
        enableEmailOtp,
        disable,
    };
}
