/**
 * Multi-Server Broadcast Service
 *
 * Runs one shell command across every SSH server in a group, in parallel
 * (capped), via the shared SSH connection pool used by metrics/monitoring —
 * NOT through the interactive terminal session system in apps/gateway.
 */

import { prisma } from '@/lib/db';
import { decryptCredentials } from '@/lib/crypto/credentials';
import { sshPool, type SSHPoolConfig } from './ssh-pool';

/** How many servers to run the command on at once. */
const CONCURRENCY = 5;
/** Give up on a single server after this long. */
const EXEC_TIMEOUT_MS = 20_000;
/** Cap captured output so one runaway command can't blow up the response. */
const MAX_OUTPUT_CHARS = 20_000;

export interface BroadcastResult {
    serverId: string;
    serverName: string;
    success: boolean;
    output: string;
    error?: string;
    exitCode: number | null;
    durationMs: number;
}

interface BroadcastServer {
    id: string;
    name: string;
    host: string;
    port: number;
    username: string;
    password: string | null;
    privateKey: string | null;
    passphrase: string | null;
}

/**
 * The SSH servers in a group this user owns. Returns `null` if the group
 * doesn't exist or isn't theirs. Non-SSH servers (RDP/VNC/Telnet/SCP) are
 * excluded — there's no shell to exec a command on.
 */
export async function getBroadcastableServers(
    groupId: string,
    userId: string,
): Promise<BroadcastServer[] | null> {
    const group = await prisma.serverGroup.findFirst({
        where: { id: groupId, userId },
        select: {
            servers: {
                where: { protocol: 'SSH' },
                select: {
                    id: true,
                    name: true,
                    host: true,
                    port: true,
                    username: true,
                    password: true,
                    privateKey: true,
                    passphrase: true,
                },
            },
        },
    });
    if (!group) return null;
    return group.servers;
}

function truncate(output: string): string {
    return output.length > MAX_OUTPUT_CHARS
        ? `${output.slice(0, MAX_OUTPUT_CHARS)}\n… (truncated)`
        : output;
}

/** Runs `command` on one server via the pooled SSH connection. Never rejects. */
function execOne(server: BroadcastServer, command: string): Promise<BroadcastResult> {
    const started = Date.now();

    return new Promise((resolve) => {
        let poolKey: string | undefined;
        let released = false;

        const done = (partial: Omit<BroadcastResult, 'serverId' | 'serverName' | 'durationMs'>) => {
            if (!released) {
                released = true;
                if (poolKey) sshPool.release(poolKey);
            }
            resolve({
                serverId: server.id,
                serverName: server.name,
                durationMs: Date.now() - started,
                ...partial,
            });
        };

        let creds;
        try {
            // Decrypt credentials first — the DB stores them encrypted.
            creds = decryptCredentials({
                host: server.host,
                username: server.username,
                password: server.password ?? undefined,
                privateKey: server.privateKey ?? undefined,
                passphrase: server.passphrase ?? undefined,
            });
        } catch {
            done({
                success: false,
                output: '',
                error: 'Failed to decrypt credentials',
                exitCode: null,
            });
            return;
        }

        const config: SSHPoolConfig = {
            id: server.id,
            host: creds.host,
            port: server.port,
            username: creds.username,
            password: creds.password,
            privateKey: creds.privateKey,
            passphrase: creds.passphrase,
        };

        sshPool
            .acquire(config)
            .then(({ client, key }) => {
                poolKey = key;

                const timer = setTimeout(() => {
                    done({
                        success: false,
                        output: '',
                        error: 'Command timed out',
                        exitCode: null,
                    });
                }, EXEC_TIMEOUT_MS);

                client.exec(command, (err, stream) => {
                    if (err) {
                        clearTimeout(timer);
                        done({
                            success: false,
                            output: '',
                            error: 'Failed to execute command',
                            exitCode: null,
                        });
                        return;
                    }

                    let output = '';
                    let exitCode: number | null = null;

                    stream.on('data', (chunk: Buffer) => {
                        output += chunk.toString();
                    });
                    stream.stderr.on('data', (chunk: Buffer) => {
                        output += chunk.toString();
                    });
                    stream.on('exit', (code: number | null) => {
                        exitCode = code;
                    });
                    stream.on('close', () => {
                        clearTimeout(timer);
                        done({ success: exitCode === 0, output: truncate(output), exitCode });
                    });
                    stream.on('error', () => {
                        clearTimeout(timer);
                        done({
                            success: false,
                            output: truncate(output),
                            error: 'Stream error',
                            exitCode: null,
                        });
                    });
                });
            })
            .catch((err) => {
                done({
                    success: false,
                    output: '',
                    error: `SSH connect error: ${err instanceof Error ? err.message : String(err)}`,
                    exitCode: null,
                });
            });
    });
}

/** Runs `command` on every server, at most CONCURRENCY in flight at once. */
export async function runBroadcast(
    servers: BroadcastServer[],
    command: string,
): Promise<BroadcastResult[]> {
    const results: BroadcastResult[] = [];
    for (let i = 0; i < servers.length; i += CONCURRENCY) {
        const batch = servers.slice(i, i + CONCURRENCY);
        const batchResults = await Promise.all(batch.map((s) => execOne(s, command)));
        results.push(...batchResults);
    }
    return results;
}
