'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { isPasskeySupported, webauthnAuthenticate, webauthnRegister } from '@/lib/webauthn/client';

type TwoFactorMethod = 'TOTP' | 'EMAIL' | null;

/** WebAuthn ceremonies can hang forever; give up after this long. */
const PASSKEY_TIMEOUT_MS = 32000;

/**
 * A ceremony must be *raced* against the timer, not merely flagged by it: a
 * hung ceremony never settles, so without a rejecting timeout the catch block
 * never runs and the button spins forever.
 */
function withTimeout<T>(ceremony: Promise<T>) {
    let timedOut = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
            timedOut = true;
            reject(new Error('passkey-timeout'));
        }, PASSKEY_TIMEOUT_MS);
    });
    return {
        run: () => Promise.race([ceremony, timeout]),
        clear: () => clearTimeout(timeoutId),
        didTimeOut: () => timedOut,
    };
}

/** All login-screen state: credentials, 2FA step, and the passkey flows. */
export function useLogin() {
    const router = useRouter();
    const searchParams = useSearchParams();

    const [formData, setFormData] = useState({ email: '', password: '' });
    const [loading, setLoading] = useState(false);
    const [passkeyLoading, setPasskeyLoading] = useState(false);
    const [error, setError] = useState('');
    const [info, setInfo] = useState('');

    const [requires2FA, setRequires2FA] = useState(false);
    const [twoFactorMethod, setTwoFactorMethod] = useState<TwoFactorMethod>(null);
    const [code, setCode] = useState('');
    const [isRecoveryMode, setIsRecoveryMode] = useState(false);
    const [resendLoading, setResendLoading] = useState(false);
    const [resendCooldown, setResendCooldown] = useState(0);

    const [showPasskeySetup, setShowPasskeySetup] = useState(false);
    const [passkeySetupLoading, setPasskeySetupLoading] = useState(false);
    const [passkeySetupName, setPasskeySetupName] = useState('');
    const [passkeySetupError, setPasskeySetupError] = useState('');
    const [webAuthnSupported, setWebAuthnSupported] = useState(false);
    const [checkingSession, setCheckingSession] = useState(true);

    /** Honour ?next= only for same-site paths. */
    const nextDestination = useCallback(() => {
        const nextUrl = searchParams.get('next');
        return nextUrl && nextUrl.startsWith('/') ? nextUrl : '/panel';
    }, [searchParams]);

    useEffect(() => {
        // Async: on macOS desktop this asks the main process whether the native
        // passkey bridge actually loaded, rather than trusting Chromium's
        // (broken-in-Electron) navigator.credentials.
        let cancelled = false;
        isPasskeySupported()
            .then((supported) => {
                if (!cancelled) setWebAuthnSupported(supported);
            })
            .catch(() => {
                if (!cancelled) setWebAuthnSupported(false);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    // If already signed in, skip the login form and go straight to the app.
    useEffect(() => {
        let cancelled = false;
        fetch('/api/auth/me')
            .then((r) => r.json())
            .then((data) => {
                if (cancelled) return;
                if (data.success) router.replace(nextDestination());
                else setCheckingSession(false);
            })
            .catch(() => {
                if (!cancelled) setCheckingSession(false);
            });
        return () => {
            cancelled = true;
        };
    }, [router, nextDestination]);

    // Surface the outcome of email verification, OAuth and password resets.
    useEffect(() => {
        const err = searchParams.get('error');
        if (searchParams.get('verified') === '1')
            setInfo('Email verified successfully. You can now sign in.');
        if (err === 'verification-failed')
            setError(searchParams.get('message') || 'Email verification failed.');
        if (err === 'oauth_failed') setError('Google sign-in failed. Please try again.');
        if (err === 'oauth_state') setError('Authentication error. Please try again.');
        if (err === 'oauth_cancelled') setInfo('Google sign-in was cancelled.');
        if (err === 'oauth_email_unverified')
            setError(
                'Your Google account email is not verified. Verify it with Google, or sign in with your password.',
            );
        if (searchParams.get('reset') === '1')
            setInfo('Password reset successfully. Please sign in with your new password.');
    }, [searchParams]);

    useEffect(() => {
        if (resendCooldown <= 0) return;
        const t = setInterval(() => setResendCooldown((c) => Math.max(0, c - 1)), 1000);
        return () => clearInterval(t);
    }, [resendCooldown]);

    /** Offers the credentials to the browser's password manager, then routes on. */
    const handleLoginSuccess = (data: { suggestPasskeySetup?: boolean }) => {
        if (formData.email && typeof window !== 'undefined' && 'PasswordCredential' in window) {
            try {
                const cred = new PasswordCredential({
                    id: formData.email,
                    password: formData.password,
                    name: formData.email,
                });
                navigator.credentials.store(cred).catch(() => {});
            } catch {
                /* not supported */
            }
        }
        if (data?.suggestPasskeySetup && webAuthnSupported) setShowPasskeySetup(true);
        else router.push(nextDestination());
    };

    const submitLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
            });
            const data = await response.json();
            if (!data.success) {
                setError(data.error || 'Login failed');
                setLoading(false);
                return;
            }
            if (data.data?.requires2FA) {
                setRequires2FA(true);
                setTwoFactorMethod(data.data.twoFactorMethod || 'TOTP');
                setInfo(data.data.message || '');
                setLoading(false);
                return;
            }
            handleLoginSuccess(data.data);
        } catch {
            setError('An error occurred. Please try again.');
            setLoading(false);
        }
    };

    const submitVerify = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const response = await fetch('/api/auth/verify-2fa', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code }),
            });
            const data = await response.json();
            if (!data.success) {
                setError(data.error || 'Verification failed');
                setLoading(false);
                return;
            }
            handleLoginSuccess(data.data);
        } catch {
            setError('An error occurred. Please try again.');
            setLoading(false);
        }
    };

    const signInWithPasskey = async () => {
        setError('');
        setPasskeyLoading(true);
        let guard: ReturnType<typeof withTimeout<unknown>> | undefined;
        try {
            const optRes = await fetch('/api/auth/passkey/authenticate-options', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: formData.email || undefined }),
            });
            const optData = await optRes.json();
            if (!optData.success) {
                setError(optData.error || 'Failed to start passkey sign-in');
                setPasskeyLoading(false);
                return;
            }
            guard = withTimeout(webauthnAuthenticate(optData.data));
            const assertion = await guard.run();
            guard.clear();

            const authRes = await fetch('/api/auth/passkey/authenticate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ response: assertion }),
            });
            const authData = await authRes.json();
            if (!authData.success) {
                setError(authData.error || 'Passkey authentication failed');
                setPasskeyLoading(false);
                return;
            }
            router.push(nextDestination());
        } catch (err: unknown) {
            guard?.clear();
            if (guard?.didTimeOut()) {
                setError(
                    'Passkey request timed out. Please try again or sign in with your password.',
                );
            } else if ((err as { name?: string })?.name !== 'NotAllowedError') {
                setError('Passkey sign-in failed. Please try with your password.');
            }
            setPasskeyLoading(false);
        }
    };

    const setUpPasskey = async () => {
        setPasskeySetupError('');
        setPasskeySetupLoading(true);
        let guard: ReturnType<typeof withTimeout<unknown>> | undefined;
        try {
            const optRes = await fetch('/api/auth/passkey/register-options');
            const optData = await optRes.json();
            if (!optData.success) {
                setPasskeySetupError(optData.error || 'Failed to start passkey setup');
                setPasskeySetupLoading(false);
                return;
            }
            guard = withTimeout(webauthnRegister(optData.data));
            const registrationResponse = await guard.run();
            guard.clear();

            const regRes = await fetch('/api/auth/passkey/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: passkeySetupName.trim() || 'Passkey',
                    response: registrationResponse,
                }),
            });
            const regData = await regRes.json();
            if (!regData.success) {
                setPasskeySetupError(regData.error || 'Passkey registration failed');
                setPasskeySetupLoading(false);
                return;
            }
            router.push(nextDestination());
        } catch (err: unknown) {
            guard?.clear();
            if (guard?.didTimeOut()) {
                setPasskeySetupError(
                    'Passkey setup timed out. Check for a Touch ID or system dialog on your screen, then try again.',
                );
            } else if ((err as { name?: string })?.name === 'NotAllowedError') {
                setPasskeySetupError('Passkey setup was cancelled.');
            } else {
                setPasskeySetupError('Passkey setup failed. Please try again or skip.');
            }
            setPasskeySetupLoading(false);
        }
    };

    const resendEmailCode = async () => {
        setResendLoading(true);
        try {
            const res = await fetch('/api/auth/2fa/email', { method: 'PUT' });
            const data = await res.json();
            if (data.success) {
                setInfo('A new verification code has been sent to your email.');
                setResendCooldown(60);
            } else setError(data.error || 'Failed to resend code');
        } catch {
            setError('Failed to resend code');
        } finally {
            setResendLoading(false);
        }
    };

    const backToLogin = () => {
        setRequires2FA(false);
        setCode('');
        setError('');
        setInfo('');
        setIsRecoveryMode(false);
    };

    const toggleRecoveryMode = () => {
        setIsRecoveryMode((m) => !m);
        setCode('');
        setError('');
    };

    return {
        formData,
        setFormData,
        loading,
        error,
        info,
        checkingSession,
        webAuthnSupported,
        submitLogin,
        //  2FA
        requires2FA,
        twoFactorMethod,
        code,
        setCode,
        isRecoveryMode,
        toggleRecoveryMode,
        submitVerify,
        resendEmailCode,
        resendLoading,
        resendCooldown,
        backToLogin,
        //  Passkeys
        passkeyLoading,
        signInWithPasskey,
        showPasskeySetup,
        passkeySetupName,
        setPasskeySetupName,
        passkeySetupLoading,
        passkeySetupError,
        setUpPasskey,
        skipPasskeySetup: () => router.push(nextDestination()),
    };
}

export type LoginState = ReturnType<typeof useLogin>;
