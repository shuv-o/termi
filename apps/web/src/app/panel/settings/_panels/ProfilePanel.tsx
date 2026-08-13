'use client';

import {
    AlertCircle,
    Bell,
    CheckCircle,
    ChevronRight,
    Fingerprint,
    Loader2,
    Monitor,
    Shield,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SecurityScore } from '../_components/SecurityScore';
import type { Passkey, SectionId, User } from '../types';

function GoogleMark() {
    return (
        <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24">
            <path
                fill="#4285f4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
                fill="#34a853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
                fill="#fbbc05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
                fill="#ea4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
        </svg>
    );
}

function DetailRow({
    label,
    children,
    last,
}: {
    label: string;
    children: React.ReactNode;
    last?: boolean;
}) {
    return (
        <div
            className={`flex flex-wrap items-center justify-between gap-1 py-2.5 ${last ? '' : 'border-b border-border/50'}`}
        >
            <span className="text-sm text-muted-foreground shrink-0">{label}</span>
            {children}
        </div>
    );
}

function QuickAction({
    icon: Icon,
    iconClass,
    label,
    onClick,
}: {
    icon: React.ElementType;
    iconClass: string;
    label: string;
    onClick: () => void;
}) {
    return (
        <button
            onClick={onClick}
            className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors text-sm group"
        >
            <div className="flex items-center gap-2.5">
                <Icon className={`w-4 h-4 ${iconClass}`} />
                <span>{label}</span>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground" />
        </button>
    );
}

export function ProfilePanel({
    user,
    passkeys,
    name,
    onNavigate,
}: {
    user: User;
    passkeys: Passkey[];
    name: {
        value: string;
        set: (v: string) => void;
        saving: boolean;
        save: (e: React.FormEvent) => void;
    };
    onNavigate: (s: SectionId) => void;
}) {
    const has2FA = user.twoFactorMethod !== 'NONE';

    return (
        <div className="space-y-4">
            <SecurityScore user={user} passkeys={passkeys} />

            <Card className="border-border p-6 transition-all duration-200 hover:border-border/80">
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
                    Display Name
                </h2>
                <form onSubmit={name.save} className="flex items-end gap-3">
                    <div className="flex-1 space-y-1.5">
                        <Label htmlFor="displayName">Full Name</Label>
                        <Input
                            id="displayName"
                            type="text"
                            value={name.value}
                            onChange={(e) => name.set(e.target.value)}
                            placeholder="Your name"
                            className="bg-secondary border-border"
                            maxLength={100}
                            autoComplete="name"
                        />
                    </div>
                    <Button
                        type="submit"
                        disabled={
                            name.saving ||
                            !name.value.trim() ||
                            name.value.trim() === (user.name ?? '')
                        }
                        className="shrink-0"
                    >
                        {name.saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
                    </Button>
                </form>
            </Card>

            <Card className="border-border p-6 transition-all duration-200 hover:border-border/80">
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
                    Account Details
                </h2>
                <div className="space-y-0">
                    <DetailRow label="Email">
                        <span className="text-sm flex items-center gap-1.5 min-w-0">
                            <span className="truncate max-w-[180px] sm:max-w-xs">{user.email}</span>
                            {user.isVerified ? (
                                <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            ) : (
                                <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            )}
                        </span>
                    </DetailRow>
                    <DetailRow label="Sign-in">
                        <span className="text-sm">
                            {user.isGoogleUser ? (
                                <span className="flex items-center gap-1.5">
                                    <GoogleMark /> Google OAuth
                                </span>
                            ) : (
                                'Password'
                            )}
                        </span>
                    </DetailRow>
                    <DetailRow label="Two-factor auth">
                        <span
                            className={`text-sm font-medium ${has2FA ? 'text-emerald-400' : 'text-muted-foreground'}`}
                        >
                            {user.twoFactorMethod === 'TOTP'
                                ? 'Authenticator App'
                                : user.twoFactorMethod === 'EMAIL'
                                  ? 'Email OTP'
                                  : 'Disabled'}
                        </span>
                    </DetailRow>
                    <DetailRow label="Passkeys">
                        <span
                            className={`text-sm font-medium ${user.passkeyEnabled ? 'text-emerald-400' : 'text-muted-foreground'}`}
                        >
                            {user.passkeyEnabled ? `${passkeys.length} registered` : 'None'}
                        </span>
                    </DetailRow>
                    <DetailRow label="Encryption key" last>
                        <span
                            className={`text-sm font-medium ${user.hasMasterKey || !user.isGoogleUser ? 'text-emerald-400' : 'text-amber-400'}`}
                        >
                            {!user.isGoogleUser
                                ? 'Auto (password-derived)'
                                : user.hasMasterKey
                                  ? 'Configured'
                                  : 'Not set'}
                        </span>
                    </DetailRow>
                </div>
            </Card>

            <Card className="border-border p-6 transition-all duration-200 hover:border-border/80">
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
                    Quick Actions
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <QuickAction
                        icon={Shield}
                        iconClass="text-violet-400"
                        label={has2FA ? 'Manage 2FA' : 'Enable 2FA'}
                        onClick={() => onNavigate('security')}
                    />
                    <QuickAction
                        icon={Fingerprint}
                        iconClass="text-primary"
                        label="Add Passkey"
                        onClick={() => onNavigate('passkeys')}
                    />
                    <QuickAction
                        icon={Monitor}
                        iconClass="text-sky-400"
                        label="Active Sessions"
                        onClick={() => onNavigate('sessions')}
                    />
                    <QuickAction
                        icon={Bell}
                        iconClass="text-amber-400"
                        label="Notifications"
                        onClick={() => onNavigate('notifications')}
                    />
                </div>
            </Card>
        </div>
    );
}
