'use client';

import { useState } from 'react';

import {
    AlertCircle,
    AlertTriangle,
    Eye,
    EyeOff,
    Key,
    Loader2,
    Mail,
    Shield,
    ShieldCheck,
    ShieldOff,
    Smartphone,
    Zap,
    Lock,
} from 'lucide-react';
import { LOCK_NOW_EVENT } from '../../_shell/AppLock';
import { revalidate } from '@/lib/hooks/useCachedFetch';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PasswordStrength } from '../_components/PasswordStrength';
import { SettingsSection } from '../_components/SettingsSection';
import type { useAccountSettings } from '../_hooks/useAccountSettings';
import type { useTwoFactor } from '../_hooks/useTwoFactor';
import type { User } from '../types';

type TwoFactor = ReturnType<typeof useTwoFactor>;
type PasswordState = ReturnType<typeof useAccountSettings>['password'];

/** Choose an enrolment method — shown only when 2FA is off. */
function MethodPicker({ twoFactor }: { twoFactor: TwoFactor }) {
    return (
        <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                    onClick={twoFactor.startTotpSetup}
                    className="flex flex-col items-start gap-2 p-4 rounded-xl border border-border bg-secondary/30 hover:bg-secondary/60 hover:border-primary/30 transition-all text-left group"
                >
                    <div className="flex items-center gap-2">
                        <Smartphone className="w-4 h-4 text-local" />
                        <span className="text-sm font-medium">Authenticator app</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Google Authenticator, Authy, 1Password, etc.
                    </p>
                    <span className="text-xs text-primary font-medium flex items-center gap-1">
                        Recommended <Zap className="w-3 h-3" />
                    </span>
                </button>
                <button
                    onClick={twoFactor.enableEmailOtp}
                    disabled={twoFactor.enablingEmailOtp}
                    className="flex flex-col items-start gap-2 p-4 rounded-xl border border-border bg-secondary/30 hover:bg-secondary/60 transition-all text-left"
                >
                    <div className="flex items-center gap-2">
                        {twoFactor.enablingEmailOtp ? (
                            <Loader2 className="w-4 h-4 animate-spin text-primary" />
                        ) : (
                            <Mail className="w-4 h-4 text-info" />
                        )}
                        <span className="text-sm font-medium">Email OTP</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        A 6-digit code sent to your email on each login.
                    </p>
                </button>
            </div>
        </div>
    );
}

/** QR + manual secret + verification code entry. */
function TotpEnrolment({ twoFactor }: { twoFactor: TwoFactor }) {
    return (
        <div className="space-y-4">
            <div className="p-4 bg-secondary/50 rounded-xl text-center border border-border">
                {twoFactor.qrCode && (
                    // eslint-disable-next-line @next/next/no-img-element -- QR is a runtime base64 data URL; next/image adds no benefit
                    <img
                        src={twoFactor.qrCode}
                        alt="2FA QR Code"
                        className="mx-auto mb-4 rounded-lg"
                        style={{ imageRendering: 'pixelated' }}
                    />
                )}
                <p className="text-sm text-muted-foreground mb-2">
                    Scan with your authenticator app
                </p>
                <p className="text-xs text-muted-foreground/60 mb-2">Or enter this key manually:</p>
                <code className="text-xs text-foreground/80 bg-card px-3 py-2 rounded-lg break-all border border-border block">
                    {twoFactor.secret}
                </code>
            </div>
            <div className="space-y-1.5">
                <Label>Enter the 6-digit code to verify</Label>
                <Input
                    type="text"
                    value={twoFactor.verifyCode}
                    onChange={(e) =>
                        twoFactor.setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                    }
                    className="text-center text-2xl tracking-[0.5em] font-mono h-12"
                    placeholder="000000"
                    maxLength={6}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    autoFocus
                />
            </div>
            <div className="flex gap-2">
                <Button variant="secondary" onClick={() => twoFactor.setSetupOpen(false)}>
                    Cancel
                </Button>
                <Button
                    onClick={twoFactor.enableTotp}
                    disabled={twoFactor.verifyCode.length !== 6 || twoFactor.enabling}
                    className="flex-1"
                >
                    {twoFactor.enabling ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                        'Verify & Enable'
                    )}
                </Button>
            </div>
        </div>
    );
}

