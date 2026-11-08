import { describe, expect, it } from 'vitest';
import { fillSnippet, shellQuote, snippetVariables } from '../snippets/variables';
import { clearAllHistory, loadHistory, recordCommand, suggest, type KVStore } from './history';
import { LineTracker } from './line-tracker';

function memoryStore(): KVStore {
    const m = new Map<string, string>();
    return {
        getItem: (k) => m.get(k) ?? null,
        setItem: (k, v) => void m.set(k, v),
        removeItem: (k) => void m.delete(k),
        get length() {
            return m.size;
        },
        key: (i) => [...m.keys()][i] ?? null,
    };
}

describe('snippet variables', () => {
    it('finds variables with defaults, in order, once each', () => {
        expect(snippetVariables('ssh {{user:root}}@{{host}} -p {{port:22}} # {{host}}')).toEqual([
            { name: 'user', defaultValue: 'root' },
            { name: 'host', defaultValue: '' },
            { name: 'port', defaultValue: '22' },
        ]);
        expect(snippetVariables('echo {{ not a var }} {{1bad}}')).toEqual([]);
    });

    it('fills values, falling back to defaults, quoting where asked', () => {
        const cmd = 'tail -n {{lines:50}} {{file|q}}';
        expect(fillSnippet(cmd, { file: '/var/log/app log' })).toBe(
            "tail -n 50 '/var/log/app log'",
        );
        expect(fillSnippet('grep {{pat|q}} x', { pat: "it's; rm -rf ~" })).toBe(
            `grep 'it'\\''s; rm -rf ~' x`,
        );
        expect(shellQuote('')).toBe("''");
    });
});

describe('LineTracker', () => {
    it('follows typing, backspace and Enter', () => {
        const t = new LineTracker();
        t.feed('git sta');
        t.feed('\x7f');
        t.feed('at');
        expect(t.current).toBe('git stat');
        expect(t.feed('us\r')).toEqual({ kind: 'commit', line: 'git status' });
        expect(t.current).toBe('');
    });

    it('stops trusting the line after keys the shell interprets', () => {
        for (const key of ['\t', '\x1b[A', '\x12', '\x01']) {
            const t = new LineTracker();
            t.feed('ls');
            t.feed(key);
            expect(t.current, JSON.stringify(key)).toBeNull();
            expect(t.feed('\r')).toEqual({ kind: 'change' }); // nothing remembered
            expect(t.current).toBe(''); // and the next line is fresh
        }
    });

    it("ignores the terminal's own reports (e.g. cursor position at each prompt)", () => {
        const t = new LineTracker();
        t.feed('\x1b[24;9R');
        t.feed('ls -la');
        t.feed('\x1b[I');
        t.feed('\x1b]11;rgb:0000/0000/0000\x07');
        expect(t.current).toBe('ls -la');
    });

    it('Ctrl+C and Ctrl+U clear the line', () => {
        const t = new LineTracker();
        t.feed('rm -rf');
        t.feed('\x03');
        expect(t.current).toBe('');
        t.feed('ab\x15');
        expect(t.current).toBe('');
    });

    it('a multi-line paste is not remembered as a command', () => {
        const t = new LineTracker();
        expect(t.feed('echo one\recho two')).toEqual({ kind: 'change' });
        expect(t.current).toBe('echo two');
    });
});

describe('command history', () => {
    it('remembers commands per server, never space-prefixed ones', () => {
        const s = memoryStore();
        recordCommand('a', 'docker ps', s);
        recordCommand('a', 'docker ps', s);
        recordCommand('a', ' export TOKEN=secret', s);
        recordCommand('b', 'uptime', s);
        expect(loadHistory('a', s)).toEqual([
            expect.objectContaining({ command: 'docker ps', count: 2 }),
        ]);
        expect(loadHistory('b', s).map((e) => e.command)).toEqual(['uptime']);
        expect(clearAllHistory(s)).toBe(2);
        expect(loadHistory('a', s)).toEqual([]);
    });

    it('suggests the rest of the best match, preferring frequent and recent', () => {
        const now = Date.now();
        const s = memoryStore();
        recordCommand('a', 'docker logs -f web', s, now - 30 * 86_400_000);
        recordCommand('a', 'docker ps -a', s, now);
        recordCommand('a', 'docker ps -a', s, now);
        const h = loadHistory('a', s);
        expect(suggest('docker ', h, [], now)).toBe('ps -a');
        expect(suggest('docker l', h, [], now)).toBe('ogs -f web');
        expect(suggest('d', h, [], now)).toBeNull(); // too short to guess
        expect(suggest('docker ps -a', h, [], now)).toBeNull(); // nothing left to add
        expect(
            suggest('sys', h, ['systemctl status nginx', 'systemctl restart {{svc}}'], now),
        ).toBe('temctl status nginx');
    });

    it('survives broken storage', () => {
        const s = memoryStore();
        s.setItem('termi-history:a', '{not json');
        expect(loadHistory('a', s)).toEqual([]);
    });
});
