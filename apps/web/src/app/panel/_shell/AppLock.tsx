'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Fingerprint, Loader2, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { revalidate } from '@/lib/hooks/useCachedFetch';
import { isPasskeySupported, webauthnAuthenticate } from '@/lib/webauthn/client';

const ACTIVITY_KEY = 'termi-last-activity';
const STATE_KEY = 'termi-lock-state';
/** Fired on window to lock right away (e.g. the command palette's "Lock Termi"). */
export const LOCK_NOW_EVENT = 'termi-lock-now';

interface LockInfo {
    email: string;
    hasPassword: boolean;
    passkeyEnabled: boolean;
}

const readNumber = (key: string) => {
    try {
        return Number(localStorage.getItem(key)) || 0;
    } catch {
        return 0;
    }
};
const write = (key: string, value: string) => {
    try {
        localStorage.setItem(key, value);
    } catch {
        /* storage unavailable */
    }
};

/**
 * Locks Termi after `lockAfterMinutes` without activity (in any tab), or on
 * request. Locking is enforced by the server — a locked session can call no
 * API but unlock — and terminals disconnect until unlocked, so this screen is
 * not just a cover that could be removed in the browser's developer tools.
 */
export function AppLock({ lockAfterMinutes }: { lockAfterMinutes: number | null }) {
    const [info, setInfo] = useState<LockInfo | null>(null);
    const [password, setPassword] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const locking = useRef(false);
    const router = useRouter();

    const showLock = useCallback(async () => {
        const res = await fetch('/api/auth/me').catch(() => null);
        if (res?.status !== 423) return false;
        const body = await res.json();
        setInfo(body.data);
        window.dispatchEvent(new Event('termi-lock'));
        return true;
    }, []);

    const lock = useCallback(async () => {
        if (locking.current) return;
        locking.current = true;
        try {
            await fetch('/api/auth/lock', { method: 'POST' });
            write(STATE_KEY, `locked:${Date.now()}`);
            await showLock();
        } finally {
            locking.current = false;
        }
    }, [showLock]);

    // Already locked when the page loads (or in another tab).
    useEffect(() => {
        void showLock();
        const onStorage = (e: StorageEvent) => {
            if (e.key !== STATE_KEY) return;
            if (e.newValue?.startsWith('locked')) void showLock();
            else if (e.newValue?.startsWith('unlocked')) {
                setInfo(null);
                window.dispatchEvent(new Event('termi-unlock'));
            }
        };
        const onLockNow = () => void lock();
        window.addEventListener('storage', onStorage);
        window.addEventListener(LOCK_NOW_EVENT, onLockNow);
        return () => {
            window.removeEventListener('storage', onStorage);
            window.removeEventListener(LOCK_NOW_EVENT, onLockNow);
        };
    }, [showLock, lock]);

    // Idle tracking, shared by all tabs through localStorage.
    useEffect(() => {
        if (!lockAfterMinutes) return;
        let last = 0;
        const touch = () => {
            const now = Date.now();
            if (now - last < 5000) return;
            last = now;
            write(ACTIVITY_KEY, String(now));
        };
        touch();
        const events = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'mousemove'] as const;
        events.forEach((e) => window.addEventListener(e, touch, { passive: true }));
        const timer = setInterval(() => {
            if (info) return;
            const idle = Date.now() - readNumber(ACTIVITY_KEY);
            if (idle > lockAfterMinutes * 60_000) void lock();
        }, 10_000);
        return () => {
            events.forEach((e) => window.removeEventListener(e, touch));
            clearInterval(timer);
        };
    }, [lockAfterMinutes, info, lock]);

    const unlock = async (proof: Record<string, unknown>) => {
        setBusy(true);
        setError('');
        try {
            const res = await fetch('/api/auth/unlock', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(proof),
            });
            const body = await res.json().catch(() => null);
            if (body?.success) {
                setInfo(null);
                setPassword('');
                write(ACTIVITY_KEY, String(Date.now()));
                write(STATE_KEY, `unlocked:${Date.now()}`);
                window.dispatchEvent(new Event('termi-unlock'));
                revalidate('/api/auth/me', '/api/auth/me');
                return;
            }
            if (/signed out/.test(body?.error ?? '')) {
                router.replace('/login');
                return;
            }
            setError(body?.error || 'That did not match');
        } finally {
            setBusy(false);
        }
    };

    const unlockWithPasskey = async () => {
        setError('');
        try {
            if (!(await isPasskeySupported())) {
                setError('Passkeys are not available here.');
                return;
            }
            const opt = await fetch('/api/auth/passkey/authenticate-options', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            }).then((r) => r.json());
            if (!opt?.success) throw new Error();
            await unlock({ passkeyResponse: await webauthnAuthenticate(opt.data) });
        } catch {
            setError('Passkey unlock was cancelled or failed.');
        }
    };

    if (!info) return null;

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-label="Termi is locked"
            className="fixed inset-0 z-[300] flex items-center justify-center bg-background/90 p-4 backdrop-blur-xl"
        >
            <div className="w-full max-w-sm space-y-4 rounded-2xl border border-border bg-card p-6 text-center shadow-xl">
                <Lock className="mx-auto h-8 w-8 text-primary" />
                <div>
                    <p className="text-lg font-semibold">Termi is locked</p>
                    <p className="text-sm text-muted-foreground">{info.email}</p>
                </div>
                {info.passkeyEnabled && (
                    <Button onClick={unlockWithPasskey} disabled={busy} className="w-full">
                        <Fingerprint /> Unlock with a passkey
                    </Button>
                )}
                {info.hasPassword && (
                    <form
                        className="space-y-2"
                        onSubmit={(e) => {
                            e.preventDefault();
                            void unlock({ authPassword: password });
                        }}
                    >
                        <Input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Password"
                            aria-label="Password"
                            autoComplete="current-password"
                            autoFocus
                        />
                        <Button
                            type="submit"
                            variant={info.passkeyEnabled ? 'secondary' : 'default'}
                            disabled={busy || !password}
                            className="w-full"
                        >
                            {busy && <Loader2 className="animate-spin" />} Unlock
                        </Button>
                    </form>
                )}
                {error && <p className="text-sm text-danger">{error}</p>}
                <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                    onClick={async () => {
                        await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
                        router.replace('/login');
                    }}
                >
                    Sign out instead
                </button>
            </div>
        </div>
    );
}
