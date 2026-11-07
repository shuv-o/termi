import { describe, it, expect } from 'vitest';
import { clientFrameVerdict } from '../guacamole.js';

/** Encode like the browser's GatewayTunnel.sendMessage (UTF-8 byte lengths). */
const byteEncode = (...els: string[]) =>
    els.map((e) => `${Buffer.byteLength(e, 'utf8')}.${e}`).join(',') + ';';
/** Encode like the Guacamole spec / guacd (code-point lengths). */
const cpEncode = (...els: string[]) =>
    els.map((e) => `${Array.from(e).length}.${e}`).join(',') + ';';

describe('clientFrameVerdict', () => {
    it('lets normal runtime input through', () => {
        expect(clientFrameVerdict(byteEncode('mouse', '10', '20', '1')).ok).toBe(true);
        expect(
            clientFrameVerdict(byteEncode('key', '65', '1') + byteEncode('key', '65', '0')).ok,
        ).toBe(true);
        expect(clientFrameVerdict(byteEncode('size', '1280', '720', '96')).ok).toBe(true);
        expect(clientFrameVerdict(byteEncode('sync', '12345')).ok).toBe(true);
    });

    it('accepts non-ASCII clipboard text in either length convention', () => {
        const text = 'héllo 世界 🙂';
        expect(clientFrameVerdict(byteEncode('blob', '0', text)).ok).toBe(true);
        expect(clientFrameVerdict(cpEncode('blob', '0', text)).ok).toBe(true);
    });

    it('blocks handshake instructions the gateway alone may send', () => {
        for (const op of ['select', 'connect', 'image', 'video', 'timezone', 'name']) {
            expect(clientFrameVerdict(byteEncode(op, 'x')).ok).toBe(false);
        }
    });

    it('blocks a connect hidden after a harmless instruction in the same frame', () => {
        const frame =
            byteEncode('nop') + byteEncode('connect', 'VERSION_1_5_0', '169.254.169.254', '3389');
        expect(clientFrameVerdict(frame)).toEqual({ ok: false, reason: "'connect' instruction" });
    });

    it('blocks a connect that only appears under guacd’s code-point reading', () => {
        // "aéé" is 3 code points but 5 bytes: read by bytes the frame breaks
        // inside the first instruction, read by code points (as guacd does) the
        // second instruction is a connect.
        const frame = '3.aéé;7.connect,8.10.0.0.1;';
        expect(clientFrameVerdict(frame)).toEqual({ ok: false, reason: "'connect' instruction" });
    });

    it('drops malformed frames', () => {
        expect(clientFrameVerdict('5.mouse,2.10').ok).toBe(false); // no terminator
        expect(clientFrameVerdict('9.mouse;').ok).toBe(false); // length overruns
        expect(clientFrameVerdict('abc').ok).toBe(false);
    });
});
