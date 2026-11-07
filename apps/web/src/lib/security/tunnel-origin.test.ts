import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
    tunnelIdFromHost,
    tunnelOrigin,
    tunnelOriginsEnabled,
    tunnelSubdomainId,
} from './tunnel-origin';

const grant = { userId: 'u1', serverId: 's1', port: 8080, host: '127.0.0.1' };

describe('tunnel origins', () => {
    beforeEach(() => {
        process.env.SESSION_SECRET = 'x'.repeat(40);
        process.env.TUNNEL_ORIGIN_TEMPLATE = 'https://{id}.termi-tunnels.net';
    });
    afterEach(() => {
        delete process.env.TUNNEL_ORIGIN_TEMPLATE;
    });

    it('is off unless a template with {id} is configured', () => {
        delete process.env.TUNNEL_ORIGIN_TEMPLATE;
        expect(tunnelOriginsEnabled()).toBe(false);
        expect(tunnelIdFromHost('abcdef0123456789.termi-tunnels.net')).toBeNull();
        process.env.TUNNEL_ORIGIN_TEMPLATE = 'https://tunnels.example.net';
        expect(tunnelOriginsEnabled()).toBe(false);
    });

    it('gives each user/server/port/target its own stable origin', () => {
        const id = tunnelSubdomainId(grant);
        expect(id).toMatch(/^[0-9a-f]{16}$/);
        expect(tunnelSubdomainId(grant)).toBe(id);
        expect(tunnelSubdomainId({ ...grant, port: 8081 })).not.toBe(id);
        expect(tunnelSubdomainId({ ...grant, userId: 'u2' })).not.toBe(id);
        expect(tunnelOrigin(id)).toBe(`https://${id}.termi-tunnels.net`);
    });

    it('recognises only exact tunnel hosts', () => {
        const id = tunnelSubdomainId(grant);
        expect(tunnelIdFromHost(`${id}.termi-tunnels.net`)).toBe(id);
        expect(tunnelIdFromHost(`${id.toUpperCase()}.TERMI-TUNNELS.NET`)).toBe(id);
        expect(tunnelIdFromHost('termi.run')).toBeNull();
        expect(tunnelIdFromHost('termi-tunnels.net')).toBeNull();
        expect(tunnelIdFromHost(`evil.${id}.termi-tunnels.net`)).toBeNull();
        expect(tunnelIdFromHost(`${id}.termi-tunnels.net.evil.com`)).toBeNull();
        expect(tunnelIdFromHost('not-hex-at-all00.termi-tunnels.net')).toBeNull();
        expect(tunnelIdFromHost(null)).toBeNull();
    });

    it('handles a port in the template', () => {
        process.env.TUNNEL_ORIGIN_TEMPLATE = 'http://{id}.localhost:22080';
        const id = tunnelSubdomainId(grant);
        expect(tunnelIdFromHost(`${id}.localhost:22080`)).toBe(id);
        expect(tunnelIdFromHost(`${id}.localhost:9999`)).toBeNull();
        expect(tunnelOrigin(id)).toBe(`http://${id}.localhost:22080`);
    });
});
