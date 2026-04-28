'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { startRegistration } from '@simplewebauthn/browser';
import {
    Shield, Key, Loader2, Check, AlertTriangle,
    Eye, EyeOff, Mail, Smartphone, Copy, CheckCircle,
    Info, Fingerprint, Plus, Trash2, X, Lock,
    AlertCircle, MonitorSmartphone, Clock, BellRing, Bell, BellOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';

// ─── Types ────────────────────────────────────────────────────────────────────

interface User {
    id: string;
    email: string;
    totpEnabled: boolean;
    emailOtpEnabled: boolean;
    twoFactorMethod: 'NONE' | 'TOTP' | 'EMAIL';
    hasMasterKey: boolean;
    passkeyEnabled: boolean;
    isVerified: boolean;
}

interface Passkey {
    id: string;
    name: string;
    deviceType: string;
    backedUp: boolean;
    transports: string[];
    createdAt: string;
    lastUsedAt: string | null;
}

// ─── Toast Notification ───────────────────────────────────────────────────────

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
    id: number;
    type: ToastType;
    message: string;
}

function ToastList({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
    const icons: Record<ToastType, React.ReactNode> = {
        success: <Check className="w-4 h-4 text-green-400 shrink-0" />,
        error: <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />,
        warning: <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0" />,
        info: <Info className="w-4 h-4 text-sky-400 shrink-0" />,
    };
    const colors: Record<ToastType, string> = {
        success: 'bg-green-500/10 border-green-500/30 text-green-300',
        error: 'bg-red-500/10 border-red-500/30 text-red-300',
        warning: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-300',
        info: 'bg-sky-500/10 border-sky-500/30 text-sky-300',
    };

    if (!toasts.length) return null;

    return (
        <div className="space-y-2 mb-6">
            {toasts.map((t) => (
                <div key={t.id} className={`flex items-center gap-3 px-4 py-3 rounded-lg border text-sm ${colors[t.type]}`}>
                    {icons[t.type]}
                    <span className="flex-1">{t.message}</span>
                    <button onClick={() => onDismiss(t.id)} className="shrink-0 opacity-60 hover:opacity-100 transition-opacity">
                        <X className="w-4 h-4" />
                    </button>
                </div>
            ))}
        </div>
    );
}

// ─── Section Card ─────────────────────────────────────────────────────────────

function SectionCard({ icon, iconBg, title, description, children }: {
    icon: React.ReactNode;
    iconBg: string;
    title: string;
    description: string;
    children: React.ReactNode;
}) {
    return (
        <Card className="p-6">
            <div className="flex items-start gap-4 mb-5">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${iconBg}`}>
                    {icon}
                </div>
                <div>
                    <h2 className="text-base font-semibold">{title}</h2>
                    <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
                </div>
            </div>
            {children}
        </Card>
    );
}

// ─── Passkey Row ──────────────────────────────────────────────────────────────

function PasskeyRow({ passkey, onDelete }: { passkey: Passkey; onDelete: (id: string) => void }) {
    const [confirming, setConfirming] = useState(false);
    const [deleting, setDeleting] = useState(false);

    async function handleDelete() {
        setDeleting(true);
        await onDelete(passkey.id);
        setDeleting(false);
        setConfirming(false);
    }

    const isMultiDevice = passkey.deviceType === 'multiDevice' || passkey.backedUp;
    const lastUsed = passkey.lastUsedAt
        ? new Date(passkey.lastUsedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
        : 'Never';
    const created = new Date(passkey.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

    return (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-background/50 border border-border/50">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Fingerprint className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{passkey.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" /> Added {created}
                    </span>
                    {isMultiDevice && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-primary/20 text-primary text-xs font-medium">Synced</span>
                    )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">Last used: {lastUsed}</p>
            </div>
            {confirming ? (
                <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-destructive">Remove?</span>
                    <button
                        onClick={() => setConfirming(false)}
                        className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded"
                    >
                        Cancel
                    </button>
                    <Button
                        variant="destructive"
                        size="sm"
                        onClick={handleDelete}
                        disabled={deleting}
                        className="text-xs py-1 px-2 h-auto"
                    >
                        {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Remove'}
                    </Button>
                </div>
            ) : (
                <button
                    onClick={() => setConfirming(true)}
                    className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors shrink-0"
                    title="Remove passkey"
                >
                    <Trash2 className="w-4 h-4" />
                </button>
            )}
        </div>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SettingsPage() {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [toasts, setToasts] = useState<Toast[]>([]);
    const toastIdRef = useRef(0);

    const addToast = useCallback((type: ToastType, message: string, duration = 5000) => {
        const id = ++toastIdRef.current;
        setToasts((prev) => [...prev, { id, type, message }]);
        setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), duration);
        return id;
    }, []);

    const dismissToast = useCallback((id: number) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    const [setup2FA, setSetup2FA] = useState(false);
    const [qrCode, setQrCode] = useState('');
    const [secret, setSecret] = useState('');
    const [verifyCode, setVerifyCode] = useState('');
    const [enabling2FA, setEnabling2FA] = useState(false);
    const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
    const [copiedCode, setCopiedCode] = useState<string | null>(null);

    const [enablingEmailOTP, setEnablingEmailOTP] = useState(false);

    const [showDisable, setShowDisable] = useState(false);
    const [disablePassword, setDisablePassword] = useState('');
    const [disabling2FA, setDisabling2FA] = useState(false);

    const [showPasswords, setShowPasswords] = useState({ current: false, new: false, confirm: false });
    const [passwordForm, setPasswordForm] = useState({ current: '', new: '', confirm: '' });
    const [changingPassword, setChangingPassword] = useState(false);

    const [passkeys, setPasskeys] = useState<Passkey[]>([]);
    const [loadingPasskeys, setLoadingPasskeys] = useState(false);
    const [addingPasskey, setAddingPasskey] = useState(false);
    const [newPasskeyName, setNewPasskeyName] = useState('');
    const [showAddPasskey, setShowAddPasskey] = useState(false);
    const [passkeyError, setPasskeyError] = useState('');

    const [pushPermission, setPushPermission] = useState<NotificationPermission>('default');
    const [pushSubscribed, setPushSubscribed] = useState(false);
    const [enablingPush, setEnablingPush] = useState(false);

    useEffect(() => {
        async function init() {
            try {
                const res = await fetch('/api/auth/me');
                const data = await res.json();
                if (data.success) setUser(data.data.user);
            } catch { /* ignore */ }
            finally { setLoading(false); }
        }
        void init();
        void loadPasskeys();

        if (typeof window !== 'undefined' && 'Notification' in window) {
            setPushPermission(Notification.permission);
        }
        if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
            navigator.serviceWorker.ready.then(reg => {
                reg.pushManager.getSubscription().then(sub => {
                    setPushSubscribed(!!sub);
                });
            }).catch(() => {});
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const loadPasskeys = useCallback(async () => {
        setLoadingPasskeys(true);
        try {
            const res = await fetch('/api/auth/passkey');
            const data = await res.json();
            if (data.success) setPasskeys(data.data.passkeys);
        } catch { /* ignore */ }
        finally { setLoadingPasskeys(false); }
    }, []);

    const handleEnablePush = async () => {
        setEnablingPush(true);
        try {
            if (!('Notification' in window) || !('serviceWorker' in navigator)) {
                addToast('error', 'Push notifications are not supported by your browser');
                return;
            }

            const permission = await Notification.requestPermission();
            setPushPermission(permission);
            if (permission !== 'granted') {
                addToast('warning', 'Notification permission denied');
                return;
            }

            const keyRes = await fetch('/api/push/vapid-public-key');
            const keyData = await keyRes.json();
            if (!keyData.success) {
                addToast('error', 'Push notifications not configured on this server');
                return;
            }

            const vapidKey = keyData.data.publicKey;
            const applicationServerKey = urlBase64ToUint8Array(vapidKey).buffer as ArrayBuffer;

            const reg = await navigator.serviceWorker.ready;
            const subscription = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey,
            });

            const subJson = subscription.toJSON() as {
                endpoint: string;
                keys: { p256dh: string; auth: string };
            };

            const res = await fetch('/api/push/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    endpoint: subJson.endpoint,
                    keys: subJson.keys,
                    deviceLabel: navigator.userAgent.slice(0, 100),
                }),
            });
            const data = await res.json();
            if (data.success) {
                setPushSubscribed(true);
                addToast('success', 'Push notifications enabled for this device');
            } else {
                addToast('error', data.error || 'Failed to save subscription');
            }
        } catch (err) {
            addToast('error', `Failed to enable push: ${err instanceof Error ? err.message : 'Unknown error'}`);
        } finally {
            setEnablingPush(false);
        }
    };

    const handleDisablePush = async () => {
        setEnablingPush(true);
        try {
            const reg = await navigator.serviceWorker.ready;
            const sub = await reg.pushManager.getSubscription();
            if (sub) {
                await fetch('/api/push/subscribe', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ endpoint: sub.endpoint }),
                });
                await sub.unsubscribe();
            }
            setPushSubscribed(false);
            addToast('success', 'Push notifications disabled for this device');
        } catch {
            addToast('error', 'Failed to disable push notifications');
        } finally {
            setEnablingPush(false);
        }
    };

    function urlBase64ToUint8Array(base64String: string): Uint8Array {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
        const rawData = window.atob(base64);
        return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)));
    }

    const handleSetupTOTP = async () => {
        try {
            const res = await fetch('/api/auth/2fa');
            const data = await res.json();
            if (data.success) {
                setQrCode(data.data.qrCode);
                setSecret(data.data.secret);
                setSetup2FA(true);
            } else {
                addToast('error', data.error || 'Failed to setup 2FA');
            }
        } catch { addToast('error', 'Failed to setup 2FA'); }
    };

    const handleEnableTOTP = async () => {
        setEnabling2FA(true);
        try {
            const res = await fetch('/api/auth/2fa', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ secret, code: verifyCode }),
            });
            const data = await res.json();
            if (data.success) {
                setUser((u) => u ? { ...u, totpEnabled: true, twoFactorMethod: 'TOTP' } : null);
                setSetup2FA(false);
                setVerifyCode('');
                setRecoveryCodes(data.data.recoveryCodes || []);
                addToast('success', 'Authenticator app 2FA enabled! Save your recovery codes.');
            } else {
                addToast('error', data.error || 'Invalid code — please try again');
            }
        } catch { addToast('error', 'Failed to enable 2FA'); }
        finally { setEnabling2FA(false); }
    };

    const handleEnableEmailOTP = async () => {
        setEnablingEmailOTP(true);
        try {
            const res = await fetch('/api/auth/2fa/email', { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                setUser((u) => u ? { ...u, emailOtpEnabled: true, twoFactorMethod: 'EMAIL' } : null);
                addToast('success', 'Email OTP enabled — a code will be sent on each login.');
            } else {
                addToast('error', data.error || 'Failed to enable email OTP');
            }
        } catch { addToast('error', 'Failed to enable email OTP'); }
        finally { setEnablingEmailOTP(false); }
    };

    const handleDisable2FA = async () => {
        setDisabling2FA(true);
        try {
            const res = await fetch('/api/auth/2fa', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: disablePassword }),
            });
            const data = await res.json();
            if (data.success) {
                setUser((u) => u ? { ...u, totpEnabled: false, emailOtpEnabled: false, twoFactorMethod: 'NONE' } : null);
                setShowDisable(false);
                setDisablePassword('');
                addToast('success', '2FA disabled successfully');
            } else {
                addToast('error', data.error || 'Failed to disable 2FA');
            }
        } catch { addToast('error', 'Failed to disable 2FA'); }
        finally { setDisabling2FA(false); }
    };

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (passwordForm.new !== passwordForm.confirm) {
            addToast('error', 'New passwords do not match');
            return;
        }
        if (passwordForm.new.length < 8) {
            addToast('error', 'New password must be at least 8 characters');
            return;
        }
        setChangingPassword(true);
        try {
            const res = await fetch('/api/auth/password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ currentPassword: passwordForm.current, newPassword: passwordForm.new }),
            });
            const data = await res.json();
            if (data.success) {
                setPasswordForm({ current: '', new: '', confirm: '' });
                addToast('success', 'Password changed successfully');
            } else {
                addToast('error', data.error || 'Failed to change password');
            }
        } catch { addToast('error', 'Failed to change password'); }
        finally { setChangingPassword(false); }
    };

    const handleAddPasskey = async () => {
        setAddingPasskey(true);
        setPasskeyError('');
        try {
            const optRes = await fetch('/api/auth/passkey/register-options');
            const optData = await optRes.json();
            if (!optRes.ok || !optData.success) {
                throw new Error(optData.error || 'Failed to get registration options');
            }

            let registration;
            try {
                registration = await startRegistration({ optionsJSON: optData.data });
            } catch (err: unknown) {
                if (err instanceof Error) {
                    if (err.name === 'NotAllowedError') throw new Error('Passkey registration was cancelled or denied');
                    if (err.name === 'InvalidStateError') throw new Error('A passkey for this device is already registered');
                    if (err.name === 'NotSupportedError') throw new Error('Passkeys are not supported on this device or browser');
                    if (err.name === 'SecurityError') throw new Error('Security error — ensure you are on HTTPS');
                }
                throw new Error('Passkey creation failed');
            }

            const regRes = await fetch('/api/auth/passkey/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: newPasskeyName.trim() || 'My Passkey',
                    response: registration,
                }),
            });
            const regData = await regRes.json();
            if (!regRes.ok || !regData.success) {
                throw new Error(regData.error || 'Failed to register passkey');
            }

            setUser((u) => u ? { ...u, passkeyEnabled: true } : null);
            setShowAddPasskey(false);
            setNewPasskeyName('');
            addToast('success', 'Passkey added successfully');
            loadPasskeys();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Failed to add passkey';
            setPasskeyError(msg);
        } finally {
            setAddingPasskey(false);
        }
    };

    const handleDeletePasskey = async (id: string) => {
        try {
            const res = await fetch(`/api/auth/passkey/${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) {
                setPasskeys((prev) => {
                    const next = prev.filter((p) => p.id !== id);
                    if (next.length === 0) setUser((u) => u ? { ...u, passkeyEnabled: false } : null);
                    return next;
                });
                addToast('success', 'Passkey removed');
            } else {
                addToast('error', data.error || 'Failed to remove passkey');
            }
        } catch { addToast('error', 'Failed to remove passkey'); }
    };

    const copyCode = async (code: string) => {
        await navigator.clipboard.writeText(code);
        setCopiedCode(code);
        setTimeout(() => setCopiedCode(null), 2000);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-7 h-7 animate-spin text-primary" />
            </div>
        );
    }

    const has2FA = user?.twoFactorMethod !== 'NONE';
    const passwordsMatch = !passwordForm.confirm || passwordForm.new === passwordForm.confirm;

    return (
        <div className="max-w-2xl mx-auto pb-12">
            <div className="mb-8">
                <h1 className="text-2xl font-bold">Settings</h1>
                <p className="text-muted-foreground text-sm mt-1">Manage your account security and preferences</p>
            </div>

            <ToastList toasts={toasts} onDismiss={dismissToast} />

            {user && !user.isVerified && (
                <div className="mb-6 flex items-start gap-3 px-4 py-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-yellow-300 text-sm">
                    <Info className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>Your email is not verified. Check your inbox for a verification link.</span>
                </div>
            )}

            {/* ── Account Info ── */}
            <Card className="p-6 mb-4">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Account</h2>
                <div className="space-y-3">
                    <div className="flex items-center justify-between py-2 border-b border-border/50">
                        <span className="text-sm text-muted-foreground">Email</span>
                        <span className="text-sm flex items-center gap-2">
                            {user?.email}
                            {user?.isVerified && <CheckCircle className="w-4 h-4 text-green-400" />}
                        </span>
                    </div>
                    <div className="flex items-center justify-between py-2 border-b border-border/50">
                        <span className="text-sm text-muted-foreground">Two-Factor Auth</span>
                        <span className={`text-sm font-medium ${has2FA ? 'text-green-400' : 'text-muted-foreground'}`}>
                            {user?.twoFactorMethod === 'TOTP' ? 'Authenticator App'
                                : user?.twoFactorMethod === 'EMAIL' ? 'Email OTP'
                                    : 'Disabled'}
                        </span>
                    </div>
                    <div className="flex items-center justify-between py-2 border-b border-border/50">
                        <span className="text-sm text-muted-foreground">Passkeys</span>
                        <span className={`text-sm font-medium ${user?.passkeyEnabled ? 'text-green-400' : 'text-muted-foreground'}`}>
                            {user?.passkeyEnabled ? `${passkeys.length} registered` : 'None'}
                        </span>
                    </div>
                    <div className="flex items-center justify-between py-2">
                        <span className="text-sm text-muted-foreground">Master Key</span>
                        <span className={`text-sm font-medium ${user?.hasMasterKey ? 'text-green-400' : 'text-muted-foreground'}`}>
                            {user?.hasMasterKey ? 'Configured' : 'Not set'}
                        </span>
                    </div>
                </div>
            </Card>

            {/* ── Recovery Codes ── */}
            {recoveryCodes.length > 0 && (
                <Card className="p-6 mb-4 border-yellow-500/30">
                    <div className="flex items-center gap-2 mb-3">
                        <AlertTriangle className="w-5 h-5 text-yellow-400" />
                        <h2 className="font-semibold text-yellow-400">Save your recovery codes</h2>
                    </div>
                    <p className="text-muted-foreground text-sm mb-4">
                        Store these codes securely. Each can only be used once and will not be shown again.
                    </p>
                    <div className="grid grid-cols-2 gap-2 mb-4">
                        {recoveryCodes.map((code) => (
                            <div key={code} className="flex items-center justify-between bg-background rounded-lg px-3 py-2 font-mono text-sm border border-border">
                                <span className="tracking-wider">{code}</span>
                                <button onClick={() => copyCode(code)} className="text-muted-foreground hover:text-foreground ml-2 transition-colors">
                                    {copiedCode === code ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                                </button>
                            </div>
                        ))}
                    </div>
                    <Button variant="secondary" size="sm" onClick={() => setRecoveryCodes([])}>
                        I&apos;ve saved my recovery codes
                    </Button>
                </Card>
            )}

            {/* ── Passkeys ── */}
            <div className="mb-4">
                <SectionCard
                    icon={<Fingerprint className="w-5 h-5 text-primary" />}
                    iconBg="bg-primary/15"
                    title="Passkeys"
                    description="Sign in with biometrics or a security key — no password required."
                >
                    {loadingPasskeys ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                            <Loader2 className="w-4 h-4 animate-spin" /> Loading passkeys…
                        </div>
                    ) : passkeys.length > 0 ? (
                        <div className="space-y-2 mb-4">
                            {passkeys.map((pk) => (
                                <PasskeyRow key={pk.id} passkey={pk} onDelete={handleDeletePasskey} />
                            ))}
                        </div>
                    ) : (
                        <div className="mb-4 flex items-center gap-3 p-3 rounded-lg bg-background/50 border border-border/50 text-sm text-muted-foreground">
                            <MonitorSmartphone className="w-4 h-4 shrink-0" />
                            No passkeys registered. Add one to enable passwordless sign-in.
                        </div>
                    )}

                    {showAddPasskey ? (
                        <div className="space-y-3 p-4 rounded-lg bg-background/50 border border-border/50">
                            <p className="text-sm font-medium">Name this passkey</p>
                            <p className="text-xs text-muted-foreground">Give it a name to identify the device (e.g., &quot;MacBook Touch ID&quot;, &quot;iPhone Face ID&quot;).</p>
                            <Input
                                type="text"
                                value={newPasskeyName}
                                onChange={(e) => setNewPasskeyName(e.target.value)}
                                placeholder="My Passkey"
                                className="bg-secondary border-border text-sm"
                                maxLength={64}
                                disabled={addingPasskey}
                            />
                            {passkeyError && (
                                <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
                                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                                    {passkeyError}
                                </div>
                            )}
                            <div className="flex gap-2">
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => { setShowAddPasskey(false); setNewPasskeyName(''); setPasskeyError(''); }}
                                    disabled={addingPasskey}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    size="sm"
                                    onClick={handleAddPasskey}
                                    disabled={addingPasskey}
                                    className="flex-1"
                                >
                                    {addingPasskey ? (
                                        <><Loader2 className="w-4 h-4 animate-spin" /> Creating…</>
                                    ) : (
                                        <><Fingerprint className="w-4 h-4" /> Create Passkey</>
                                    )}
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => { setShowAddPasskey(true); setPasskeyError(''); }}
                        >
                            <Plus className="w-4 h-4" />
                            Add Passkey
                        </Button>
                    )}

                    <p className="text-xs text-muted-foreground/60 mt-3">
                        Passkeys require a device with biometrics or a hardware security key, and a supported browser (Chrome 108+, Safari 16+, Firefox 119+).
                    </p>
                </SectionCard>
            </div>

            {/* ── Two-Factor Authentication ── */}
            <div className="mb-4">
                <SectionCard
                    icon={<Shield className="w-5 h-5 text-violet-400" />}
                    iconBg="bg-violet-500/15"
                    title="Two-Factor Authentication"
                    description="Require a second verification step when signing in."
                >
                    {!has2FA && !setup2FA && (
                        <div className="space-y-3">
                            <p className="text-sm text-muted-foreground">Choose a 2FA method to add an extra layer of security:</p>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <Button variant="secondary" onClick={handleSetupTOTP} className="gap-2">
                                    <Smartphone className="w-4 h-4" />
                                    Authenticator App
                                </Button>
                                <Button variant="secondary" onClick={handleEnableEmailOTP} disabled={enablingEmailOTP} className="gap-2">
                                    {enablingEmailOTP ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                                    Email OTP
                                </Button>
                            </div>
                        </div>
                    )}

                    {setup2FA && (
                        <div className="space-y-4">
                            <div className="p-4 bg-background rounded-lg text-center border border-border">
                                {qrCode && <img src={qrCode} alt="2FA QR Code" className="mx-auto mb-4 rounded" />}
                                <p className="text-sm text-muted-foreground mb-2">Scan with Google Authenticator, Authy, or similar</p>
                                <p className="text-xs text-muted-foreground/60 mb-2">Or enter manually:</p>
                                <code className="text-xs text-foreground/80 bg-secondary px-3 py-1.5 rounded-lg break-all border border-border">{secret}</code>
                            </div>
                            <div className="space-y-1.5">
                                <Label>Enter the 6-digit code to confirm</Label>
                                <Input
                                    type="text"
                                    value={verifyCode}
                                    onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    className="bg-secondary border-border text-center text-2xl tracking-[0.5em] font-mono"
                                    placeholder="000000"
                                    maxLength={6}
                                    inputMode="numeric"
                                    autoComplete="one-time-code"
                                />
                            </div>
                            <div className="flex gap-2">
                                <Button variant="secondary" onClick={() => setSetup2FA(false)}>Cancel</Button>
                                <Button
                                    onClick={handleEnableTOTP}
                                    disabled={verifyCode.length !== 6 || enabling2FA}
                                    className="flex-1"
                                >
                                    {enabling2FA ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Verify & Enable'}
                                </Button>
                            </div>
                        </div>
                    )}

                    {has2FA && !showDisable && (
                        <div>
                            <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-sm text-green-300 mb-4">
                                <CheckCircle className="w-4 h-4 shrink-0" />
                                {user?.twoFactorMethod === 'TOTP'
                                    ? 'Authenticator app is active. Keep your recovery codes safe.'
                                    : 'Email OTP is active. A code is sent to your email on each login.'}
                            </div>
                            <Button variant="destructive" size="sm" onClick={() => setShowDisable(true)}>
                                Disable 2FA
                            </Button>
                        </div>
                    )}

                    {showDisable && (
                        <div className="space-y-4">
                            <div className="flex items-start gap-3 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
                                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                                Disabling 2FA will reduce your account security. Confirm your password to continue.
                            </div>
                            <div className="space-y-1.5">
                                <Label>Confirm Password</Label>
                                <Input
                                    type="password"
                                    value={disablePassword}
                                    onChange={(e) => setDisablePassword(e.target.value)}
                                    className="bg-secondary border-border"
                                    placeholder="Enter your current password"
                                />
                            </div>
                            <div className="flex gap-2">
                                <Button variant="secondary" onClick={() => { setShowDisable(false); setDisablePassword(''); }}>
                                    Cancel
                                </Button>
                                <Button
                                    variant="destructive"
                                    onClick={handleDisable2FA}
                                    disabled={!disablePassword || disabling2FA}
                                    className="flex-1"
                                >
                                    {disabling2FA ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Disable 2FA'}
                                </Button>
                            </div>
                        </div>
                    )}
                </SectionCard>
            </div>

            {/* ── Change Password + Push Notifications ── */}
            <div className="mb-4 space-y-4">
                <SectionCard
                    icon={<Lock className="w-5 h-5 text-amber-400" />}
                    iconBg="bg-amber-500/15"
                    title="Change Password"
                    description="Update your account password. Use a strong, unique password."
                >
                    <form onSubmit={handleChangePassword} method="POST" action="#" className="space-y-4">
                        <div className="space-y-1.5">
                            <Label>Current Password</Label>
                            <div className="relative">
                                <Input
                                    type={showPasswords.current ? 'text' : 'password'}
                                    value={passwordForm.current}
                                    onChange={(e) => setPasswordForm({ ...passwordForm, current: e.target.value })}
                                    className="bg-secondary border-border pr-10"
                                    autoComplete="current-password"
                                    required
                                />
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setShowPasswords((s) => ({ ...s, current: !s.current }))}
                                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 text-muted-foreground hover:text-foreground"
                                >
                                    {showPasswords.current ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </Button>
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label>New Password</Label>
                            <div className="relative">
                                <Input
                                    type={showPasswords.new ? 'text' : 'password'}
                                    value={passwordForm.new}
                                    onChange={(e) => setPasswordForm({ ...passwordForm, new: e.target.value })}
                                    className="bg-secondary border-border pr-10"
                                    autoComplete="new-password"
                                    required
                                    minLength={8}
                                />
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setShowPasswords((s) => ({ ...s, new: !s.new }))}
                                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 text-muted-foreground hover:text-foreground"
                                >
                                    {showPasswords.new ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </Button>
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Confirm New Password</Label>
                            <div className="relative">
                                <Input
                                    type={showPasswords.confirm ? 'text' : 'password'}
                                    value={passwordForm.confirm}
                                    onChange={(e) => setPasswordForm({ ...passwordForm, confirm: e.target.value })}
                                    className={`bg-secondary pr-10 ${passwordForm.confirm && !passwordsMatch ? 'border-destructive' : 'border-border'}`}
                                    autoComplete="new-password"
                                    required
                                />
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setShowPasswords((s) => ({ ...s, confirm: !s.confirm }))}
                                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 text-muted-foreground hover:text-foreground"
                                >
                                    {showPasswords.confirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </Button>
                            </div>
                            {passwordForm.confirm && !passwordsMatch && (
                                <p className="text-sm text-destructive">Passwords do not match</p>
                            )}
                        </div>
                        <Button type="submit" disabled={changingPassword || !passwordsMatch} className="gap-2">
                            {changingPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
                            {changingPassword ? 'Changing…' : 'Change Password'}
                        </Button>
                    </form>
                </SectionCard>

                <SectionCard
                    icon={<BellRing className="w-5 h-5 text-amber-400" />}
                    iconBg="bg-amber-500/15"
                    title="Push Notifications"
                    description="Receive browser push notifications for server alerts on this device"
                >
                    <div className="space-y-4">
                        <div className="flex items-center gap-3 p-3 rounded-lg bg-background/50 border border-border/50">
                            {pushSubscribed ? (
                                <>
                                    <Bell className="w-5 h-5 text-emerald-400 shrink-0" />
                                    <div className="flex-1">
                                        <p className="text-sm font-medium text-emerald-400">Notifications active</p>
                                        <p className="text-xs text-muted-foreground mt-0.5">This device will receive server alert notifications</p>
                                    </div>
                                </>
                            ) : pushPermission === 'denied' ? (
                                <>
                                    <BellOff className="w-5 h-5 text-red-400 shrink-0" />
                                    <div className="flex-1">
                                        <p className="text-sm font-medium text-red-400">Notifications blocked</p>
                                        <p className="text-xs text-muted-foreground mt-0.5">
                                            Your browser has blocked notifications. Enable them in your browser settings then reload.
                                        </p>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <BellOff className="w-5 h-5 text-muted-foreground shrink-0" />
                                    <div className="flex-1">
                                        <p className="text-sm font-medium">Notifications off</p>
                                        <p className="text-xs text-muted-foreground mt-0.5">Enable to get server down/up alerts on this device</p>
                                    </div>
                                </>
                            )}
                        </div>

                        {pushSubscribed ? (
                            <Button variant="secondary" onClick={handleDisablePush} disabled={enablingPush} className="gap-2">
                                {enablingPush ? <Loader2 className="w-4 h-4 animate-spin" /> : <BellOff className="w-4 h-4" />}
                                Disable for this device
                            </Button>
                        ) : (
                            <Button onClick={handleEnablePush} disabled={enablingPush || pushPermission === 'denied'} className="gap-2">
                                {enablingPush ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />}
                                {enablingPush ? 'Enabling…' : 'Enable for this device'}
                            </Button>
                        )}

                        <p className="text-xs text-muted-foreground/40">
                            Notifications are per-device. Enable on each device where you want alerts.
                            Configure alert rules per server in the server details page.
                        </p>
                    </div>
                </SectionCard>
            </div>
        </div>
    );
}