function DisableConfirm({ twoFactor }: { twoFactor: TwoFactor }) {
    return (
        <div className="space-y-3">
            <div className="flex items-start gap-3 p-3 rounded-xl bg-danger/10 border border-danger/20 text-sm text-danger">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                Disabling 2FA reduces your account security. Confirm your password to continue.
            </div>
            <div className="space-y-1.5">
                <Label>Confirm password</Label>
                <Input
                    type="password"
                    value={twoFactor.disablePassword}
                    onChange={(e) => twoFactor.setDisablePassword(e.target.value)}

                    placeholder="Your current password"
                    autoFocus
                />
            </div>
            <div className="flex gap-2">
                <Button
                    variant="secondary"
                    onClick={() => {
                        twoFactor.setShowDisable(false);
                        twoFactor.setDisablePassword('');
                    }}
                >
                    Cancel
                </Button>
                <Button
                    variant="destructive"
                    onClick={twoFactor.disable}
                    disabled={!twoFactor.disablePassword || twoFactor.disabling}
                    className="flex-1"
                >
                    {twoFactor.disabling ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                        'Disable 2FA'
                    )}
                </Button>
            </div>
        </div>
    );
}

/** Password field with a show/hide toggle. */
function SecretField({
    label,
    value,
    onChange,
    visible,
    onToggle,
    autoComplete,
    minLength,
    invalid,
    children,
}: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    visible: boolean;
    onToggle: () => void;
    autoComplete: string;
    minLength?: number;
    invalid?: boolean;
    children?: React.ReactNode;
}) {
    return (
        <div className="space-y-1.5">
            <Label>{label}</Label>
            <div className="relative">
                <Input
                    type={visible ? 'text' : 'password'}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    className={`bg-secondary pr-10 ${invalid ? 'border-destructive' : 'border-border'}`}
                    autoComplete={autoComplete}
                    required
                    minLength={minLength}
                />
                <button
                    type="button"
                    onClick={onToggle}
                    aria-label={visible ? 'Hide password' : 'Show password'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                    {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
            </div>
            {children}
        </div>
    );
}

function ChangePasswordCard({ password }: { password: PasswordState }) {
    const { form, setForm, show, setShow, changing, matches, change } = password;
    return (
        <Card className="border-border p-6 transition-all duration-200 hover:border-border/80">
            <SettingsSection
                title="Change password"
                description="Update your account password. Use a strong, unique password."
                icon={Key}
                iconBg="bg-warning/15 text-warning"
            >
                <form onSubmit={change} className="space-y-3">
                    <SecretField
                        label="Current password"
                        value={form.currentPassword}
                        onChange={(v) => setForm({ ...form, currentPassword: v })}
                        visible={show.currentPassword}
                        onToggle={() =>
                            setShow((s) => ({ ...s, currentPassword: !s.currentPassword }))
                        }
                        autoComplete="current-password"
                    />
                    <SecretField
                        label="New password"
                        value={form.newPassword}
                        onChange={(v) => setForm({ ...form, newPassword: v })}
                        visible={show.newPassword}
                        onToggle={() => setShow((s) => ({ ...s, newPassword: !s.newPassword }))}
                        autoComplete="new-password"
                        minLength={8}
                    >
                        <PasswordStrength password={form.newPassword} />
                    </SecretField>
                    <SecretField
                        label="Confirm new password"
                        value={form.confirmPassword}
                        onChange={(v) => setForm({ ...form, confirmPassword: v })}
                        visible={show.confirmPassword}
                        onToggle={() =>
                            setShow((s) => ({ ...s, confirmPassword: !s.confirmPassword }))
                        }
                        autoComplete="new-password"
                        invalid={!!form.confirmPassword && !matches}
                    >
                        {form.confirmPassword && !matches && (
                            <p className="text-xs text-danger flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" /> Passwords do not match
                            </p>
                        )}
                    </SecretField>
                    <Button type="submit" disabled={changing || !matches} className="gap-2 mt-1">
                        {changing ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <Key className="w-4 h-4" />
                        )}
                        {changing ? 'Changing…' : 'Change password'}
                    </Button>
                </form>
            </SettingsSection>
        </Card>
    );
}

export function SecurityPanel({
    user,
    twoFactor,
    password,
}: {
    user: User | null;
    twoFactor: TwoFactor;
    password: PasswordState;
}) {
    const has2FA = user?.twoFactorMethod !== 'NONE';

    return (
        <div className="space-y-4">
            <Card className="border-border p-6 transition-all duration-200 hover:border-border/80">
                <SettingsSection
                    title="Two-factor authentication"
                    description="Require a second verification step when signing in."
                    icon={Shield}
                    iconBg="bg-local/15 text-local"
                >
                    {!has2FA && !twoFactor.setupOpen && <MethodPicker twoFactor={twoFactor} />}

                    {twoFactor.setupOpen && <TotpEnrolment twoFactor={twoFactor} />}

                    {has2FA && !twoFactor.showDisable && (
                        <div className="space-y-3">
                            <div className="flex items-center gap-3 p-3 rounded-xl bg-success/10 border border-success/20 text-sm text-success">
                                <ShieldCheck className="w-4 h-4 shrink-0" />
                                <div>
                                    <p className="font-medium">
                                        {user?.twoFactorMethod === 'TOTP'
                                            ? 'Authenticator app is active'
                                            : 'Email OTP is active'}
                                    </p>
                                    <p className="text-xs text-success/70 mt-0.5">
                                        {user?.twoFactorMethod === 'TOTP'
                                            ? 'Keep your recovery codes stored safely.'
                                            : 'A code is sent to your email on each login.'}
                                    </p>
                                </div>
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => twoFactor.setShowDisable(true)}
                                className="border-danger/30 text-danger hover:bg-danger/10 hover:text-danger"
                            >
                                <ShieldOff className="w-3.5 h-3.5" /> Disable 2FA
                            </Button>
                        </div>
                    )}

                    {twoFactor.showDisable && <DisableConfirm twoFactor={twoFactor} />}
                </SettingsSection>
            </Card>

            {!user?.isGoogleUser && <ChangePasswordCard password={password} />}

            <AppLockCard initial={user?.lockAfterMinutes ?? null} />
        </div>
    );
}

