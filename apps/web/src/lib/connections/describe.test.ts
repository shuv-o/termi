import { describe, it, expect } from 'vitest';
import {
    connectionLabel,
    connectionState,
    connectionTitle,
    openAction,
    type LiveConnectionItem,
} from './describe';

const base: LiveConnectionItem = {
    id: 'c1',
    kind: 'session',
    protocol: 'ssh',
    serverId: 'srv1',
    serverName: 'web-1',
    sessionId: '11111111-1111-4111-8111-111111111111',
    attached: true,
    guests: 0,
    startedAt: '2026-11-22T10:00:00Z',
    lastActivityAt: '2026-11-22T10:05:00Z',
    detail: null,
    via: 'gateway',
    deviceName: null,
    origin: { current: true, userAgent: null, ipAddress: null },
    closing: false,
};

describe('connectionState', () => {
    it('calls a detached shell background, and closing wins', () => {
        expect(connectionState(base)).toBe('in-use');
        expect(connectionState({ ...base, attached: false })).toBe('background');
        expect(connectionState({ ...base, attached: false, closing: true })).toBe('closing');
    });
});

describe('connectionLabel', () => {
    it('names tunnels by mode', () => {
        const t = { ...base, kind: 'socket' as const, protocol: 'tunnel' };
        expect(connectionLabel({ ...t, detail: { forward: 'local', remotePort: 5432 } })).toBe(
            'Port forward to 5432',
        );
        expect(connectionLabel({ ...t, detail: { forward: 'dynamic' } })).toBe('SOCKS proxy');
        expect(connectionLabel({ ...t, detail: { forward: 'remote', bindPort: 8080 } })).toBe(
            'Reverse forward, port 8080',
        );
    });

    it('names guest seats by mode', () => {
        const g = { ...base, kind: 'guest' as const };
        expect(connectionLabel({ ...g, detail: { guestMode: 'view' } })).toBe(
            'Watching a shared terminal',
        );
        expect(connectionLabel({ ...g, detail: { guestMode: 'control' } })).toBe(
            'Helping in a shared terminal',
        );
    });
});

describe('connectionTitle', () => {
    it('falls back when there is no server name', () => {
        expect(connectionTitle(base)).toBe('web-1');
        expect(connectionTitle({ ...base, serverName: null, kind: 'guest' })).toBe(
            'Shared session',
        );
        expect(connectionTitle({ ...base, serverName: null })).toBe('Removed server');
    });
});

describe('openAction', () => {
    it('opens a background shell, shows one here, takes over one elsewhere', () => {
        expect(openAction({ ...base, attached: false })?.label).toBe('Open');
        expect(openAction(base)?.label).toBe('Show');
        expect(
            openAction({ ...base, origin: { current: false, userAgent: null, ipAddress: null } })
                ?.label,
        ).toBe('Take over');
        expect(openAction(base)?.href).toBe(`/panel/sessions?attach=${base.sessionId}&server=srv1`);
    });

    it('offers nothing for sockets, guests, closing or device shells', () => {
        expect(openAction({ ...base, kind: 'socket' })).toBeNull();
        expect(openAction({ ...base, kind: 'guest' })).toBeNull();
        expect(openAction({ ...base, closing: true })).toBeNull();
        expect(openAction({ ...base, sessionId: null })).toBeNull();
    });
});
