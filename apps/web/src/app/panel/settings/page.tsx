'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { startRegistration } from '@simplewebauthn/browser';
import {
    Shield, Key, Loader2, Check, AlertTriangle,
    Eye, EyeOff, Mail, Smartphone, Copy, CheckCircle,
    Info, Fingerprint, Plus, Trash2, X, Lock,
    AlertCircle, MonitorSmartphone, BellRing, Bell, BellOff,
    User as UserIcon, ChevronRight, Globe, Laptop2, Monitor,
    LogOut, RefreshCw, Activity, ShieldCheck, ShieldAlert,
    ShieldOff, Zap, CheckCircle2,
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
    isGoogleUser: boolean;
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

interface AuthSession {
    id: string;
    deviceInfo: string;
    ipAddress: string;
    createdAt: string;
    lastActiveAt: string;
    isCurrent: boolean;
}

type Section = 'profile' | 'security' | 'passkeys' | 'encryption' | 'notifications' | 'sessions' | 'danger';

// ─── Toast ────────────────────────────────────────────────────────────────────

type ToastType = 'success' | 'error' | 'warning' | 'info';
interface Toast { id: number; type: ToastType; message: string; }

function ToastList({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
    const icons: Record<ToastType, React.ReactNode> = {
        success: <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />,
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
        <div className="fixed bottom-20 left-3 right-3 sm:bottom-6 sm:left-auto sm:right-6 z-50 flex flex-col gap-2 sm:w-80">
            {toasts.map(t => (
                <div key={t.id} className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm shadow-xl backdrop-blur-sm ${colors[t.type]}`}>
                    {icons[t.type]}
                    <span className="flex-1">{t.message}</span>
                    <button onClick={() => onDismiss(t.id)} className="shrink-0 opacity-60 hover:opacity-100 transition-opacity">
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
            ))}
        </div>
    );
}

// ─── Security Score ───────────────────────────────────────────────────────────

function SecurityScore({ user, passkeys }: { user: User; passkeys: Passkey[] }) {
    const checks = [
        { label: 'Email verified', done: user.isVerified, icon: Mail },
        { label: '2FA enabled', done: user.twoFactorMethod !== 'NONE', icon: Shield },
        { label: 'Passkey registered', done: passkeys.length > 0, icon: Fingerprint },
        { label: 'Encryption key set', done: user.hasMasterKey || !user.isGoogleUser, icon: Lock },
    ];
    const score = checks.filter(c => c.done).length;
    const pct = (score / checks.length) * 100;

    const scoreColor = score === 4 ? 'text-green-400' : score >= 2 ? 'text-yellow-400' : 'text-red-400';
    const barColor = score === 4 ? 'bg-green-500' : score >= 2 ? 'bg-yellow-500' : 'bg-red-500';
    const label = score === 4 ? 'Excellent' : score >= 3 ? 'Good' : score >= 2 ? 'Fair' : 'Weak';

    return (
        <div className="p-5 rounded-xl bg-card border border-border">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    {score === 4
                        ? <ShieldCheck className="w-5 h-5 text-green-400" />
                        : score >= 2
                            ? <Shield className="w-5 h-5 text-yellow-400" />
                            : <ShieldAlert className="w-5 h-5 text-red-400" />
                    }
                    <span className="font-semibold text-sm">Security Score</span>
                </div>
                <span className={`text-sm font-bold ${scoreColor}`}>{label} · {score}/{checks.length}</span>
            </div>
            <div className="h-1.5 bg-secondary rounded-full overflow-hidden mb-4">
                <div className={`h-full rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${pct}%` }} />
            </div>
            <div className="grid grid-cols-2 gap-2">
                {checks.map(c => (
                    <div key={c.label} className="flex items-center gap-2">
                        {c.done
                            ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />
                            : <div className="w-3.5 h-3.5 rounded-full border-2 border-muted-foreground/30 shrink-0" />
                        }
                        <span className={`text-xs ${c.done ? 'text-foreground' : 'text-muted-foreground'}`}>{c.label}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ─── Sidebar Nav ──────────────────────────────────────────────────────────────

interface NavItem { id: Section; label: string; icon: React.ElementType; badge?: string | number; }

function SidebarNav({ active, onChange, user, passkeys, sessions }: {
    active: Section;
    onChange: (s: Section) => void;
    user: User | null;
    passkeys: Passkey[];
    sessions: AuthSession[];
}) {
    const items: NavItem[] = [
        { id: 'profile', label: 'Profile', icon: UserIcon },
        { id: 'security', label: 'Security', icon: Shield },
        { id: 'passkeys', label: 'Passkeys', icon: Fingerprint, badge: passkeys.length || undefined },
        { id: 'encryption', label: 'Encryption', icon: Lock },
        { id: 'notifications', label: 'Notifications', icon: Bell },
        { id: 'sessions', label: 'Active Sessions', icon: Monitor, badge: sessions.length || undefined },
        { id: 'danger', label: 'Danger Zone', icon: AlertTriangle },
    ];

    return (
        <nav className="space-y-0.5">
            {items.map(item => {
                const Icon = item.icon;
                const isActive = active === item.id;
                const isDanger = item.id === 'danger';
                return (
                    <button
                        key={item.id}
                        onClick={() => onChange(item.id)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-left ${
                            isActive
                                ? isDanger
                                    ? 'bg-red-500/15 text-red-400'
                                    : 'bg-primary/15 text-primary'
                                : isDanger
                                    ? 'text-red-400/70 hover:bg-red-500/10 hover:text-red-400'
                                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                        }`}
                    >
                        <Icon className="w-4 h-4 shrink-0" />
                        <span className="flex-1">{item.label}</span>
                        {item.badge ? (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                                isActive ? 'bg-primary/30 text-primary' : 'bg-secondary text-muted-foreground'
                            }`}>
                                {item.badge}
                            </span>
                        ) : null}
                    </button>
                );
            })}
        </nav>
    );
}

// ─── PasskeyRow ───────────────────────────────────────────────────────────────

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
        <div className="flex items-center gap-3 p-3 rounded-xl bg-secondary/50 border border-border/50 group">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Fingerprint className="w-4.5 h-4.5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{passkey.name}</p>
                    {isMultiDevice && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-primary/20 text-primary text-[10px] font-medium shrink-0">
                            <Globe className="w-2.5 h-2.5" /> Synced
                        </span>
                    )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                    Added {created} · Last used: {lastUsed}
                </p>
            </div>
            {confirming ? (
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <span className="text-xs text-destructive">Remove?</span>
                    <div className="flex items-center gap-1.5">
                        <button onClick={() => setConfirming(false)} className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded">
                            Cancel
                        </button>
                        <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleting} className="h-7 text-xs px-2">
                            {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Remove'}
                        </Button>
                    </div>
                </div>
            ) : (
                <button
                    onClick={() => setConfirming(true)}
                    className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors shrink-0 [@media(hover:none)]:opacity-100 opacity-0 group-hover:opacity-100"
                    title="Remove passkey"
                >
                    <Trash2 className="w-3.5 h-3.5" />
                </button>
            )}
        </div>
    );
}

// ─── SessionRow ───────────────────────────────────────────────────────────────

function SessionRow({ session, onRevoke }: { session: AuthSession; onRevoke: (id: string) => void }) {
    const [revoking, setRevoking] = useState(false);
    const [confirmed, setConfirmed] = useState(false);

    async function handleRevoke() {
        setRevoking(true);
        await onRevoke(session.id);
        setRevoking(false);
        setConfirmed(false);
    }

    const ua = session.deviceInfo || '';
    const isPhone = /mobile|android|iphone/i.test(ua);
    const isTablet = /ipad|tablet/i.test(ua);
    const DeviceIcon = isPhone ? Smartphone : isTablet ? MonitorSmartphone : Laptop2;

    const lastActive = new Date(session.lastActiveAt);
    const now = new Date();
    const diffMs = now.getTime() - lastActive.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    const timeAgo = diffMins < 2 ? 'Just now'
        : diffMins < 60 ? `${diffMins}m ago`
        : diffHours < 24 ? `${diffHours}h ago`
        : `${diffDays}d ago`;

    const browserMatch = ua.match(/(Chrome|Firefox|Safari|Edge|Opera)\/[\d.]+/);
    const browser = browserMatch ? browserMatch[1] : 'Browser';
    const osMatch = ua.match(/\(([^)]+)\)/);
    const osRaw = osMatch ? osMatch[1] : '';
    const os = osRaw.includes('Windows') ? 'Windows'
        : osRaw.includes('Mac') ? 'macOS'
        : osRaw.includes('Linux') ? 'Linux'
        : osRaw.includes('Android') ? 'Android'
        : osRaw.includes('iPhone') || osRaw.includes('iPad') ? 'iOS'
        : 'Unknown OS';

    return (
        <div className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${
            session.isCurrent
                ? 'bg-primary/5 border-primary/20'
                : 'bg-secondary/30 border-border/50 group'
        }`}>
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                session.isCurrent ? 'bg-primary/20' : 'bg-secondary'
            }`}>
                <DeviceIcon className={`w-4 h-4 ${session.isCurrent ? 'text-primary' : 'text-muted-foreground'}`} />
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{browser} on {os}</p>
                    {session.isCurrent && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-green-500/20 text-green-400 text-[10px] font-medium shrink-0">
                            <Activity className="w-2.5 h-2.5" /> Current
                        </span>
                    )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {session.ipAddress} · Active {timeAgo}
                </p>
            </div>
            {!session.isCurrent && (
                confirmed ? (
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <span className="text-xs text-destructive">Sign out?</span>
                        <div className="flex items-center gap-1.5">
                            <button onClick={() => setConfirmed(false)} className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded">
                                Cancel
                            </button>
                            <Button variant="destructive" size="sm" onClick={handleRevoke} disabled={revoking} className="h-7 text-xs px-2">
                                {revoking ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Sign out'}
                            </Button>
                        </div>
                    </div>
                ) : (
                    <button
                        onClick={() => setConfirmed(true)}
                        className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors shrink-0 [@media(hover:none)]:opacity-100 opacity-0 group-hover:opacity-100"
                        title="Revoke this session"
                    >
                        <LogOut className="w-3.5 h-3.5" />
                    </button>
                )
            )}
        </div>
    );
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ title, description, icon: Icon, iconBg, children }: {
    title: string;
    description?: string;
    icon?: React.ElementType;
    iconBg?: string;
    children: React.ReactNode;
}) {
    return (
        <div>
            {(title || description) && (
                <div className="flex items-start gap-3 mb-5">
                    {Icon && (
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${iconBg ?? 'bg-secondary'}`}>
                            <Icon className="w-4.5 h-4.5" />
                        </div>
                    )}
                    <div>
                        <h2 className="font-semibold text-base">{title}</h2>
                        {description && <p className="text-sm text-muted-foreground mt-0.5">{description}</p>}
                    </div>
                </div>
            )}
            {children}
        </div>
    );
}

