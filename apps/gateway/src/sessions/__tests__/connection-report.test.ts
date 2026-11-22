import { describe, it, expect, vi } from 'vitest';
import {
    runConnectionReport,
    webConnectionReporter,
    type ConnectionInfo,
    type ListedConnection,
} from '../connection-report.js';

const info = (id: string, userId = 'alice'): ConnectionInfo => ({
    id,
    userId,
    sid: 's-a',
    kind: 'socket',
    protocol: 'scp',
    serverId: 'srv1',
    attached: true,
    guests: 0,
    startedAt: 1,
    lastActivityAt: 2,
});

const conn = (id: string): ListedConnection & { close: ReturnType<typeof vi.fn> } => ({
    grant: { sid: 's-a', userId: 'alice', kind: 'server', serverId: 'srv1' },
    info: info(id),
    close: vi.fn<(message: string) => void>(),
});

describe('runConnectionReport', () => {
    it('reports every connection and closes only the requested ones', async () => {
        const a = conn('a');
        const b = conn('b');
        const report = vi.fn().mockResolvedValue([{ id: 'b', message: 'Closed by you' }]);
        const closed = await runConnectionReport([a, b], report, 10);
        expect(report).toHaveBeenCalledWith([a.info, b.info], 10);
        expect(closed).toBe(1);
        expect(a.close).not.toHaveBeenCalled();
        expect(b.close).toHaveBeenCalledWith('Closed by you');
    });

    it('closes nothing when the web app does not answer', async () => {
        const a = conn('a');
        expect(await runConnectionReport([a], async () => null, 10)).toBe(0);
        expect(a.close).not.toHaveBeenCalled();
    });

    it('ignores ids it does not have', async () => {
        const a = conn('a');
        expect(await runConnectionReport([a], async () => [{ id: 'zzz', message: 'x' }], 10)).toBe(
            0,
        );
    });

    it('still reports an empty list, so the web app forgets closed connections', async () => {
        const report = vi.fn().mockResolvedValue([]);
        await runConnectionReport([], report, 10);
        expect(report).toHaveBeenCalledWith([], 10);
    });
});

describe('webConnectionReporter', () => {
    it('posts the report with the gateway id and returns the close requests', async () => {
        const fetchFn = vi
            .fn()
            .mockResolvedValue(
                new Response(
                    JSON.stringify({ data: { close: [{ id: 'a', message: 'm' }, { id: 1 }] } }),
                ),
            );
        const report = webConnectionReporter(
            'http://web:3000',
            'gw-1',
            fetchFn,
            async () => 'Bearer t',
        );
        const out = await report([info('a')], 10);
        expect(out).toEqual([{ id: 'a', message: 'm' }]);
        const [url, init] = fetchFn.mock.calls[0];
        expect(url).toBe('http://web:3000/api/internal/connections');
        expect(init.headers.authorization).toBe('Bearer t');
        expect(JSON.parse(init.body)).toEqual({
            gatewayId: 'gw-1',
            intervalSec: 10,
            connections: [info('a')],
        });
    });

    it('returns null on an error answer', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const fetchFn = vi.fn().mockResolvedValue(new Response('no', { status: 500 }));
        const report = webConnectionReporter('http://web', 'gw', fetchFn, async () => 'Bearer t');
        expect(await report([], 10)).toBeNull();
        warn.mockRestore();
    });
});
