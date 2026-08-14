import { describe, it, expect } from 'vitest';
import { buildBridgeScript } from './route';

const baseOpts = {
    gatewayUrl: 'ws://localhost:22081',
    serverId: 'srv1',
    token: 'test-token',
    remoteHost: '127.0.0.1',
    remotePort: 5432,
    serverName: 'My DB Server',
};

describe('buildBridgeScript', () => {
    it('defaults to an OS-assigned port when the remote port is privileged (<1024)', () => {
        // Regression test: binding a privileged port locally requires root on
        // Unix, so mirroring e.g. remote port 22 as the local default fails
        // to bind without sudo — this was caught via live testing.
        const script = buildBridgeScript({ ...baseOpts, remotePort: 22, localPort: 22 });
        expect(script).toContain('const LOCAL_PORT = 0;');
    });

    it('keeps a non-privileged localPort as the default', () => {
        const script = buildBridgeScript({ ...baseOpts, localPort: 5432 });
        expect(script).toContain('const LOCAL_PORT = 5432;');
    });

    it('logs the OS-assigned port, not the LOCAL_PORT constant which may be 0', () => {
        const script = buildBridgeScript({ ...baseOpts, remotePort: 22, localPort: 22 });
        expect(script).toContain('server.address().port');
        expect(script).not.toMatch(/Listening on 127\.0\.0\.1:\$\{LOCAL_PORT\}/);
    });

    it('embeds the gateway WS URL with protocol=tunnel and the serverId', () => {
        const script = buildBridgeScript({ ...baseOpts, localPort: 5432 });
        expect(script).toContain(
            "const WS_URL = \"ws://localhost:22081/connect?protocol=tunnel&serverId=srv1\";",
        );
    });

    it('embeds the token as an opaque string, not interpolated into other code', () => {
        const script = buildBridgeScript({ ...baseOpts, localPort: 5432, token: 'abc"; evil() //' });
        expect(script).toContain(JSON.stringify('abc"; evil() //'));
    });

    it('URL-encodes a serverId containing special characters', () => {
        const script = buildBridgeScript({ ...baseOpts, localPort: 5432, serverId: 'a/b c' });
        expect(script).toContain('serverId=a%2Fb%20c');
    });
});
