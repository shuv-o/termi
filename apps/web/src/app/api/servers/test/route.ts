/**
 * POST /api/servers/test
 *
 * For SSH/SCP — attempts a real SSH authentication handshake so the user
 * knows their credentials work, not just that the port is open.
 * For RDP/VNC  — falls back to TCP reachability (we have no RDP auth client).
 */

import net from 'net';
import { Client, type ConnectConfig } from 'ssh2';
import { z } from 'zod';
import { certificateField } from '@/lib/security/certificate-field';
import { withKeychainCredentials } from '@/lib/services/keychain.service';
import { getCurrentUser } from '@/lib/auth';
import { validateHost, validateJumpTargetHost } from '@/lib/security/ssrf';
import { assertValidJumpHost, JumpHostError, loadJump } from '@/lib/services/server.service';
import { connectSSH, type SSHJumpConfig } from '@/lib/services/ssh-jump';
import { checkReachabilityVia } from '@/lib/services/metrics.service';
import { connectionTestRateLimit } from '@/lib/security/rate-limit';

const schema = z.object({
    host: z.string().min(1),
    port: z.number().int().min(1).max(65535),
    protocol: z.enum(['SSH', 'SCP', 'RDP', 'VNC', 'TELNET']).default('SSH'),
    username: z.string().optional(),
    password: z.string().optional(),
    privateKey: z.string().optional(),
    passphrase: z.string().optional(),
    certificate: certificateField,
    /** Test through this saved SSH server instead of dialing the host directly. */
    jumpServerId: z.string().nullable().optional(),
    /** Use this keychain entry's credentials; resolved here, never sent to the browser. */
    keychainId: z.string().optional(),
});

//   TCP reachability (RDP / VNC)                       ─

function tcpCheck(
    host: string,
    port: number,
    timeoutMs = 6000,
): Promise<{ ok: boolean; latencyMs?: number; error?: string }> {
    return new Promise((resolve) => {
        const start = Date.now();
        const socket = new net.Socket();
        socket.setTimeout(timeoutMs);

        socket.once('connect', () => {
            const latencyMs = Date.now() - start;
            socket.destroy();
            resolve({ ok: true, latencyMs });
        });
        socket.once('timeout', () => {
            socket.destroy();
            resolve({ ok: false, error: 'Connection timed out' });
        });
        socket.once('error', (err: NodeJS.ErrnoException) => {
            socket.destroy();
            const msg =
                err.code === 'ECONNREFUSED'
                    ? 'Connection refused — port is closed'
                    : err.code === 'ENOTFOUND'
                      ? 'Host not found — check the address'
                      : err.code === 'ETIMEDOUT'
                        ? 'Connection timed out'
                        : err.code === 'ENETUNREACH'
                          ? 'Network unreachable'
                          : err.message;
            resolve({ ok: false, error: msg });
        });
        socket.connect(port, host);
    });
}

//   SSH authentication test                          ─

function sshAuthTest(
    config: {
        host: string;
        port: number;
        username: string;
        password?: string;
        privateKey?: string;
        passphrase?: string;
        certificate?: string | null;
        jump?: SSHJumpConfig | null;
    },
    timeoutMs = 12000,
): Promise<{ ok: boolean; latencyMs?: number; error?: string }> {
    return new Promise((resolve) => {
        const client = new Client();
        const start = Date.now();
        let settled = false;

        const done = (result: { ok: boolean; latencyMs?: number; error?: string }) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            try {
                client.end();
            } catch {
                /* ignore */
            }
            resolve(result);
        };

        const timer = setTimeout(
            () => done({ ok: false, error: 'Connection timed out after 12 seconds' }),
            timeoutMs,
        );

        client.on('ready', () => done({ ok: true, latencyMs: Date.now() - start }));

        client.on('error', (err) => {
            let msg = err.message;
            if (/All configured authentication methods failed/i.test(msg)) {
                msg = 'Authentication failed — wrong username or credentials';
            } else if (/ECONNREFUSED/.test(msg)) {
                msg = 'Connection refused — port is closed';
            } else if (/ENOTFOUND/.test(msg)) {
                msg = 'Host not found — check the address';
            } else if (/ETIMEDOUT|timed out/i.test(msg)) {
                msg = 'Connection timed out';
            } else if (/ENETUNREACH/.test(msg)) {
                msg = 'Network unreachable';
            } else if (/Encrypted private key detected/.test(msg)) {
                msg = 'Private key is encrypted — provide the passphrase';
            } else if (/Cannot parse privateKey/.test(msg)) {
                msg = 'Invalid private key format';
            }
            done({ ok: false, error: msg });
        });

        // Support servers that advertise keyboard-interactive instead of password
        if (config.password) {
            client.on('keyboard-interactive', (_n, _i, _l, _p, finish) => {
                finish([config.password!]);
            });
        }

        const cc: ConnectConfig = {
            host: config.host,
            port: config.port,
            username: config.username,
            readyTimeout: timeoutMs,
        };

        if (config.privateKey?.trim()) {
            cc.privateKey = config.privateKey;
            if (config.passphrase?.trim()) cc.passphrase = config.passphrase;
        }

        if (config.password?.trim()) {
            cc.password = config.password;
            cc.tryKeyboard = true;
        }

        // Not saved yet, so nothing to verify against (first contact is trusted
        // either way); the key is pinned on the first real connection.
        try {
            connectSSH(client, cc, config.jump, null, config.certificate);
        } catch (err) {
            done({ ok: false, error: (err as Error).message });
        }
    });
}

