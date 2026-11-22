/**
 * How the Active connections page names and groups a live connection
 * (GET /api/connections, lib/services/live-connection.service.ts).
 */

export interface LiveConnectionItem {
    id: string;
    kind: 'session' | 'guest' | 'socket';
    protocol: string;
    serverId: string | null;
    serverName: string | null;
    sessionId: string | null;
    attached: boolean;
    guests: number;
    startedAt: string;
    lastActivityAt: string;
    detail: {
        forward?: 'local' | 'dynamic' | 'remote';
        remotePort?: number;
        bindPort?: number;
        guestMode?: 'view' | 'control';
    } | null;
    via: 'gateway' | 'device';
    deviceName: string | null;
    origin: { current: boolean; userAgent: string | null; ipAddress: string | null };
    closing: boolean;
}

export type ConnectionState = 'closing' | 'background' | 'in-use';

/** A shell nobody is looking at is "in the background"; everything else is a live socket. */
export function connectionState(c: LiveConnectionItem): ConnectionState {
    if (c.closing) return 'closing';
    if (!c.attached) return 'background';
    return 'in-use';
}

/** "Terminal", "Remote desktop", "SOCKS proxy", … */
export function connectionLabel(c: LiveConnectionItem): string {
    if (c.kind === 'guest') {
        return c.detail?.guestMode === 'control'
            ? 'Helping in a shared terminal'
            : 'Watching a shared terminal';
    }
    switch (c.protocol) {
        case 'ssh':
            return 'Terminal';
        case 'scp':
            return 'Files';
        case 'rdp':
            return 'Remote desktop';
        case 'vnc':
            return 'Screen share';
        case 'telnet':
            return 'Telnet';
        case 'local':
            return 'Gateway shell';
        case 'tunnel': {
            const d = c.detail ?? {};
            if (d.forward === 'dynamic') return 'SOCKS proxy';
            if (d.forward === 'remote') {
                return d.bindPort ? `Reverse forward, port ${d.bindPort}` : 'Reverse forward';
            }
            return d.remotePort ? `Port forward to ${d.remotePort}` : 'Port forward';
        }
        default:
            return c.protocol;
    }
}

/** The row's title: the server, or what it is when there is no server to name. */
export function connectionTitle(c: LiveConnectionItem): string {
    if (c.serverName) return c.serverName;
    if (c.kind === 'guest') return 'Shared session';
    if (c.protocol === 'local') return 'Termi server';
    return 'Removed server';
}

/** Where a running shell can be brought back into a tab, and what the button says. */
export function openAction(c: LiveConnectionItem): { href: string; label: string } | null {
    if (c.kind !== 'session' || !c.sessionId || !c.serverId || c.closing) return null;
    const href = `/panel/sessions?attach=${encodeURIComponent(c.sessionId)}&server=${encodeURIComponent(c.serverId)}`;
    if (!c.attached) return { href, label: 'Open' };
    return { href, label: c.origin.current ? 'Show' : 'Take over' };
}
