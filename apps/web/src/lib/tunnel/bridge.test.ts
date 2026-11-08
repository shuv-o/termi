import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { buildBridgeScript, safeLocalPort } from './bridge';
import { TUNNEL_RUNTIME_SOURCE } from './runtime-source';

const base = {
    gatewayUrl: 'ws://localhost:22081',
    serverId: 'srv1',
    serverName: 'My DB Server',
    token: 'test-token',
    mode: 'local' as const,
    remoteHost: '127.0.0.1',
    remotePort: 5432,
    localPort: 5432,
};

describe('tunnel runtime', () => {
    it('is the same code the desktop app runs (run `npm run sync:tunnel-runtime`)', () => {
        const electron = readFileSync(
            path.resolve(__dirname, '../../../../electron/tunnel-mux.js'),
            'utf8',
        );
        const runtime = electron.match(/\/\/ ── RUNTIME START ──\n([\s\S]*?)\/\/ ── RUNTIME END ──/);
        expect(runtime?.[1]).toBe(TUNNEL_RUNTIME_SOURCE);
    });
});

describe('buildBridgeScript', () => {
    it('falls back to any free local port for privileged ports', () => {
        expect(safeLocalPort(22)).toBe(0);
        expect(safeLocalPort(5432)).toBe(5432);
        expect(safeLocalPort(undefined)).toBe(0);
        expect(buildBridgeScript({ ...base, localPort: 22 })).toContain('"listenPort": 0');
    });

    it('connects to the multiplexed tunnel endpoint for the server', () => {
        const script = buildBridgeScript({ ...base, serverId: 'a/b c' });
        expect(script).toContain(
            '"wsUrl": "ws://localhost:22081/connect?protocol=tunnel&serverId=a%2Fb%20c&mux=1"',
        );
        expect(script).toContain(TUNNEL_RUNTIME_SOURCE);
    });

    it('only embeds user-controlled values as JSON strings', () => {
        const evil = 'x"; require("child_process").exec("rm -rf ~") //\n*/';
        const script = buildBridgeScript({
            ...base,
            token: evil,
            serverName: evil,
            remoteHost: evil,
        });
        expect(script).toContain(JSON.stringify(evil));
        // Comments get a printable single line: no newline can end the comment.
        for (const line of script.split('\n').filter((l) => l.startsWith('//'))) {
            expect(line).not.toContain('\n');
        }
        expect(script.split('\n').filter((l) => l.includes('rm -rf')).every((l) => l.startsWith('//') || l.includes('"'))).toBe(true);
    });

    it('describes each mode', () => {
        expect(buildBridgeScript({ ...base, mode: 'dynamic' })).toContain('SOCKS5 proxy');
        const remote = buildBridgeScript({
            ...base,
            mode: 'remote',
            bindAddress: '127.0.0.1',
            bindPort: 9000,
            localTarget: { host: '127.0.0.1', port: 3000 },
        });
        expect(remote).toContain('"target": {');
        expect(remote).toContain('127.0.0.1:9000 on the server reach 127.0.0.1:3000 here');
    });

    it('produces a script Node can parse, in every mode', () => {
        for (const mode of ['local', 'dynamic', 'remote'] as const) {
            const script = buildBridgeScript({
                ...base,
                mode,
                bindAddress: '127.0.0.1',
                bindPort: 9000,
                localTarget: { host: '127.0.0.1', port: 3000 },
            });
            execFileSync(process.execPath, ['--check', '--input-type=module'], { input: script });
        }
    });
});