//   Route handler                               ─

export async function POST(request: Request) {
    const user = await getCurrentUser();
    if (!user) {
        return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Rate limit: 20 test attempts per 5 minutes per user
    const rl = await connectionTestRateLimit(user.id);
    if (!rl.allowed) {
        return Response.json(
            {
                success: false,
                error: 'Too many connection tests. Please wait before trying again.',
            },
            { status: 429 },
        );
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return Response.json({ success: false, error: 'Invalid JSON' }, { status: 400 });
    }

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
        return Response.json({ success: false, error: 'Invalid parameters' }, { status: 400 });
    }

    const resolved = await withKeychainCredentials(parsed.data, user.id);
    if (!resolved) {
        return Response.json(
            { success: false, error: 'Keychain entry not found' },
            { status: 404 },
        );
    }
    const { host, port, protocol, username, password, privateKey, passphrase, jumpServerId } =
        resolved;

    // Through a jump host the bastion dials the target, so the SSRF rules apply
    // to the bastion (re-checked here) and the target only needs valid syntax.
    let jump: SSHJumpConfig | null = null;
    if (jumpServerId) {
        try {
            await assertValidJumpHost(user.id, jumpServerId, protocol);
        } catch (err) {
            const message = err instanceof JumpHostError ? err.message : 'Invalid jump host';
            return Response.json({ success: false, error: message }, { status: 400 });
        }
        jump = await loadJump(jumpServerId, user.id);
        const bastionCheck = jump
            ? await validateHost(jump.host, process.env.ALLOW_PRIVATE_NETWORKS === 'true')
            : { valid: false, error: 'Jump host not found' };
        if (!bastionCheck.valid) {
            return Response.json(
                { success: false, error: bastionCheck.error || 'Invalid jump host' },
                { status: 400 },
            );
        }
    }

    // SSRF protection: block connections to private/reserved addresses
    const ssrfCheck = jump
        ? validateJumpTargetHost(host)
        : await validateHost(host, process.env.ALLOW_PRIVATE_NETWORKS === 'true');
    if (!ssrfCheck.valid) {
        return Response.json(
            { success: false, error: ssrfCheck.error || 'Invalid host' },
            { status: 400 },
        );
    }

    const isSSH = protocol === 'SSH' || protocol === 'SCP';
    // TELNET uses TCP check only (no SSH auth)

    // Never fall through to the direct TCP probe below for a jumped server:
    // that would make this server dial a host only the bastion should reach.
    if (jump && isSSH && !username) {
        return Response.json(
            { success: false, error: 'Enter a username to test through a jump host' },
            { status: 400 },
        );
    }
    if (jump && !isSSH) {
        // RDP/VNC: ask the bastion whether it can open the port.
        const via = await checkReachabilityVia(host, port, jump, 6000);
        return Response.json({
            success: via.reachable,
            latency: via.latencyMs,
            error: via.reachable ? undefined : `${jump.host} could not reach ${host}:${port}`,
        });
    }

    if (isSSH && username) {
        const result = await sshAuthTest({
            host,
            port,
            username,
            password,
            privateKey,
            passphrase,
            certificate: resolved.certificate,
            jump,
        });
        return Response.json({
            success: result.ok,
            latency: result.latencyMs,
            // Return the sanitised message (already mapped inside sshAuthTest); never
            // forward raw ssh2/OS error strings that could expose server internals.
            error: result.error,
        });
    }

    // RDP / VNC — TCP check only
    const result = await tcpCheck(host, port);
    return Response.json({
        success: result.ok,
        latency: result.latencyMs,
        error: result.error,
    });
}
