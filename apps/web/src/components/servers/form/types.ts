import { FolderOpen, Monitor, Terminal, Tv } from 'lucide-react';

import { protocolColors, protocolRings } from '@/lib/protocol-style';

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

/**
 * Protocol accents for the form's picker cards, taken from the shared
 * categorical table rather than a private copy (there were three copies, and
 * they had drifted apart on opacity).
 */
export const protoColors: Record<ProtocolValue, { pill: string; ring: string; badge: string }> =
    Object.fromEntries(
        (Object.keys(defaultPorts) as ProtocolValue[]).map((p) => [
            p,
            {
                pill: protocolColors[p],
                ring: protocolRings[p],
                // Same tint as the pill, minus the border — these sit on a card
                // that already has one.
                badge: protocolColors[p].replace(/\s*border-\S+/, ''),
            },
        ]),
    ) as Record<ProtocolValue, { pill: string; ring: string; badge: string }>;

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
