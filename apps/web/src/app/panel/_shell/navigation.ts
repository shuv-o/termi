import { BookKey, FolderOpen, Monitor, Server, Settings } from 'lucide-react';

export interface PanelUser {
    id: string;
    email: string;
    name: string | null;
    totpEnabled: boolean;
    hasMasterKey: boolean;
    isVerified: boolean;
    isGoogleUser: boolean;
    createdAt: string;
}

export const navigation = [
    { name: 'Servers', href: '/panel', icon: Server },
    { name: 'Sessions', href: '/panel/sessions', icon: Monitor },
    { name: 'Keychain', href: '/panel/keychain', icon: BookKey },
    { name: 'Groups', href: '/panel/groups', icon: FolderOpen },
    { name: 'Settings', href: '/panel/settings', icon: Settings },
];

/** `/panel` matches exactly; deeper items also match their sub-routes. */
export function isNavItemActive(href: string, pathname: string): boolean {
    return pathname === href || (href !== '/panel' && pathname.startsWith(href));
}

export function activeNavName(pathname: string): string {
    return navigation.find((n) => isNavItemActive(n.href, pathname))?.name ?? '';
}
