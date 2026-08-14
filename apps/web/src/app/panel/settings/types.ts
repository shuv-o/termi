/** Shared types for the settings screen and its section panels. */

export interface User {
    id: string;
    email: string;
    name: string | null;
    totpEnabled: boolean;
    emailOtpEnabled: boolean;
    twoFactorMethod: 'NONE' | 'TOTP' | 'EMAIL';
    hasMasterKey: boolean;
    passkeyEnabled: boolean;
    isVerified: boolean;
    isGoogleUser: boolean;
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
    | 'security'
    | 'passkeys'
    | 'encryption'
    | 'notifications'
    | 'sessions'
    | 'recordings'
    | 'danger';

export const SECTION_IDS: SectionId[] = [
    'profile',
    'security',
    'passkeys',
    'encryption',
    'notifications',
    'sessions',
    'recordings',
    'danger',
];

/** Short labels used by the mobile section picker. */
export const SECTION_SHORT_LABELS: Record<SectionId, string> = {
    profile: 'Profile',
    security: 'Security',
    passkeys: 'Passkeys',
    encryption: 'Encrypt',
    notifications: 'Alerts',
    sessions: 'Sessions',
    recordings: 'Recordings',
    danger: 'Danger',
};

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
    id: number;
    type: ToastType;
    message: string;
}

/** Signature of the toast dispatcher handed down to hooks and panels. */
export type AddToast = (type: ToastType, message: string, duration?: number) => void;

/** Cache-backed user updater — settings only ever edits an existing user. */
export type SetUser = (updater: User | null | ((u: User | null) => User | null)) => void;
