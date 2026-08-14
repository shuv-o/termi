'use client';

import {
    AlertTriangle,
    Bell,
    CheckCircle,
    Fingerprint,
    Lock,
    Monitor,
    ScreenShare,
    Shield,
    User as UserIcon,
} from 'lucide-react';
import type { SectionId, User } from '../types';

interface NavItem {
    id: SectionId;
    label: string;
    icon: React.ElementType;
    badge?: string | number;
}

function SidebarNav({
    active,
    onChange,
    passkeyCount,
    sessionCount,
}: {
    active: SectionId;
    onChange: (s: SectionId) => void;
    passkeyCount: number;
    sessionCount: number;
}) {
    const items: NavItem[] = [
        { id: 'profile', label: 'Profile', icon: UserIcon },
        { id: 'security', label: 'Security', icon: Shield },
        { id: 'passkeys', label: 'Passkeys', icon: Fingerprint, badge: passkeyCount || undefined },
        { id: 'encryption', label: 'Encryption', icon: Lock },
        { id: 'notifications', label: 'Notifications', icon: Bell },
        {
            id: 'sessions',
            label: 'Active Sessions',
            icon: Monitor,
            badge: sessionCount || undefined,
        },
        { id: 'recordings', label: 'Recordings', icon: ScreenShare },
        { id: 'danger', label: 'Danger Zone', icon: AlertTriangle },
    ];

    return (
        <nav className="space-y-0.5">
            {items.map((item) => {
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
                            <span
                                className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                                    isActive
                                        ? 'bg-primary/30 text-primary'
                                        : 'bg-secondary text-muted-foreground'
                                }`}
                            >
                                {item.badge}
                            </span>
                        ) : null}
                    </button>
                );
            })}
        </nav>
    );
}

/** Desktop-only account card plus section nav. */
export function SettingsSidebar({
    user,
    active,
    onChange,
    passkeyCount,
    sessionCount,
}: {
    user: User;
    active: SectionId;
    onChange: (s: SectionId) => void;
    passkeyCount: number;
    sessionCount: number;
}) {
    return (
        <div className="sticky top-24 space-y-4">
            <div className="rounded-2xl border border-border bg-card p-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    Settings
                </p>
                <div className="mt-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center text-white font-semibold text-sm shrink-0">
                        {(user.name || user.email)[0].toUpperCase()}
                    </div>
                    <div className="min-w-0">
                        {user.name && <p className="text-sm font-semibold truncate">{user.name}</p>}
                        <p
                            className={`truncate ${user.name ? 'text-xs text-muted-foreground' : 'text-sm font-medium'}`}
                        >
                            {user.email}
                        </p>
                        <div className="mt-1 flex items-center gap-1">
                            {user.isVerified ? (
                                <span className="flex items-center gap-1 text-[10px] text-emerald-400">
                                    <CheckCircle className="w-2.5 h-2.5" />
                                    Verified
                                </span>
                            ) : (
                                <span className="text-[10px] text-amber-400">Unverified</span>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-2">
                <SidebarNav
                    active={active}
                    onChange={onChange}
                    passkeyCount={passkeyCount}
                    sessionCount={sessionCount}
                />
            </div>
        </div>
    );
}
