/** Shared types for the settings screen and its section panels. */

export interface User {
    id: string;
    email: string;
    name: string | null;
    totpEnabled: boolean;
    emailOtpEnabled: boolean;
    twoFactorMethod: 'NONE' | 'TOTP' | 'EMAIL';
    passkeyEnabled: boolean;
    passwordLoginDisabled: boolean;
    isVerified: boolean;
    isGoogleUser: boolean;
    lockAfterMinutes?: number | null;
}

export interface Passkey {
    id: string;
    name: string;
    deviceType: string;
    backedUp: boolean;
    transports: string[];
    createdAt: string;
    lastUsedAt: string | null;
}

export interface AuthSession {
    id: string;
    deviceInfo: string;
    ipAddress: string;
    createdAt: string;
    lastActiveAt: string;
    isCurrent: boolean;
}

/** Which settings panel is on screen. */
export type SectionId =
    | 'profile'
    | 'appearance'
    | 'security'
    | 'passkeys'
    | 'notifications'
    | 'sessions'
    | 'terminal'
    | 'ai';

export const SECTION_IDS: SectionId[] = [
    'profile',
    'appearance',
    'security',
    'passkeys',
    'notifications',
    'sessions',
    'terminal',
    'ai',
];

/** Sections that became pages of their own; old links still land there. */
export const MOVED_SECTIONS: Record<string, string> = {
    tunnels: '/panel/forwarding',
    activity: '/panel/history?tab=activity',
    recordings: '/panel/history?tab=recordings',
};

/** Short labels used by the mobile section picker. */
export const SECTION_SHORT_LABELS: Record<SectionId, string> = {
    profile: 'Profile',
    appearance: 'Appearance',
    security: 'Security',
    passkeys: 'Passkeys',
    notifications: 'Notifications',
    sessions: 'Devices',
    terminal: 'Terminal',
    ai: 'AI',
};

/**
 * Toast types live with the app-wide toaster now; re-exported here so the
 * dozen settings hooks that import `AddToast` from this module keep working.
 */
export type { AddToast, Toast, ToastType } from '@/components/ui/toast';

/** Cache-backed user updater — settings only ever edits an existing user. */
export type SetUser = (updater: User | null | ((u: User | null) => User | null)) => void;
