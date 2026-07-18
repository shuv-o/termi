/**
 * POST /api/servers/import
 *
 * Restores servers from a file produced by /api/servers/export.
 *
 * The threat model here is the mirror image of export: the file is entirely
 * attacker-controlled, and a user can be socially engineered into importing one
 * they did not create. So a malicious file must not be able to
 *
 *   - point a stored server at an internal address (every host is SSRF-checked,
 *     with results cached per unique host so a 1000-row file is not 1000 DNS
 *     lookups);
 *   - exhaust the server (row count, field lengths and body size are all
 *     bounded before any work happens);
 *   - reach another user's data (groups are matched within the caller's own
 *     account, and createServer re-verifies group ownership);
 *   - land unencrypted in the database (createServer encrypts on the way in).
 *
 * Import is intentionally additive: it never updates or deletes an existing
 * server, so a bad file cannot destroy a working inventory. Name collisions are
 * skipped or suffixed, never overwritten.
 */

import { z } from 'zod';

import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import {
    validateBody,
    successResponse,
    errorResponse,
    unauthorizedResponse,
    getClientIP,
    getDeviceInfo,
} from '@/lib/api';
import { serverImportRateLimit } from '@/lib/rate-limit';
import { validateHost } from '@/lib/security/ssrf';
import { createServer, createServerGroup } from '@/lib/services';
import { Protocol } from '@/app/generated/prisma/client';
import {
    parseExportFile,
    parseCsvExport,
    InvalidFileError,
    PassphraseRequiredError,
    WrongPassphraseError,
    MAX_IMPORT_SERVERS,
} from '@/lib/transfer';

/** 8 MB of text. A 1000-server export with private keys is well under 5 MB. */
const MAX_CONTENT_LENGTH = 8 * 1024 * 1024;

/** Concurrent DNS lookups during host validation. */
const SSRF_CONCURRENCY = 8;

const importSchema = z.object({
    content: z.string().min(1).max(MAX_CONTENT_LENGTH),
    fileType: z.enum(['json', 'csv']),
    passphrase: z.string().max(256).optional(),
    /** What to do when a server of the same name already exists. */
    onDuplicate: z.enum(['skip', 'rename']).default('skip'),
});

interface ImportFailure {
    name: string;
    reason: string;
}

/**
 * Resolve SSRF checks for the distinct hosts in a payload.
 *
 * Deduplicating first matters: an inventory legitimately has many servers on
 * one bastion, and each `validateHost` call performs DNS resolution.
 */
async function validateHosts(hosts: string[]): Promise<Map<string, string | null>> {
    const allowPrivate = process.env.ALLOW_PRIVATE_NETWORKS === 'true';
    const unique = [...new Set(hosts)];
    const results = new Map<string, string | null>();

    for (let i = 0; i < unique.length; i += SSRF_CONCURRENCY) {
        const batch = unique.slice(i, i + SSRF_CONCURRENCY);
        await Promise.all(
            batch.map(async (host) => {
                try {
                    const check = await validateHost(host, allowPrivate);
                    results.set(host, check.valid ? null : (check.error ?? 'Invalid host'));
                } catch {
                    results.set(host, 'Host could not be resolved');
                }
            }),
        );
    }

    return results;
}

