import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { buildBridgeScript } from './route';

const hostile = {
    gatewayUrl: 'wss://gw.example',
    serverId: 's1',
    token: 'tok',
    remoteHost: 'x`+${process.exit(7)}+`\nprocess.exit(8)//',
    remotePort: 8080,
    serverName:
        "${import('child_process').then(c=>c.execSync('touch /tmp/pwned'))}\nprocess.exit(9)",
    localPort: 3000,
};

describe('buildBridgeScript', () => {
    it('keeps server names and hosts out of executable code', () => {
        const script = buildBridgeScript(hostile);
        // Comments stay on one line: no raw newline from user input.
        for (const line of script.split('\n').filter((l) => l.startsWith('//'))) {
            expect(line).not.toMatch(/process\.exit\(9\)$/);
        }
        // The values appear only as JSON string literals.
        expect(script).toContain(`const SERVER_NAME = ${JSON.stringify(hostile.serverName)};`);
    });

    it('produces a script that parses, with no injected statements', () => {
        const dir = mkdtempSync(join(tmpdir(), 'termi-bridge-'));
        const file = join(dir, 'bridge.mjs');
        writeFileSync(file, buildBridgeScript(hostile));
        // --check parses without running; an injected statement would still parse,
        // so also assert the only top-level process.exit calls are absent.
        expect(() => execFileSync(process.execPath, ['--check', file])).not.toThrow();
        const code = buildBridgeScript(hostile)
            .split('\n')
            .filter((l) => !l.trim().startsWith('//'))
            .join('\n')
            .replace(/"(?:[^"\\]|\\.)*"/g, '""'); // drop string literal contents
        expect(code).not.toMatch(/process\.exit\(/);
    });
});