function Divider() {
    return <div className="h-px bg-border/60 my-6" />;
}

// ─── Password strength ────────────────────────────────────────────────────────

function PasswordStrength({ password }: { password: string }) {
    if (!password) return null;
    const checks = [
        { label: '8+ characters', ok: password.length >= 8 },
        { label: 'Uppercase', ok: /[A-Z]/.test(password) },
        { label: 'Number', ok: /\d/.test(password) },
        { label: 'Symbol', ok: /[^A-Za-z0-9]/.test(password) },
    ];
    const strength = checks.filter(c => c.ok).length;
    const colors = ['bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-green-500'];
    const labels = ['Weak', 'Fair', 'Good', 'Strong'];

    return (
        <div className="mt-2 space-y-2">
            <div className="flex gap-1">
                {[0, 1, 2, 3].map(i => (
                    <div key={i} className={`flex-1 h-1 rounded-full transition-colors ${i < strength ? colors[strength - 1] : 'bg-secondary'}`} />
                ))}
            </div>
            <div className="flex items-center justify-between">
                <div className="flex gap-3">
                    {checks.map(c => (
                        <span key={c.label} className={`text-[10px] flex items-center gap-1 ${c.ok ? 'text-green-400' : 'text-muted-foreground/50'}`}>
                            {c.ok ? <Check className="w-2.5 h-2.5" /> : <div className="w-2.5 h-2.5 rounded-full border border-current opacity-30" />}
                            {c.label}
                        </span>
                    ))}
                </div>
                {strength > 0 && (
                    <span className={`text-[10px] font-medium ${colors[strength - 1].replace('bg-', 'text-')}`}>{labels[strength - 1]}</span>
                )}
            </div>
        </div>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SettingsPage() {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeSection, setActiveSection] = useState<Section>('profile');
    const [toasts, setToasts] = useState<Toast[]>([]);
    const toastIdRef = useRef(0);

    const addToast = useCallback((type: ToastType, message: string, duration = 5000) => {
        const id = ++toastIdRef.current;
        setToasts(prev => [...prev, { id, type, message }]);
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration);
    }, []);

    const dismissToast = useCallback((id: number) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    // ── 2FA state ──
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

    // ── Password state ──
    const [showPasswords, setShowPasswords] = useState({ current: false, new: false, confirm: false });
    const [passwordForm, setPasswordForm] = useState({ current: '', new: '', confirm: '' });
    const [changingPassword, setChangingPassword] = useState(false);

    // ── Passkey state ──
    const [passkeys, setPasskeys] = useState<Passkey[]>([]);
    const [loadingPasskeys, setLoadingPasskeys] = useState(false);
    const [addingPasskey, setAddingPasskey] = useState(false);
    const [newPasskeyName, setNewPasskeyName] = useState('');
    const [showAddPasskey, setShowAddPasskey] = useState(false);
    const [passkeyError, setPasskeyError] = useState('');
    const [isElectron, setIsElectron] = useState(false);

    // ── Push notifications state ──
    const [pushPermission, setPushPermission] = useState<NotificationPermission>('default');
    const [pushSubscribed, setPushSubscribed] = useState(false);
    const [enablingPush, setEnablingPush] = useState(false);

    // ── Encryption state ──
    const [encryptionPassphrase, setEncryptionPassphrase] = useState('');
    const [encryptionConfirm, setEncryptionConfirm] = useState('');
    const [encryptionLoading, setEncryptionLoading] = useState(false);
    const [resettingEncryption, setResettingEncryption] = useState(false);
    const [showEncryptionResetConfirm, setShowEncryptionResetConfirm] = useState(false);

    // ── Sessions state ──
    const [authSessions, setAuthSessions] = useState<AuthSession[]>([]);
    const [loadingSessions, setLoadingSessions] = useState(false);
    const [revokingAll, setRevokingAll] = useState(false);

    // ── Resend verification ──
    const [resendingVerification, setResendingVerification] = useState(false);
    const [verificationSent, setVerificationSent] = useState(false);

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
        setIsElectron(!!window.electronAPI?.isElectron);
        if (typeof window !== 'undefined' && 'Notification' in window) {
            setPushPermission(Notification.permission);
        }
        if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
            navigator.serviceWorker.ready.then(reg => {
                reg.pushManager.getSubscription().then(sub => setPushSubscribed(!!sub));
            }).catch(() => {});
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Load auth sessions when that section is active
    useEffect(() => {
        if (activeSection === 'sessions') void loadAuthSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeSection]);

    const loadPasskeys = useCallback(async () => {
        setLoadingPasskeys(true);
        try {
            const res = await fetch('/api/auth/passkey');
            const data = await res.json();
            if (data.success) setPasskeys(data.data.passkeys);
        } catch { /* ignore */ }
        finally { setLoadingPasskeys(false); }
    }, []);

    const loadAuthSessions = useCallback(async () => {
        setLoadingSessions(true);
        try {
            const res = await fetch('/api/auth/sessions');
            const data = await res.json();
            if (data.success) setAuthSessions(data.data.sessions ?? []);
        } catch { /* ignore */ }
        finally { setLoadingSessions(false); }
    }, []);

    // ── Push ──────────────────────────────────────────────────────────────────

    function urlBase64ToUint8Array(base64String: string): Uint8Array {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
        const rawData = window.atob(base64);
        return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)));
    }

    const handleEnablePush = async () => {
        setEnablingPush(true);
        try {
            if (!('Notification' in window) || !('serviceWorker' in navigator)) {
                addToast('error', 'Push notifications are not supported by your browser');
                return;
            }
            const permission = await Notification.requestPermission();
            setPushPermission(permission);
            if (permission !== 'granted') { addToast('warning', 'Notification permission denied'); return; }

            const keyRes = await fetch('/api/push/vapid-public-key');
            const keyData = await keyRes.json();
            if (!keyData.success) { addToast('error', 'Push notifications not configured on this server'); return; }

            const applicationServerKey = urlBase64ToUint8Array(keyData.data.publicKey).buffer as ArrayBuffer;
            const reg = await navigator.serviceWorker.ready;
            const subscription = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
            const subJson = subscription.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };

            const res = await fetch('/api/push/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ endpoint: subJson.endpoint, keys: subJson.keys, deviceLabel: navigator.userAgent.slice(0, 100) }),
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
        } finally { setEnablingPush(false); }
    };

    const handleDisablePush = async () => {
        setEnablingPush(true);
        try {
            const reg = await navigator.serviceWorker.ready;
            const sub = await reg.pushManager.getSubscription();
            if (sub) {
                await fetch('/api/push/subscribe', {
                    method: 'DELETE', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ endpoint: sub.endpoint }),
                });
                await sub.unsubscribe();
            }
            setPushSubscribed(false);
            addToast('success', 'Push notifications disabled for this device');
        } catch { addToast('error', 'Failed to disable push notifications'); }
        finally { setEnablingPush(false); }
    };

    // ── 2FA ───────────────────────────────────────────────────────────────────

    const handleSetupTOTP = async () => {
        try {
            const res = await fetch('/api/auth/2fa');
            const data = await res.json();
            if (data.success) { setQrCode(data.data.qrCode); setSecret(data.data.secret); setSetup2FA(true); }
            else addToast('error', data.error || 'Failed to setup 2FA');
        } catch { addToast('error', 'Failed to setup 2FA'); }
    };

    const handleEnableTOTP = async () => {
        setEnabling2FA(true);
        try {
            const res = await fetch('/api/auth/2fa', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ secret, code: verifyCode }),
            });
            const data = await res.json();
            if (data.success) {
                setUser(u => u ? { ...u, totpEnabled: true, twoFactorMethod: 'TOTP' } : null);
                setSetup2FA(false); setVerifyCode('');
                setRecoveryCodes(data.data.recoveryCodes || []);
                addToast('success', 'Authenticator app enabled! Save your recovery codes.');
            } else addToast('error', data.error || 'Invalid code — please try again');
        } catch { addToast('error', 'Failed to enable 2FA'); }
        finally { setEnabling2FA(false); }
    };

    const handleEnableEmailOTP = async () => {
        setEnablingEmailOTP(true);
        try {
            const res = await fetch('/api/auth/2fa/email', { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                setUser(u => u ? { ...u, emailOtpEnabled: true, twoFactorMethod: 'EMAIL' } : null);
                addToast('success', 'Email OTP enabled — a code will be sent on each login.');
            } else addToast('error', data.error || 'Failed to enable email OTP');
        } catch { addToast('error', 'Failed to enable email OTP'); }
        finally { setEnablingEmailOTP(false); }
    };

    const handleDisable2FA = async () => {
        setDisabling2FA(true);
        try {
            const res = await fetch('/api/auth/2fa', {
                method: 'DELETE', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: disablePassword }),
            });
            const data = await res.json();
            if (data.success) {
                setUser(u => u ? { ...u, totpEnabled: false, emailOtpEnabled: false, twoFactorMethod: 'NONE' } : null);
                setShowDisable(false); setDisablePassword('');
                addToast('success', '2FA disabled successfully');
            } else addToast('error', data.error || 'Failed to disable 2FA');
        } catch { addToast('error', 'Failed to disable 2FA'); }
        finally { setDisabling2FA(false); }
    };

    // ── Password ──────────────────────────────────────────────────────────────

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (passwordForm.new !== passwordForm.confirm) { addToast('error', 'New passwords do not match'); return; }
        if (passwordForm.new.length < 8) { addToast('error', 'New password must be at least 8 characters'); return; }
        setChangingPassword(true);
        try {
            const res = await fetch('/api/auth/password', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ currentPassword: passwordForm.current, newPassword: passwordForm.new }),
            });
            const data = await res.json();
            if (data.success) { setPasswordForm({ current: '', new: '', confirm: '' }); addToast('success', 'Password changed successfully'); }
            else addToast('error', data.error || 'Failed to change password');
        } catch { addToast('error', 'Failed to change password'); }
        finally { setChangingPassword(false); }
    };

    // ── Passkeys ──────────────────────────────────────────────────────────────

    const handleAddPasskey = async () => {
        setAddingPasskey(true); setPasskeyError('');
        let timedOut = false;
        const timeoutId = setTimeout(() => { timedOut = true; }, 32000);
        try {
            const optRes = await fetch('/api/auth/passkey/register-options');
            const optData = await optRes.json();
            if (!optRes.ok || !optData.success) { clearTimeout(timeoutId); throw new Error(optData.error || 'Failed to get registration options'); }

            let registration;
            try {
                registration = await startRegistration({ optionsJSON: optData.data });
                clearTimeout(timeoutId);
            } catch (err: unknown) {
                clearTimeout(timeoutId);
                if (err instanceof Error) {
                    if (timedOut) throw new Error('Passkey setup timed out — check for a system dialog on your screen');
                    if (err.name === 'NotAllowedError') throw new Error('Passkey registration was cancelled or denied');
                    if (err.name === 'InvalidStateError') throw new Error('A passkey for this device is already registered');
                    if (err.name === 'NotSupportedError') throw new Error('Passkeys are not supported on this device or browser');
                    if (err.name === 'SecurityError') throw new Error('Security error — ensure you are on a secure origin');
                }
                throw new Error('Passkey creation failed');
            }

            const regRes = await fetch('/api/auth/passkey/register', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newPasskeyName.trim() || 'My Passkey', response: registration }),
            });
            const regData = await regRes.json();
            if (!regRes.ok || !regData.success) throw new Error(regData.error || 'Failed to register passkey');

            setUser(u => u ? { ...u, passkeyEnabled: true } : null);
            setShowAddPasskey(false); setNewPasskeyName('');
            addToast('success', 'Passkey added successfully');
            loadPasskeys();
        } catch (err: unknown) {
            setPasskeyError(err instanceof Error ? err.message : 'Failed to add passkey');
        } finally { setAddingPasskey(false); }
    };

    const handleDeletePasskey = async (id: string) => {
        try {
            const res = await fetch(`/api/auth/passkey/${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) {
                setPasskeys(prev => {
                    const next = prev.filter(p => p.id !== id);
                    if (next.length === 0) setUser(u => u ? { ...u, passkeyEnabled: false } : null);
                    return next;
                });
                addToast('success', 'Passkey removed');
            } else addToast('error', data.error || 'Failed to remove passkey');
        } catch { addToast('error', 'Failed to remove passkey'); }
    };

    const copyCode = async (code: string) => {
        await navigator.clipboard.writeText(code);
        setCopiedCode(code);
        setTimeout(() => setCopiedCode(null), 2000);
    };

    // ── Encryption ────────────────────────────────────────────────────────────

    const handleChangePassphrase = async (e: React.FormEvent) => {
        e.preventDefault();
        if (encryptionPassphrase !== encryptionConfirm || encryptionPassphrase.length < 8) return;
        setEncryptionLoading(true);
        try {
            const res = await fetch('/api/auth/setup-encryption', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ passphrase: encryptionPassphrase }),
            });
            const data = await res.json();
            if (data.success) {
                addToast('success', 'Encryption passphrase updated');
                setEncryptionPassphrase(''); setEncryptionConfirm('');
                setUser(u => u ? { ...u, hasMasterKey: true } : u);
            } else addToast('error', data.error || 'Failed to update passphrase');
        } catch { addToast('error', 'Something went wrong'); }
        finally { setEncryptionLoading(false); }
    };

    const handleResetEncryption = async () => {
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
        } finally { setResettingEncryption(false); }
    };

    // ── Auth sessions ─────────────────────────────────────────────────────────

    const handleRevokeSession = async (id: string) => {
        try {
            const res = await fetch(`/api/auth/sessions/${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) {
                setAuthSessions(prev => prev.filter(s => s.id !== id));
                addToast('success', 'Session revoked');
            } else addToast('error', data.error || 'Failed to revoke session');
        } catch { addToast('error', 'Failed to revoke session'); }
    };

    const handleRevokeAllOthers = async () => {
        setRevokingAll(true);
        const others = authSessions.filter(s => !s.isCurrent);
        let count = 0;
        for (const s of others) {
            try {
                const res = await fetch(`/api/auth/sessions/${s.id}`, { method: 'DELETE' });
                const data = await res.json();
                if (data.success) count++;
            } catch { /* continue */ }
        }
        setAuthSessions(prev => prev.filter(s => s.isCurrent));
        addToast('success', `Revoked ${count} session${count !== 1 ? 's' : ''}`);
        setRevokingAll(false);
    };

    // ── Render ────────────────────────────────────────────────────────────────

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
        <div className="max-w-5xl mx-auto pb-16">
            <div className="mb-6">
                <h1 className="text-2xl font-bold">Settings</h1>
                <p className="text-muted-foreground text-sm mt-1">Manage your account, security, and preferences</p>
            </div>

            {/* Unverified banner */}
            {user && !user.isVerified && (
                <div className="mb-6 flex items-center justify-between gap-4 px-4 py-3 rounded-xl bg-yellow-500/10 border border-yellow-500/30 text-sm">
                    <div className="flex items-center gap-2 text-yellow-300">
                        <Info className="w-4 h-4 shrink-0" />
                        Your email address is not verified.
                    </div>
                    <button
                        onClick={async () => {
                            setResendingVerification(true);
                            try { await fetch('/api/auth/send-verification', { method: 'POST' }); setVerificationSent(true); }
                            finally { setResendingVerification(false); }
                        }}
                        disabled={resendingVerification || verificationSent}
                        className="text-xs font-medium text-yellow-300 hover:text-yellow-200 underline shrink-0 disabled:opacity-50"
                    >
                        {verificationSent ? 'Email sent!' : resendingVerification ? 'Sending…' : 'Resend verification'}
                    </button>
                </div>
            )}

            {/* Recovery codes overlay */}
            {recoveryCodes.length > 0 && (
                <div className="mb-6 p-5 rounded-xl bg-yellow-500/5 border border-yellow-500/30">
                    <div className="flex items-center gap-2 mb-3">
                        <AlertTriangle className="w-5 h-5 text-yellow-400" />
                        <h2 className="font-semibold text-yellow-400">Save your recovery codes</h2>
                    </div>
                    <p className="text-sm text-muted-foreground mb-4">
                        Store these securely. Each code can only be used once and won&apos;t be shown again.
                    </p>
                    <div className="grid grid-cols-1 xs:grid-cols-2 gap-2 mb-4">
                        {recoveryCodes.map(code => (
                            <div key={code} className="flex items-center justify-between bg-background rounded-lg px-3 py-2.5 font-mono text-sm border border-border">
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
                </div>
            )}

            <div className="flex gap-6">
                {/* ── Sidebar (desktop only) ── */}
                <aside className="hidden lg:flex flex-col w-52 shrink-0">
                    {user && (
                        <div className="mb-4 p-3 rounded-xl bg-card border border-border">
                            <div className="flex items-center gap-3 mb-3">
                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center text-white font-semibold text-sm shrink-0">
                                    {user.email[0].toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                    <p className="text-xs font-medium truncate">{user.email}</p>
                                    <div className="flex items-center gap-1 mt-0.5">
                                        {user.isVerified
                                            ? <span className="text-[10px] text-green-400 flex items-center gap-1"><CheckCircle className="w-2.5 h-2.5" />Verified</span>
                                            : <span className="text-[10px] text-yellow-400">Unverified</span>
                                        }
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                    <SidebarNav
                        active={activeSection}
                        onChange={setActiveSection}
                        user={user}
                        passkeys={passkeys}
                        sessions={authSessions}
                    />
                </aside>

                {/* ── Content ── */}
                <div className="flex-1 min-w-0">

                {/* ── Mobile section picker ── */}
                <div className="lg:hidden mb-4 -mx-1">
                    <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1 px-1">
                        {(['profile', 'security', 'passkeys', 'encryption', 'notifications', 'sessions', 'danger'] as Section[]).map(s => {
                            const labels: Record<Section, string> = {
                                profile: 'Profile', security: 'Security', passkeys: 'Passkeys',
                                encryption: 'Encrypt', notifications: 'Alerts', sessions: 'Sessions', danger: 'Danger',
                            };
                            return (
                                <button
                                    key={s}
                                    onClick={() => setActiveSection(s)}
                                    className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors shrink-0 ${
                                        activeSection === s
                                            ? s === 'danger' ? 'bg-red-500/20 text-red-400' : 'bg-primary/20 text-primary'
                                            : 'bg-secondary text-muted-foreground hover:text-foreground'
                                    }`}
                                >
                                    {labels[s]}
                                </button>
                            );
                        })}
                    </div>
                </div>

                    {/* ══════════════ PROFILE ══════════════ */}
                    {activeSection === 'profile' && user && (
                        <div className="space-y-4">
                            <SecurityScore user={user} passkeys={passkeys} />

                            <Card className="p-5">
                                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Account Details</h2>
                                <div className="space-y-0">
                                    <div className="flex flex-wrap items-center justify-between gap-1 py-2.5 border-b border-border/50">
                                        <span className="text-sm text-muted-foreground shrink-0">Email</span>
                                        <span className="text-sm flex items-center gap-1.5 min-w-0">
                                            <span className="truncate max-w-[180px] sm:max-w-xs">{user.email}</span>
                                            {user.isVerified
                                                ? <CheckCircle className="w-3.5 h-3.5 text-green-400 shrink-0" />
                                                : <AlertCircle className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
                                            }
                                        </span>
                                    </div>
                                    <div className="flex flex-wrap items-center justify-between gap-1 py-2.5 border-b border-border/50">
                                        <span className="text-sm text-muted-foreground shrink-0">Sign-in</span>
                                        <span className="text-sm">
                                            {user.isGoogleUser ? (
                                                <span className="flex items-center gap-1.5">
                                                    <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24"><path fill="#4285f4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34a853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#fbbc05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#ea4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                                                    Google OAuth
                                                </span>
                                            ) : 'Password'}
                                        </span>
                                    </div>
                                    <div className="flex flex-wrap items-center justify-between gap-1 py-2.5 border-b border-border/50">
                                        <span className="text-sm text-muted-foreground shrink-0">Two-factor auth</span>
                                        <span className={`text-sm font-medium ${has2FA ? 'text-green-400' : 'text-muted-foreground'}`}>
                                            {user.twoFactorMethod === 'TOTP' ? 'Authenticator App'
                                                : user.twoFactorMethod === 'EMAIL' ? 'Email OTP'
                                                : 'Disabled'}
                                        </span>
                                    </div>
                                    <div className="flex flex-wrap items-center justify-between gap-1 py-2.5 border-b border-border/50">
                                        <span className="text-sm text-muted-foreground shrink-0">Passkeys</span>
                                        <span className={`text-sm font-medium ${user.passkeyEnabled ? 'text-green-400' : 'text-muted-foreground'}`}>
                                            {user.passkeyEnabled ? `${passkeys.length} registered` : 'None'}
                                        </span>
                                    </div>
                                    <div className="flex flex-wrap items-center justify-between gap-1 py-2.5">
                                        <span className="text-sm text-muted-foreground shrink-0">Encryption key</span>
                                        <span className={`text-sm font-medium ${user.hasMasterKey || !user.isGoogleUser ? 'text-green-400' : 'text-yellow-400'}`}>
                                            {!user.isGoogleUser ? 'Auto (password-derived)' : user.hasMasterKey ? 'Configured' : 'Not set'}
                                        </span>
                                    </div>
                                </div>
                            </Card>

                            <Card className="p-5">
                                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Quick Actions</h2>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    <button
                                        onClick={() => setActiveSection('security')}
                                        className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors text-sm group"
                                    >
                                        <div className="flex items-center gap-2.5">
                                            <Shield className="w-4 h-4 text-violet-400" />
                                            <span>{has2FA ? 'Manage 2FA' : 'Enable 2FA'}</span>
                                        </div>
                                        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground" />
                                    </button>
                                    <button
                                        onClick={() => setActiveSection('passkeys')}
                                        className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors text-sm group"
                                    >
                                        <div className="flex items-center gap-2.5">
                                            <Fingerprint className="w-4 h-4 text-primary" />
                                            <span>Add Passkey</span>
                                        </div>
                                        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground" />
                                    </button>
                                    <button
                                        onClick={() => setActiveSection('sessions')}
                                        className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors text-sm group"
                                    >
                                        <div className="flex items-center gap-2.5">
                                            <Monitor className="w-4 h-4 text-sky-400" />
                                            <span>Active Sessions</span>
                                        </div>
                                        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground" />
                                    </button>
                                    <button
                                        onClick={() => setActiveSection('notifications')}
                                        className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors text-sm group"
                                    >
                                        <div className="flex items-center gap-2.5">
                                            <Bell className="w-4 h-4 text-amber-400" />
                                            <span>Notifications</span>
                                        </div>
                                        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground" />
                                    </button>
                                </div>
                            </Card>
                        </div>
                    )}

                    {/* ══════════════ SECURITY ══════════════ */}
                    {activeSection === 'security' && (
                        <div className="space-y-4">
                            {/* ── 2FA ── */}
                            <Card className="p-5">
                                <Section
                                    title="Two-Factor Authentication"
                                    description="Require a second verification step when signing in."
                                    icon={Shield}
                                    iconBg="bg-violet-500/15 text-violet-400"
                                >
                                    {!has2FA && !setup2FA && (
                                        <div className="space-y-4">
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                <button
                                                    onClick={handleSetupTOTP}
                                                    className="flex flex-col items-start gap-2 p-4 rounded-xl border border-border bg-secondary/30 hover:bg-secondary/60 hover:border-primary/30 transition-all text-left group"
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <Smartphone className="w-4 h-4 text-violet-400" />
                                                        <span className="text-sm font-medium">Authenticator App</span>
                                                    </div>
                                                    <p className="text-xs text-muted-foreground">Google Authenticator, Authy, 1Password, etc.</p>
                                                    <span className="text-xs text-primary font-medium flex items-center gap-1">
                                                        Recommended <Zap className="w-3 h-3" />
                                                    </span>
                                                </button>
                                                <button
                                                    onClick={handleEnableEmailOTP}
                                                    disabled={enablingEmailOTP}
                                                    className="flex flex-col items-start gap-2 p-4 rounded-xl border border-border bg-secondary/30 hover:bg-secondary/60 transition-all text-left"
                                                >
                                                    <div className="flex items-center gap-2">
                                                        {enablingEmailOTP
                                                            ? <Loader2 className="w-4 h-4 animate-spin text-primary" />
                                                            : <Mail className="w-4 h-4 text-sky-400" />
                                                        }
                                                        <span className="text-sm font-medium">Email OTP</span>
                                                    </div>
                                                    <p className="text-xs text-muted-foreground">A 6-digit code sent to your email on each login.</p>
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {setup2FA && (
                                        <div className="space-y-4">
                                            <div className="p-4 bg-secondary/50 rounded-xl text-center border border-border">
                                                {qrCode && <img src={qrCode} alt="2FA QR Code" className="mx-auto mb-4 rounded-lg" style={{ imageRendering: 'pixelated' }} />}
                                                <p className="text-sm text-muted-foreground mb-2">Scan with your authenticator app</p>
                                                <p className="text-xs text-muted-foreground/60 mb-2">Or enter this key manually:</p>
                                                <code className="text-xs text-foreground/80 bg-card px-3 py-2 rounded-lg break-all border border-border block">{secret}</code>
                                            </div>
                                            <div className="space-y-1.5">
                                                <Label>Enter the 6-digit code to verify</Label>
                                                <Input
                                                    type="text"
                                                    value={verifyCode}
                                                    onChange={e => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                                    className="bg-secondary border-border text-center text-2xl tracking-[0.5em] font-mono h-12"
                                                    placeholder="000000"
                                                    maxLength={6}
                                                    inputMode="numeric"
                                                    autoComplete="one-time-code"
                                                    autoFocus
                                                />
                                            </div>
                                            <div className="flex gap-2">
                                                <Button variant="secondary" onClick={() => setSetup2FA(false)}>Cancel</Button>
                                                <Button onClick={handleEnableTOTP} disabled={verifyCode.length !== 6 || enabling2FA} className="flex-1">
                                                    {enabling2FA ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Verify & Enable'}
                                                </Button>
                                            </div>
                                        </div>
                                    )}

                                    {has2FA && !showDisable && (
                                        <div className="space-y-3">
                                            <div className="flex items-center gap-3 p-3 rounded-xl bg-green-500/10 border border-green-500/20 text-sm text-green-300">
                                                <ShieldCheck className="w-4 h-4 shrink-0" />
                                                <div>
                                                    <p className="font-medium">
                                                        {user?.twoFactorMethod === 'TOTP' ? 'Authenticator app is active' : 'Email OTP is active'}
                                                    </p>
                                                    <p className="text-xs text-green-300/70 mt-0.5">
                                                        {user?.twoFactorMethod === 'TOTP'
                                                            ? 'Keep your recovery codes stored safely.'
                                                            : 'A code is sent to your email on each login.'}
                                                    </p>
                                                </div>
                                            </div>
                                            <Button variant="outline" size="sm" onClick={() => setShowDisable(true)}
                                                className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive">
                                                <ShieldOff className="w-3.5 h-3.5" /> Disable 2FA
                                            </Button>
                                        </div>
                                    )}

                                    {showDisable && (
                                        <div className="space-y-3">
                                            <div className="flex items-start gap-3 p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-sm text-destructive">
                                                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                                                Disabling 2FA reduces your account security. Confirm your password to continue.
                                            </div>
                                            <div className="space-y-1.5">
                                                <Label>Confirm Password</Label>
                                                <Input
                                                    type="password"
                                                    value={disablePassword}
                                                    onChange={e => setDisablePassword(e.target.value)}
                                                    className="bg-secondary border-border"
                                                    placeholder="Your current password"
                                                    autoFocus
                                                />
                                            </div>
                                            <div className="flex gap-2">
                                                <Button variant="secondary" onClick={() => { setShowDisable(false); setDisablePassword(''); }}>Cancel</Button>
                                                <Button variant="destructive" onClick={handleDisable2FA} disabled={!disablePassword || disabling2FA} className="flex-1">
                                                    {disabling2FA ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Disable 2FA'}
                                                </Button>
                                            </div>
                                        </div>
                                    )}
                                </Section>
                            </Card>

                            {/* ── Change Password ── */}
                            {!user?.isGoogleUser && (
                                <Card className="p-5">
                                    <Section
                                        title="Change Password"
                                        description="Update your account password. Use a strong, unique password."
                                        icon={Key}
                                        iconBg="bg-amber-500/15 text-amber-400"
                                    >
                                        <form onSubmit={handleChangePassword} className="space-y-3">
                                            <div className="space-y-1.5">
                                                <Label>Current Password</Label>
                                                <div className="relative">
                                                    <Input
                                                        type={showPasswords.current ? 'text' : 'password'}
                                                        value={passwordForm.current}
                                                        onChange={e => setPasswordForm({ ...passwordForm, current: e.target.value })}
                                                        className="bg-secondary border-border pr-10"
                                                        autoComplete="current-password"
                                                        required
                                                    />
                                                    <button type="button"
                                                        onClick={() => setShowPasswords(s => ({ ...s, current: !s.current }))}
                                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                                    >
                                                        {showPasswords.current ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="space-y-1.5">
                                                <Label>New Password</Label>
                                                <div className="relative">
                                                    <Input
                                                        type={showPasswords.new ? 'text' : 'password'}
                                                        value={passwordForm.new}
                                                        onChange={e => setPasswordForm({ ...passwordForm, new: e.target.value })}
                                                        className="bg-secondary border-border pr-10"
                                                        autoComplete="new-password"
                                                        required minLength={8}
                                                    />
                                                    <button type="button"
                                                        onClick={() => setShowPasswords(s => ({ ...s, new: !s.new }))}
                                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                                    >
                                                        {showPasswords.new ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                                    </button>
                                                </div>
                                                <PasswordStrength password={passwordForm.new} />
                                            </div>
                                            <div className="space-y-1.5">
                                                <Label>Confirm New Password</Label>
                                                <div className="relative">
                                                    <Input
                                                        type={showPasswords.confirm ? 'text' : 'password'}
                                                        value={passwordForm.confirm}
                                                        onChange={e => setPasswordForm({ ...passwordForm, confirm: e.target.value })}
                                                        className={`bg-secondary pr-10 ${passwordForm.confirm && !passwordsMatch ? 'border-destructive' : 'border-border'}`}
                                                        autoComplete="new-password"
                                                        required
                                                    />
                                                    <button type="button"
                                                        onClick={() => setShowPasswords(s => ({ ...s, confirm: !s.confirm }))}
                                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                                    >
                                                        {showPasswords.confirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                                    </button>
                                                </div>
                                                {passwordForm.confirm && !passwordsMatch && (
                                                    <p className="text-xs text-destructive flex items-center gap-1">
                                                        <AlertCircle className="w-3 h-3" /> Passwords do not match
                                                    </p>
                                                )}
                                            </div>
                                            <Button type="submit" disabled={changingPassword || !passwordsMatch} className="gap-2 mt-1">
                                                {changingPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
                                                {changingPassword ? 'Changing…' : 'Change Password'}
                                            </Button>
                                        </form>
                                    </Section>
                                </Card>
                            )}
                        </div>
                    )}

                    {/* ══════════════ PASSKEYS ══════════════ */}
                    {activeSection === 'passkeys' && (
                        <Card className="p-5">
                            <Section
                                title="Passkeys"
                                description="Sign in with biometrics or a security key — no password needed."
                                icon={Fingerprint}
                                iconBg="bg-primary/15 text-primary"
                            >
                                {loadingPasskeys ? (
                                    <div className="flex items-center gap-2 text-sm text-muted-foreground py-4 justify-center">
                                        <Loader2 className="w-4 h-4 animate-spin" /> Loading…
                                    </div>
                                ) : passkeys.length > 0 ? (
                                    <div className="space-y-2 mb-4">
                                        {passkeys.map(pk => (
                                            <PasskeyRow key={pk.id} passkey={pk} onDelete={handleDeletePasskey} />
                                        ))}
                                    </div>
                                ) : (
                                    <div className="mb-4 flex items-center gap-3 p-4 rounded-xl bg-secondary/50 border border-border/50 text-sm text-muted-foreground">
                                        <MonitorSmartphone className="w-4 h-4 shrink-0" />
                                        No passkeys registered. Add one to enable passwordless sign-in on this device.
                                    </div>
                                )}

                                {isElectron ? (
                                    <div className="flex items-start gap-2.5 p-4 rounded-xl bg-secondary/50 border border-border/50 text-sm text-muted-foreground">
                                        <Info className="w-4 h-4 shrink-0 mt-0.5 text-primary/70" />
                                        Passkeys are not available in the desktop app. Open Termi in a web browser to add or use passkeys.
                                    </div>
                                ) : showAddPasskey ? (
                                    <div className="space-y-3 p-4 rounded-xl bg-secondary/50 border border-border">
                                        <p className="text-sm font-medium">Name this passkey</p>
                                        <p className="text-xs text-muted-foreground">Identify the device — e.g. &quot;MacBook Touch ID&quot; or &quot;iPhone Face ID&quot;.</p>
                                        <Input
                                            type="text"
                                            value={newPasskeyName}
                                            onChange={e => setNewPasskeyName(e.target.value)}
                                            placeholder="My Passkey"
                                            className="bg-card border-border"
                                            maxLength={64}
                                            disabled={addingPasskey}
                                            autoFocus
                                        />
                                        {passkeyError && (
                                            <div className="flex items-start gap-2 p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-sm text-destructive">
                                                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                                                {passkeyError}
                                            </div>
                                        )}
                                        <div className="flex gap-2">
                                            <Button variant="secondary" size="sm"
                                                onClick={() => { setShowAddPasskey(false); setNewPasskeyName(''); setPasskeyError(''); }}
                                                disabled={addingPasskey}
                                            >Cancel</Button>
                                            <Button size="sm" onClick={handleAddPasskey} disabled={addingPasskey} className="flex-1">
                                                {addingPasskey
                                                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Waiting for system dialog…</>
                                                    : <><Fingerprint className="w-4 h-4" /> Create Passkey</>
                                                }
                                            </Button>
                                        </div>
                                    </div>
                                ) : (
                                    <Button variant="secondary" size="sm" onClick={() => { setShowAddPasskey(true); setPasskeyError(''); }} className="gap-2">
                                        <Plus className="w-4 h-4" /> Add Passkey
                                    </Button>
                                )}

                                {!isElectron && (
                                    <p className="text-xs text-muted-foreground/50 mt-4">
                                        Requires a device with biometrics or hardware security key, and a modern browser (Chrome 108+, Safari 16+, Firefox 119+).
                                    </p>
                                )}
                            </Section>
                        </Card>
                    )}

                    {/* ══════════════ ENCRYPTION ══════════════ */}
                    {activeSection === 'encryption' && (
                        <Card className="p-5">
                            <Section
                                title="Credential Encryption"
                                description="How your stored server credentials are protected at rest."
                                icon={Lock}
                                iconBg="bg-sky-500/15 text-sky-400"
                            >
                                {user?.isGoogleUser ? (
                                    <div className="space-y-4">
                                        <div className={`flex items-center gap-2 p-3 rounded-xl text-sm ${
                                            user.hasMasterKey
                                                ? 'bg-green-500/10 border border-green-500/20 text-green-300'
                                                : 'bg-yellow-500/10 border border-yellow-500/20 text-yellow-300'
                                        }`}>
                                            {user.hasMasterKey
                                                ? <><CheckCircle2 className="w-4 h-4 shrink-0" /> Encryption passphrase is set</>
                                                : <><AlertTriangle className="w-4 h-4 shrink-0" /> No passphrase set — server connections won&apos;t work</>
                                            }
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            Your server credentials are encrypted with your passphrase. You enter it each time you sign in with Google.
                                        </p>
                                        <form onSubmit={handleChangePassphrase} className="space-y-3">
                                            <p className="text-sm text-muted-foreground font-medium">
                                                {user.hasMasterKey ? 'Change encryption passphrase' : 'Set up encryption passphrase'}
                                            </p>
                                            <Input
                                                type="password"
                                                placeholder="New passphrase (min 8 characters)"
                                                value={encryptionPassphrase}
                                                onChange={e => setEncryptionPassphrase(e.target.value)}
                                                className="bg-secondary border-border"
                                                required minLength={8}
                                            />
                                            <Input
                                                type="password"
                                                placeholder="Confirm passphrase"
                                                value={encryptionConfirm}
                                                onChange={e => setEncryptionConfirm(e.target.value)}
                                                className={`bg-secondary ${encryptionConfirm && encryptionPassphrase !== encryptionConfirm ? 'border-destructive' : 'border-border'}`}
                                                required minLength={8}
                                            />
                                            {encryptionConfirm && encryptionPassphrase !== encryptionConfirm && (
                                                <p className="text-xs text-destructive">Passphrases do not match</p>
                                            )}
                                            <Button type="submit"
                                                disabled={encryptionLoading || !encryptionPassphrase || encryptionPassphrase !== encryptionConfirm}
                                                className="w-full gap-2"
                                            >
                                                {encryptionLoading
                                                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
                                                    : <><Key className="w-4 h-4" /> {user.hasMasterKey ? 'Update Passphrase' : 'Set Passphrase'}</>
                                                }
                                            </Button>
                                        </form>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        <div className="flex items-center gap-2 p-3 rounded-xl bg-green-500/10 border border-green-500/20 text-sm text-green-300">
                                            <CheckCircle2 className="w-4 h-4 shrink-0" />
                                            Encryption active — key derived from your login password
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            Credentials are encrypted with a key derived from your password.
                                            Changing your password automatically re-encrypts all credentials.
                                            If you reset a forgotten password, stored credentials are permanently lost.
                                        </p>
                                    </div>
                                )}
                            </Section>
                        </Card>
                    )}

                    {/* ══════════════ NOTIFICATIONS ══════════════ */}
                    {activeSection === 'notifications' && (
                        <Card className="p-5">
                            <Section
                                title="Push Notifications"
                                description="Get browser notifications for server down/up alerts on this device."
                                icon={BellRing}
                                iconBg="bg-amber-500/15 text-amber-400"
                            >
                                <div className="space-y-4">
                                    <div className={`flex items-center gap-3 p-4 rounded-xl border ${
                                        pushSubscribed
                                            ? 'bg-green-500/10 border-green-500/20'
                                            : pushPermission === 'denied'
                                                ? 'bg-red-500/10 border-red-500/20'
                                                : 'bg-secondary/50 border-border/50'
                                    }`}>
                                        {pushSubscribed ? (
                                            <>
                                                <div className="w-9 h-9 rounded-lg bg-green-500/20 flex items-center justify-center shrink-0">
                                                    <Bell className="w-4 h-4 text-green-400" />
                                                </div>
                                                <div>
                                                    <p className="text-sm font-medium text-green-400">Notifications active</p>
                                                    <p className="text-xs text-muted-foreground mt-0.5">This device will receive server alert notifications</p>
                                                </div>
                                            </>
                                        ) : pushPermission === 'denied' ? (
                                            <>
                                                <div className="w-9 h-9 rounded-lg bg-red-500/20 flex items-center justify-center shrink-0">
                                                    <BellOff className="w-4 h-4 text-red-400" />
                                                </div>
                                                <div>
                                                    <p className="text-sm font-medium text-red-400">Notifications blocked</p>
                                                    <p className="text-xs text-muted-foreground mt-0.5">
                                                        Enable them in your browser site settings, then reload this page.
                                                    </p>
                                                </div>
                                            </>
                                        ) : (
                                            <>
                                                <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                                                    <BellOff className="w-4 h-4 text-muted-foreground" />
                                                </div>
                                                <div>
                                                    <p className="text-sm font-medium">Notifications off</p>
                                                    <p className="text-xs text-muted-foreground mt-0.5">Enable to get server alerts on this device</p>
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

                                    <div className="flex items-start gap-2 text-xs text-muted-foreground/60">
                                        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                        Notifications are per-device. Enable separately on each device. Alert rules are configured per server in the server details page.
                                    </div>
                                </div>
                            </Section>
                        </Card>
                    )}

                    {/* ══════════════ SESSIONS ══════════════ */}
                    {activeSection === 'sessions' && (
                        <Card className="p-5">
                            <Section
                                title="Active Sessions"
                                description="Devices and browsers that are currently signed in to your account."
                                icon={Monitor}
                                iconBg="bg-sky-500/15 text-sky-400"
                            >
                                {loadingSessions ? (
                                    <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        <span className="text-sm">Loading sessions…</span>
                                    </div>
                                ) : authSessions.length === 0 ? (
                                    <p className="text-sm text-muted-foreground py-4 text-center">No sessions found</p>
                                ) : (
                                    <div className="space-y-2">
                                        {authSessions.map(s => (
                                            <SessionRow key={s.id} session={s} onRevoke={handleRevokeSession} />
                                        ))}
                                    </div>
                                )}

                                {authSessions.filter(s => !s.isCurrent).length > 0 && (
                                    <div className="mt-4 flex items-center justify-between pt-4 border-t border-border/50">
                                        <p className="text-xs text-muted-foreground">
                                            {authSessions.filter(s => !s.isCurrent).length} other device{authSessions.filter(s => !s.isCurrent).length !== 1 ? 's' : ''} signed in
                                        </p>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={handleRevokeAllOthers}
                                            disabled={revokingAll}
                                            className="gap-2 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                        >
                                            {revokingAll
                                                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Revoking…</>
                                                : <><LogOut className="w-3.5 h-3.5" /> Sign out all others</>
                                            }
                                        </Button>
                                    </div>
                                )}

                                <div className="mt-4 flex items-start gap-2 text-xs text-muted-foreground/60">
                                    <RefreshCw className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                    Revoking a session will sign out that device immediately.
                                </div>
                            </Section>
                        </Card>
                    )}

                    {/* ══════════════ DANGER ZONE ══════════════ */}
                    {activeSection === 'danger' && (
                        <Card className="p-5 border-red-500/20">
                            <Section
                                title="Danger Zone"
                                description="Irreversible actions that permanently affect your account."
                                icon={AlertTriangle}
                                iconBg="bg-red-500/15 text-red-400"
                            >
                                <div className="space-y-4">
                                    {/* Reset Encryption */}
                                    {user?.isGoogleUser && (
                                        <div className="p-4 rounded-xl border border-red-500/20 bg-red-500/5">
                                            <div className="flex items-start justify-between gap-4">
                                                <div>
                                                    <p className="text-sm font-medium text-red-300">Reset Encryption Key</p>
                                                    <p className="text-xs text-muted-foreground mt-1">
                                                        Permanently deletes all stored servers and credentials. You&apos;ll need to re-add everything from scratch.
                                                    </p>
                                                </div>
                                                {!showEncryptionResetConfirm && (
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => setShowEncryptionResetConfirm(true)}
                                                        className="shrink-0 border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300"
                                                    >
                                                        Reset
                                                    </Button>
                                                )}
                                            </div>
                                            {showEncryptionResetConfirm && (
                                                <div className="mt-4 pt-4 border-t border-red-500/20 space-y-3">
                                                    <p className="text-sm text-red-300 font-medium">
                                                        This will permanently delete all your stored servers and credentials. This cannot be undone.
                                                    </p>
                                                    <div className="flex gap-2">
                                                        <Button variant="destructive" size="sm" onClick={handleResetEncryption} disabled={resettingEncryption}>
                                                            {resettingEncryption && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                                            Delete Everything & Reset
                                                        </Button>
                                                        <Button variant="ghost" size="sm" onClick={() => setShowEncryptionResetConfirm(false)}>
                                                            Cancel
                                                        </Button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {!user?.isGoogleUser && (
                                        <div className="p-4 rounded-xl border border-border/50 bg-secondary/30">
                                            <p className="text-sm text-muted-foreground">
                                                Password-based accounts use a login-derived encryption key.
                                                Encryption reset is only available for Google-authenticated accounts.
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </Section>
                        </Card>
                    )}
                </div>
            </div>

            <ToastList toasts={toasts} onDismiss={dismissToast} />
        </div>
    );
}