export async function POST(request: Request) {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    const ipAddress = getClientIP(request);
    const deviceInfo = getDeviceInfo(request);

    const rl = serverImportRateLimit(user.id);
    if (!rl.allowed) {
        return errorResponse('Too many import requests. Please wait before trying again.', 429);
    }

    const validation = await validateBody(request, importSchema);
    if ('error' in validation) return validation.error;

    const { content, fileType, passphrase, onDuplicate } = validation.data;

    //   Parse and validate the file before touching the database

    let payload;
    try {
        if (fileType === 'csv') {
            payload = parseCsvExport(content);
        } else {
            let parsed: unknown;
            try {
                parsed = JSON.parse(content);
            } catch {
                throw new InvalidFileError('The file is not valid JSON.');
            }
            payload = parseExportFile(parsed, passphrase);
        }
    } catch (error) {
        if (error instanceof PassphraseRequiredError) {
            // 422 rather than 400 so the client can distinguish "ask the user for
            // a passphrase and retry" from "this file is broken".
            return errorResponse(error.message, 422);
        }
        if (error instanceof WrongPassphraseError || error instanceof InvalidFileError) {
            return errorResponse(error.message, 400);
        }
        console.error('Server import parse error:', error);
        return errorResponse('Failed to read the import file', 400);
    }

    if (payload.servers.length === 0) {
        return errorResponse('The file contains no servers.', 400);
    }
    if (payload.servers.length > MAX_IMPORT_SERVERS) {
        return errorResponse(`An import is limited to ${MAX_IMPORT_SERVERS} servers.`, 400);
    }

    try {
        //   Pre-flight checks that apply to the whole file

        const hostErrors = await validateHosts(payload.servers.map((s) => s.host));

        const existingNames = new Set(
            (
                await prisma.server.findMany({
                    where: { userId: user.id },
                    select: { name: true },
                })
            ).map((s) => s.name),
        );

        //   Groups: match by name within this account, create what is missing

        const groups = await prisma.serverGroup.findMany({
            where: { userId: user.id },
            select: { id: true, name: true },
        });
        const groupIds = new Map(groups.map((g) => [g.name, g.id]));

        for (const group of payload.groups) {
            if (groupIds.has(group.name)) continue;
            try {
                const created = await createServerGroup({
                    userId: user.id,
                    name: group.name,
                    description: group.description ?? undefined,
                    color: group.color ?? undefined,
                    icon: group.icon ?? undefined,
                });
                groupIds.set(group.name, created.id);
            } catch (error) {
                // A group that fails to create is not fatal — the servers that
                // referenced it are imported ungrouped rather than dropped.
                console.error(`Import: could not create group "${group.name}":`, error);
            }
        }

        //   Servers

        let imported = 0;
        let skipped = 0;
        const failed: ImportFailure[] = [];

        for (const server of payload.servers) {
            const hostError = hostErrors.get(server.host);
            if (hostError) {
                failed.push({ name: server.name, reason: hostError });
                continue;
            }

            const name = resolveName(server.name, existingNames, onDuplicate);
            if (name === null) {
                skipped++;
                continue;
            }

            try {
                await createServer({
                    userId: user.id,
                    name,
                    description: server.description ?? undefined,
                    groupId: server.groupName ? groupIds.get(server.groupName) : undefined,

                    host: server.host,
                    port: server.port,
                    protocol: server.protocol as Protocol,
                    username: server.username,

                    password: server.password ?? undefined,
                    privateKey: server.privateKey ?? undefined,
                    passphrase: server.passphrase ?? undefined,
                    notes: server.notes ?? undefined,

                    tags: server.tags,
                    displayWidth: server.displayWidth ?? undefined,
                    displayHeight: server.displayHeight ?? undefined,
                    colorDepth: server.colorDepth ?? undefined,
                    rdpSecurity: server.rdpSecurity ?? undefined,
                });

                existingNames.add(name);
                imported++;
            } catch (error) {
                console.error(`Import: could not create server "${server.name}":`, error);
                failed.push({ name: server.name, reason: 'Could not be saved' });
            }
        }

        await prisma.auditLog.create({
            data: {
                userId: user.id,
                action: 'SERVERS_IMPORTED',
                resource: 'servers',
                ipAddress,
                userAgent: deviceInfo,
                details: {
                    success: true,
                    fileType,
                    encrypted: fileType === 'json' && Boolean(passphrase),
                    total: payload.servers.length,
                    imported,
                    skipped,
                    failed: failed.length,
                },
            },
        });

        return successResponse({
            imported,
            skipped,
            failed,
            total: payload.servers.length,
        });
    } catch (error) {
        console.error('Server import error:', error);
        return errorResponse('Failed to import servers', 500);
    }
}

/**
 * Decide the name to store under.
 *
 * @returns the name to use, or null when the row should be skipped
 */
function resolveName(
    name: string,
    taken: Set<string>,
    onDuplicate: 'skip' | 'rename',
): string | null {
    if (!taken.has(name)) return name;
    if (onDuplicate === 'skip') return null;

    for (let n = 2; n < 1000; n++) {
        const candidate = `${name} (${n})`;
        if (!taken.has(candidate)) return candidate;
    }

    return null;
}
