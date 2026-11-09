import type { Appearance, MenuItemId } from '@/lib/appearance/prefs';
import {
    BookKey,
    Cable,
    FileCode2,
    Fingerprint,
    FolderOpen,
    History,
    Laptop,
    LayoutPanelLeft,
    Monitor,
    Server,
    Settings,
    Sparkles,
    Users,
    Waypoints,
    type LucideIcon,
} from 'lucide-react';

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
    /** Saved look and layout; null until the user saves one. */
    appearance?: Appearance | null;
    /** False until the first-run setup was finished or skipped. */
    onboarded?: boolean;
}

export type NavItem = {
    id: MenuItemId;
    /** The name in the sidebar, the top bar and the menu editor. */
    name: string;
    /** The name under the icon in the phone's bottom bar (no room for more). */
    short: string;
    /** One line for the menu editor, saying what the page is for. */
    description: string;
    href: string;
    icon: LucideIcon;
    /** Where the page can work at all. */
    needs?: 'desktop-app' | 'web-serial';
};

/** Every page the menu can show. Order, visibility and the phone bar are the user's. */
export const NAV_ITEMS: Record<MenuItemId, NavItem> = {
    servers: {
        id: 'servers',
        name: 'Servers',
        short: 'Servers',
        description: 'Every machine you can connect to',
        href: '/panel',
        icon: Server,
    },
    connections: {
        id: 'connections',
        name: 'Connections',
        short: 'Open',
        description: 'Your open terminals and desktops',
        href: '/panel/sessions',
        icon: Monitor,
    },
    workspaces: {
        id: 'workspaces',
        name: 'Workspaces',
        short: 'Spaces',
        description: 'Saved sets of servers and how they share the screen',
        href: '/panel/workspaces',
        icon: LayoutPanelLeft,
    },
    local: {
        id: 'local',
        name: 'Local terminal',
        short: 'Local',
        description: 'A shell on this computer',
        href: '/panel/local',
        icon: Laptop,
        needs: 'desktop-app',
    },
    serial: {
        id: 'serial',
        name: 'Serial console',
        short: 'Serial',
        description: 'Network gear on a USB console cable',
        href: '/panel/serial',
        icon: Cable,
        needs: 'web-serial',
    },
    keys: {
        id: 'keys',
        name: 'Keys & passwords',
        short: 'Keys',
        description: 'Saved logins, SSH keys and security keys',
        href: '/panel/keychain',
        icon: BookKey,
    },
    snippets: {
        id: 'snippets',
        name: 'Snippets',
        short: 'Snippets',
        description: 'Commands you run often, one tap away',
        href: '/panel/snippets',
        icon: FileCode2,
    },
    assistant: {
        id: 'assistant',
        name: 'Assistant',
        short: 'AI',
        description: 'Ask about your servers, errors and commands',
        href: '/panel/assistant',
        icon: Sparkles,
    },
    forwarding: {
        id: 'forwarding',
        name: 'Port forwarding',
        short: 'Ports',
        description: 'Reach services behind your servers',
        href: '/panel/forwarding',
        icon: Waypoints,
    },
    'known-hosts': {
        id: 'known-hosts',
        name: 'Known hosts',
        short: 'Hosts',
        description: 'The host keys Termi trusts for each server',
        href: '/panel/known-hosts',
        icon: Fingerprint,
    },
    groups: {
        id: 'groups',
        name: 'Groups',
        short: 'Groups',
        description: 'Servers sorted into folders',
        href: '/panel/groups',
        icon: FolderOpen,
    },
    teams: {
        id: 'teams',
        name: 'Teams',
        short: 'Teams',
        description: 'Servers you share with other people',
        href: '/panel/teams',
        icon: Users,
    },
    history: {
        id: 'history',
        name: 'History',
        short: 'History',
        description: 'Past connections, recordings and account activity',
        href: '/panel/history',
        icon: History,
    },
    settings: {
        id: 'settings',
        name: 'Settings',
        short: 'Settings',
        description: 'Your account, security and appearance',
        href: '/panel/settings',
        icon: Settings,
    },
};

/** Whether this device can use an item at all (desktop app, Web Serial). */
export function itemAvailable(item: NavItem, env: { isElectron: boolean }): boolean {
    if (item.needs === 'desktop-app') return env.isElectron;
    if (item.needs === 'web-serial') {
        return typeof navigator !== 'undefined' && 'serial' in navigator;
    }
    return true;
}

/** The desktop menu: the user's order, minus hidden and unavailable items. */
export function menuItems(menu: Appearance['menu'], env: { isElectron: boolean }): NavItem[] {
    return menu.order
        .filter((id) => !menu.hidden.includes(id))
        .map((id) => NAV_ITEMS[id])
        .filter((item) => itemAvailable(item, env));
}

/** The phone's bottom bar. */
export function mobileBarItems(menu: Appearance['menu'], env: { isElectron: boolean }): NavItem[] {
    return menu.mobile.map((id) => NAV_ITEMS[id]).filter((item) => itemAvailable(item, env));
}

/** `/panel` matches exactly; deeper items also match their sub-routes. */
export function isNavItemActive(href: string, pathname: string): boolean {
    return pathname === href || (href !== '/panel' && pathname.startsWith(href));
}

export function activeNavName(pathname: string): string {
    return Object.values(NAV_ITEMS).find((n) => isNavItemActive(n.href, pathname))?.name ?? '';
}
