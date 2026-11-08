import { BookKey, FolderOpen, Monitor, Server, Settings, Users } from 'lucide-react';

export interface PanelUser {
    id: string;
    email: string;
    name: string | null;
    totpEnabled: boolean;
    isVerified: boolean;
    isGoogleUser: boolean;
    createdAt: string;
    /** Lock after this many idle minutes; null = never. */
    lockAfterMinutes?: number | null;
}

export const navigation = [
    { name: 'Servers', href: '/panel', icon: Server },
    { name: 'Sessions', href: '/panel/sessions', icon: Monitor },
    { name: 'Keychain', href: '/panel/keychain', icon: BookKey },
    { name: 'Groups', href: '/panel/groups', icon: FolderOpen },
    // Not in the phone tab bar (no room); reachable from the command palette.
    { name: 'Teams', href: '/panel/teams', icon: Users, mobile: false },
    { name: 'Settings', href: '/panel/settings', icon: Settings },
];

/** `/panel` matches exactly; deeper items also match their sub-routes. */
export function isNavItemActive(href: string, pathname: string): boolean {
    return pathname === href || (href !== '/panel' && pathname.startsWith(href));
}

export function activeNavName(pathname: string): string {
    return navigation.find((n) => isNavItemActive(n.href, pathname))?.name ?? '';
}
