/**
 * Local PTY Handler
 *
 * Spawns a shell process on the gateway machine and bridges it to a WebSocket.
 * Only active when ALLOW_LOCAL_TERMINAL=true is set in the gateway environment.
 * Sessions are ephemeral — killing the WebSocket kills the PTY.
 */

import { WebSocket } from 'ws';
import { createRequire } from 'module';
import os from 'os';

// ── node-pty (optional native module) ───────────────────────────────────────

// Use createRequire so we can load the CJS node-pty package from ESM with
// a graceful fallback if it was not compiled for this environment.
const _require = createRequire(import.meta.url);

let _ptySpawn: ((shell: string, args: string[], opts: Record<string, unknown>) => any) | null = null;

try {
    const nodePty = _require('node-pty');
    _ptySpawn = nodePty.spawn;
} catch {
    console.warn('[LocalHandler] node-pty not available — local terminal disabled. Run: npm ci --workspace=apps/gateway');
}

// ── Per-user session cap ─────────────────────────────────────────────────────

const MAX_LOCAL_PTYS_PER_USER = 3;
const userPtyCounts = new Map<string, number>();

function incrementUser(userId: string): boolean {
    const n = userPtyCounts.get(userId) ?? 0;
    if (n >= MAX_LOCAL_PTYS_PER_USER) return false;
    userPtyCounts.set(userId, n + 1);
    return true;
}

function decrementUser(userId: string): void {
    const n = userPtyCounts.get(userId) ?? 0;
    if (n <= 1) userPtyCounts.delete(userId);
    else userPtyCounts.set(userId, n - 1);
}

// ── Handler class ────────────────────────────────────────────────────────────

const IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

export class LocalHandler {
    private pty: any = null;
    private closing = false;
    private userId: string;
    private idleTimer: ReturnType<typeof setTimeout> | null = null;

    constructor(private ws: WebSocket, userId: string) {
        this.userId = userId;
        this.spawn();
    }

    private resetIdleTimer(): void {
        if (this.idleTimer) clearTimeout(this.idleTimer);
        this.idleTimer = setTimeout(() => {
            if (this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({ type: 'error', message: 'Session timed out due to inactivity' }));
                this.ws.close(4008, 'Idle timeout');
            }
            this.close();
        }, IDLE_TIMEOUT_MS);
    }

    private spawn(): void {
        if (!_ptySpawn) {
            this.ws.send(JSON.stringify({ type: 'error', message: 'Local terminal is not available on this server (node-pty missing)' }));
            this.ws.close(4500, 'node-pty unavailable');
            return;
        }

        if (!incrementUser(this.userId)) {
            this.ws.send(JSON.stringify({ type: 'error', message: `Too many local terminal sessions (max ${MAX_LOCAL_PTYS_PER_USER})` }));
            this.ws.close(4029, 'Too Many Requests');
            return;
        }

        const shell = process.platform === 'win32'
            ? 'powershell.exe'
            : (process.env.SHELL || '/bin/sh');

        // Provide a minimal, sanitised environment — do NOT inherit process.env
        // which would expose secrets like GATEWAY_JWT_SECRET, DATABASE_URL etc.
        const safeEnv: Record<string, string> = {
            TERM: 'xterm-256color',
            COLORTERM: 'truecolor',
            HOME: process.env.HOME || os.homedir(),
            PATH: process.env.PATH || '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
            LANG: process.env.LANG || 'en_US.UTF-8',
            USER: process.env.USER || 'gateway',
            SHELL: shell,
        };

        try {
            this.pty = _ptySpawn(shell, [], {
                name: 'xterm-256color',
                cols: 80,
                rows: 24,
                cwd: safeEnv.HOME,
                env: safeEnv,
            });
        } catch (err: any) {
            decrementUser(this.userId);
            this.ws.send(JSON.stringify({ type: 'error', message: `Failed to spawn shell: ${err.message}` }));
            this.ws.close(4500, 'Spawn failed');
            return;
        }

        this.pty.onData((data: string) => {
            this.resetIdleTimer();
            if (this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({
                    type: 'data',
                    data: Buffer.from(data).toString('base64'),
                }));
            }
        });

        this.pty.onExit(({ exitCode }: { exitCode: number }) => {
            if (this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({ type: 'disconnected', exitCode }));
                this.ws.close(1000, 'Shell exited');
            }
            this.cleanup();
        });

        this.ws.send(JSON.stringify({ type: 'connected' }));
        this.resetIdleTimer();
    }

    write(data: Buffer): void {
        this.resetIdleTimer();
        if (this.pty) {
            this.pty.write(data.toString('utf8'));
        }
    }

    resize(rows: number, cols: number): void {
        if (this.pty) {
            this.pty.resize(cols, rows);
        }
    }

    close(): void {
        if (this.closing) return;
        this.closing = true;
        this.cleanup();
    }

    private cleanup(): void {
        if (this.idleTimer) { clearTimeout(this.idleTimer); this.idleTimer = null; }
        if (this.pty) {
            try { this.pty.kill(); } catch { /* ignore */ }
            this.pty = null;
        }
        decrementUser(this.userId);
    }
}
