'use client';

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
} from 'lucide-react';
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
                        <Smartphone className="w-4 h-4 text-violet-400" />
                        <span className="text-sm font-medium">Authenticator App</span>
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
                            <Mail className="w-4 h-4 text-sky-400" />
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
                    className="bg-secondary border-border text-center text-2xl tracking-[0.5em] font-mono h-12"
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
            <div className="flex items-start gap-3 p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-sm text-destructive">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                Disabling 2FA reduces your account security. Confirm your password to continue.
            </div>
            <div className="space-y-1.5">
                <Label>Confirm Password</Label>
                <Input
                    type="password"
                    value={twoFactor.disablePassword}
                    onChange={(e) => twoFactor.setDisablePassword(e.target.value)}
                    className="bg-secondary border-border"
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
                title="Change Password"
                description="Update your account password. Use a strong, unique password."
                icon={Key}
                iconBg="bg-amber-500/15 text-amber-400"
            >
                <form onSubmit={change} className="space-y-3">
                    <SecretField
                        label="Current Password"
                        value={form.currentPassword}
                        onChange={(v) => setForm({ ...form, currentPassword: v })}
                        visible={show.currentPassword}
                        onToggle={() =>
                            setShow((s) => ({ ...s, currentPassword: !s.currentPassword }))
                        }
                        autoComplete="current-password"
                    />
                    <SecretField
                        label="New Password"
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
                        label="Confirm New Password"
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
                            <p className="text-xs text-destructive flex items-center gap-1">
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
                        {changing ? 'Changing…' : 'Change Password'}
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
                    title="Two-Factor Authentication"
                    description="Require a second verification step when signing in."
                    icon={Shield}
                    iconBg="bg-violet-500/15 text-violet-400"
                >
                    {!has2FA && !twoFactor.setupOpen && <MethodPicker twoFactor={twoFactor} />}

                    {twoFactor.setupOpen && <TotpEnrolment twoFactor={twoFactor} />}

                    {has2FA && !twoFactor.showDisable && (
                        <div className="space-y-3">
                            <div className="flex items-center gap-3 p-3 rounded-xl bg-green-500/10 border border-green-500/20 text-sm text-green-300">
                                <ShieldCheck className="w-4 h-4 shrink-0" />
                                <div>
                                    <p className="font-medium">
                                        {user?.twoFactorMethod === 'TOTP'
                                            ? 'Authenticator app is active'
                                            : 'Email OTP is active'}
                                    </p>
                                    <p className="text-xs text-green-300/70 mt-0.5">
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
                                className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            >
                                <ShieldOff className="w-3.5 h-3.5" /> Disable 2FA
                            </Button>
                        </div>
                    )}

                    {twoFactor.showDisable && <DisableConfirm twoFactor={twoFactor} />}
                </SettingsSection>
            </Card>

            {!user?.isGoogleUser && <ChangePasswordCard password={password} />}
        </div>
    );
}
