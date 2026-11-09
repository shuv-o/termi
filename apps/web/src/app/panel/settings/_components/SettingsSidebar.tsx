'use client';

import {
    Bell,
    CheckCircle,
    Fingerprint,
    Monitor,
    Palette,
    Shield,
    User as UserIcon,
    SquareTerminal,
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
        { id: 'appearance', label: 'Appearance', icon: Palette },
        { id: 'security', label: 'Security', icon: Shield },
        { id: 'passkeys', label: 'Passkeys', icon: Fingerprint, badge: passkeyCount || undefined },
        { id: 'notifications', label: 'Notifications', icon: Bell },
        {
            id: 'sessions',
            label: 'Signed-in devices',
            icon: Monitor,
            badge: sessionCount || undefined,
        },
        { id: 'terminal', label: 'Terminal', icon: SquareTerminal },
    ];

    return (
        <nav className="space-y-0.5">
            {items.map((item) => {
                const Icon = item.icon;
                const isActive = active === item.id;
                return (
                    <button
                        key={item.id}
                        onClick={() => onChange(item.id)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-left ${
                            isActive
                                ? 'bg-primary/15 text-primary'
                                : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                        }`}
                    >
                        <Icon className="w-4 h-4 shrink-0" />
                        <span className="flex-1">{item.label}</span>
                        {item.badge ? (
                            <span
                                className={`text-[11px] px-1.5 py-0.5 rounded-full font-medium ${
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
                <p className="text-xs font-semibold text-muted-foreground">Settings</p>
                <div className="mt-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full border border-input bg-accent flex items-center justify-center text-foreground font-semibold text-sm shrink-0">
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
                                <span className="flex items-center gap-1 text-[11px] text-success">
                                    <CheckCircle className="w-2.5 h-2.5" />
                                    Verified
                                </span>
                            ) : (
                                <span className="text-[11px] text-warning">Unverified</span>
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
