import { FolderOpen, Monitor, Terminal, Tv } from 'lucide-react';

export interface Group {
    id: string;
    name: string;
    color: string | null;
}

export interface KeychainEntry {
    id: string;
    label: string;
    username: string;
    hasPassword: boolean;
    hasPrivateKey: boolean;
}

export const protocols = [
    { value: 'SSH', label: 'SSH', icon: Terminal, desc: 'Secure Shell' },
    { value: 'SCP', label: 'SCP', icon: FolderOpen, desc: 'File Transfer' },
    { value: 'RDP', label: 'RDP', icon: Monitor, desc: 'Remote Desktop' },
    { value: 'VNC', label: 'VNC', icon: Tv, desc: 'Virtual Console' },
    { value: 'TELNET', label: 'Telnet', icon: Terminal, desc: 'Telnet Terminal' },
] as const;

export const defaultPorts = { SSH: 22, SCP: 22, RDP: 3389, VNC: 5900, TELNET: 23 };

export type ProtocolValue = keyof typeof defaultPorts;

export const protoColors: Record<ProtocolValue, { pill: string; ring: string; badge: string }> = {
    SSH: {
        pill: 'bg-green-500/15 text-green-400 border-green-500/30',
        ring: 'ring-green-500/40 border-green-500/60',
        badge: 'bg-green-500/15 text-green-400',
    },
    SCP: {
        pill: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
        ring: 'ring-blue-500/40 border-blue-500/60',
        badge: 'bg-blue-500/15 text-blue-400',
    },
    RDP: {
        pill: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
        ring: 'ring-purple-500/40 border-purple-500/60',
        badge: 'bg-purple-500/15 text-purple-400',
    },
    VNC: {
        pill: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
        ring: 'ring-orange-500/40 border-orange-500/60',
        badge: 'bg-orange-500/15 text-orange-400',
    },
    TELNET: {
        pill: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
        ring: 'ring-cyan-500/40 border-cyan-500/60',
        badge: 'bg-cyan-500/15 text-cyan-400',
    },
};

export type RdpSecurity = 'any' | 'rdp' | 'nla' | 'tls';
export type AuthMethod = 'password' | 'key';
export type TestStatus = 'idle' | 'testing' | 'success' | 'failed';

/** Every field the add/edit server form edits. */
export interface ServerFormValues {
    name: string;
    description: string;
    groupId: string;
    protocol: ProtocolValue;
    host: string;
    port: number;
    username: string;
    authMethod: AuthMethod;
    password: string;
    privateKey: string;
    passphrase: string;
    notes: string;
    tags: string[];
    displayWidth: number;
    displayHeight: number;
    rdpSecurity: RdpSecurity;
}

export const EMPTY_SERVER_FORM: ServerFormValues = {
    name: '',
    description: '',
    groupId: '',
    protocol: 'SSH',
    host: '',
    port: 22,
    username: '',
    authMethod: 'password',
    password: '',
    privateKey: '',
    passphrase: '',
    notes: '',
    tags: [],
    displayWidth: 1920,
    displayHeight: 1080,
    rdpSecurity: 'any',
};

/**
 * Which credentials the server already has stored. Edit mode uses this to show
 * "leave blank to keep existing" hints; create mode passes all-false.
 */
export interface StoredCredentials {
    hasPassword: boolean;
    hasPrivateKey: boolean;
    hasPassphrase: boolean;
}

export const NO_STORED_CREDENTIALS: StoredCredentials = {
    hasPassword: false,
    hasPrivateKey: false,
    hasPassphrase: false,
};

/** SSH and SCP are the protocols that authenticate with a password or key. */
export function isSshLike(protocol: ProtocolValue): boolean {
    return protocol === 'SSH' || protocol === 'SCP';
}