const LOCK_CHOICES: [number | null, string][] = [
    [null, 'Never'],
    [5, 'After 5 minutes'],
    [15, 'After 15 minutes'],
    [30, 'After 30 minutes'],
    [60, 'After 1 hour'],
];

/** Lock Termi after a while without activity; unlocking needs a password or passkey. */
function AppLockCard({ initial }: { initial: number | null }) {
    const [value, setValue] = useState<number | null>(initial);
    const [saved, setSaved] = useState(false);
    return (
        <SettingsSection
            title="Lock when idle"
            description="Lock Termi after a while without activity, on this and every other device. Open terminals disconnect while locked and reconnect when you unlock with your password or a passkey."
            icon={Lock}
            iconBg="bg-primary/10 text-primary"
        >
            <div className="flex flex-wrap items-center gap-3">
                <select
                    aria-label="Lock when idle"
                    value={value ?? ''}
                    onChange={async (e) => {
                        const next = e.target.value ? Number(e.target.value) : null;
                        setValue(next);
                        setSaved(false);
                        const res = await fetch('/api/account/lock', {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ lockAfterMinutes: next }),
                        });
                        if (res.ok) {
                            setSaved(true);
                            revalidate('/api/auth/me', '/api/auth/me');
                        }
                    }}
                    className="h-9 rounded-md border border-border bg-background px-2 text-sm"
                >
                    {LOCK_CHOICES.map(([v, label]) => (
                        <option key={label} value={v ?? ''}>
                            {label}
                        </option>
                    ))}
                </select>
                <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => window.dispatchEvent(new Event(LOCK_NOW_EVENT))}
                >
                    Lock now
                </Button>
                {saved && <span className="text-xs text-success">Saved</span>}
            </div>
        </SettingsSection>
    );
}
