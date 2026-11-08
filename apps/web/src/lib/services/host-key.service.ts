/**
 * Storage side of SSH host key pinning (see `lib/security/host-key.ts`).
 *
 * - `pinFirstHostKey` is the trust-on-first-use write: it only fills an empty
 *   pin, so two first connections racing each other can't both "win".
 * - `ensureHostKeysPinned` runs before a gateway token is minted: the gateway
 *   has no database access, so it only ever verifies against a pin the web
 *   app has already recorded.
 * - `probeHostKey` reads the key a server presents right now (no login) so the
 *   owner can compare it before trusting a changed key.
 */

import { Client, type ConnectConfig } from 'ssh2';
import { prisma } from '@/lib/db';
import {
    HOST_KEY_ALGORITHMS,
    fingerprintOf,
    keyTypeOf,
    type HostKeyMismatchError,
    type HostKeyPin,
} from '@/lib/security/host-key';
import { connectSSH, type SSHJumpConfig } from './ssh-jump';
import { notifySecurityEvent } from './security-alerts.service';

export async function pinFirstHostKey(
    serverId: string,
    fingerprint: string,
    keyType: string,
): Promise<string> {
    await prisma.server.updateMany({
        where: { id: serverId, hostKeyFingerprint: null },
        data: {
            hostKeyFingerprint: fingerprint,
            hostKeyType: keyType,
            hostKeyTrustedAt: new Date(),
        },
    });
    const row = await prisma.server.findUnique({
        where: { id: serverId },
        select: { hostKeyFingerprint: true },
    });
    if (!row?.hostKeyFingerprint) throw new Error('server not found');
    return row.hostKeyFingerprint;
}

/** Replace the pin with a key the owner reviewed. */
export async function trustHostKey(serverId: string, fingerprint: string, keyType: string) {
    await prisma.server.update({
        where: { id: serverId },
        data: {
            hostKeyFingerprint: fingerprint,
            hostKeyType: keyType,
            hostKeyTrustedAt: new Date(),
        },
    });
}

// One audit entry per server per hour is plenty: background jobs (metrics,
// monitoring) would otherwise log the same refusal every few seconds.
const lastMismatchLog = new Map<string, number>();
const MISMATCH_LOG_INTERVAL_MS = 60 * 60 * 1000;

export function recordHostKeyMismatch(serverId: string, err: HostKeyMismatchError): void {
    const now = Date.now();
    if (now - (lastMismatchLog.get(serverId) ?? 0) < MISMATCH_LOG_INTERVAL_MS) return;
    lastMismatchLog.set(serverId, now);
    void prisma.server
        .findUnique({ where: { id: serverId }, select: { userId: true } })
        .then((s) => {
            if (s) notifySecurityEvent(s.userId, 'host_key_mismatch');
            return s
                ? prisma.auditLog.create({
                      data: {
                          userId: s.userId,
                          action: 'SERVER_HOST_KEY_MISMATCH',
                          resource: `server:${serverId}`,
                          details: { expected: err.expected, actual: err.actual },
                      },
                  })
                : null;
        })
        .catch((e) => console.error('[host-key] audit failed:', e));
}

interface ProbeTarget {
    host: string;
    port: number;
    jump?: SSHJumpConfig | null;
}

export interface PresentedHostKey {
    fingerprint: string;
    keyType: string;
}

/**
 * The host key `target` presents now. Only the key exchange runs: the
 * connection is dropped before authentication. A bastion in between is
 * verified (or first-pinned) as usual.
 */
export function probeHostKey(target: ProbeTarget, timeoutMs = 10_000): Promise<PresentedHostKey> {
    return new Promise((resolve, reject) => {
        const client = new Client();
        let seen: PresentedHostKey | null = null;
        const timer = setTimeout(() => {
            client.end();
            reject(new Error('Timed out reading the host key'));
        }, timeoutMs);
        const done = () => {
            clearTimeout(timer);
            client.end();
        };

        const cc: ConnectConfig = {
            host: target.host,
            port: target.port,
            username: 'termi-host-key-probe',
            readyTimeout: timeoutMs,
            algorithms: { serverHostKey: HOST_KEY_ALGORITHMS },
            hostVerifier: (key: Buffer, verify: (ok: boolean) => void) => {
                seen = { fingerprint: fingerprintOf(key), keyType: keyTypeOf(key) };
                done();
                resolve(seen);
                verify(false); // stop before authenticating
            },
        };
        client.on('error', (err) => {
            if (seen) return; // the refusal we caused
            done();
            reject(err);
        });
        client.on('close', () => {
            if (seen) return;
            done();
            reject(new Error('Connection closed before the server sent its host key'));
        });
        try {
            connectSSH(client, cc, target.jump, null);
        } catch (err) {
            done();
            reject(err as Error);
        }
    });
}

interface PinnableServer {
    id: string;
    host: string;
    port: number;
    hostKey: HostKeyPin;
    jump: SSHJumpConfig | null;
}

/**
 * Make sure every SSH hop the gateway will verify has a pin. The bastion is
 * pinned first, since reaching the target goes through it.
 */
export async function ensureHostKeysPinned(server: PinnableServer, targetIsSSH: boolean) {
    const jump = server.jump;
    if (jump && !jump.hostKey.fingerprint) {
        const k = await probeHostKey({ host: jump.host, port: jump.port });
        jump.hostKey.fingerprint = await pinFirstHostKey(
            jump.hostKey.serverId,
            k.fingerprint,
            k.keyType,
        );
    }
    if (targetIsSSH && !server.hostKey.fingerprint) {
        const k = await probeHostKey({ host: server.host, port: server.port, jump });
        server.hostKey.fingerprint = await pinFirstHostKey(server.id, k.fingerprint, k.keyType);
    }
}
