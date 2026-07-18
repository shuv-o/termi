/**
 * POST /api/servers/export
 *
 * Produces a downloadable copy of the user's server inventory.
 *
 * This is the single most dangerous endpoint in the app: one successful call
 * returns every credential the account holds, in the clear if the user asks for
 * it. The controls are correspondingly heavy —
 *
 *   1. Step-up re-authentication on *every* export, credentials or not. Hosts
 *      and usernames are encrypted at rest too, so even the "safe" export is a
 *      complete map of the user's infrastructure.
 *   2. A tight rate limit (5/hour) — this bounds what a stolen session yields.
 *   3. Plaintext credentials require an explicit, separate acknowledgement
 *      flag. A client cannot produce a plaintext credential dump by accident.
 *   4. Every attempt is audit-logged, successes and failures alike, recording
 *      the format and whether secrets were included.
 *
 * The response is a file body, not JSON, so nothing is cached or logged by
 * intermediaries as a normal API payload.
 */

import { z } from 'zod';

import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import {
    validateBody,
    errorResponse,
    unauthorizedResponse,
    getClientIP,
    getDeviceInfo,
} from '@/lib/api';
import { serverExportRateLimit } from '@/lib/rate-limit';
import { reauthFields, hasReauthProof, verifyReauth } from '@/lib/auth/reauth';
import {
    buildPayload,
    buildExportFile,
    buildSpreadsheet,
    exportFilename,
    MIN_PASSPHRASE_LENGTH,
    type StoredServer,
} from '@/lib/transfer';

const exportSchema = z
    .object({
        format: z.enum(['json', 'xlsx', 'csv']),
        includeCredentials: z.boolean(),

        /** Encrypts a JSON export. Required unless `acknowledgePlaintext` is set. */
        passphrase: z.string().min(MIN_PASSPHRASE_LENGTH).max(256).optional(),

        /**
         * Explicit opt-in to writing secrets to disk unencrypted. Named for what
         * it actually means so it cannot be set casually.
         */
        acknowledgePlaintext: z.boolean().optional(),

        ...reauthFields,
    })
    .refine((data) => !(data.format !== 'json' && data.passphrase), {
        message: 'Spreadsheet exports cannot be encrypted. Use the JSON format for encryption.',
        path: ['passphrase'],
    })
    .refine(
        (data) => !(data.includeCredentials && !data.passphrase && !data.acknowledgePlaintext),
        {
            message:
                'Exporting credentials requires either a passphrase or explicit acknowledgement that the file will contain unencrypted secrets.',
            path: ['acknowledgePlaintext'],
        },
    );

export async function POST(request: Request) {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    const ipAddress = getClientIP(request);
    const deviceInfo = getDeviceInfo(request);

    const rl = serverExportRateLimit(user.id);
    if (!rl.allowed) {
        return errorResponse('Too many export requests. Please wait before trying again.', 429);
    }

    const validation = await validateBody(request, exportSchema);
    if ('error' in validation) return validation.error;

    const { format, includeCredentials, passphrase, ...auth } = validation.data;

    const audit = async (success: boolean, reason?: string) => {
        await prisma.auditLog.create({
            data: {
                userId: user.id,
                action: 'SERVERS_EXPORTED',
                resource: 'servers',
                ipAddress,
                userAgent: deviceInfo,
                details: {
                    success,
                    format,
                    includeCredentials,
                    encrypted: Boolean(passphrase),
                    ...(reason ? { reason } : {}),
                },
            },
        });
    };

    if (!hasReauthProof(auth)) {
        return errorResponse(
            'Re-authentication required: provide your password, 2FA code, or passkey',
            400,
        );
    }

    if (!(await verifyReauth(user.id, auth))) {
        await audit(false, 'Auth failed');
        return errorResponse('Authentication failed', 401);
    }

    try {
        const servers = (await prisma.server.findMany({
            where: { userId: user.id },
            orderBy: { name: 'asc' },
            include: {
                group: { select: { name: true, description: true, color: true, icon: true } },
            },
        })) as unknown as StoredServer[];

        const now = new Date();
        const payload = buildPayload(servers, { includeCredentials });

        const { body, contentType, extension } =
            format === 'json'
                ? {
                      body: Buffer.from(
                          JSON.stringify(
                              buildExportFile(payload, {
                                  includesCredentials: includeCredentials,
                                  passphrase,
                                  now,
                              }),
                              null,
                              2,
                          ),
                          'utf8',
                      ),
                      contentType: 'application/json',
                      extension: 'json' as const,
                  }
                : {
                      body: buildSpreadsheet(payload, {
                          format,
                          includesCredentials: includeCredentials,
                          now,
                      }),
                      contentType:
                          format === 'xlsx'
                              ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                              : 'text/csv; charset=utf-8',
                      extension: format,
                  };

        await audit(true);

        return new Response(new Uint8Array(body), {
            status: 200,
            headers: {
                'Content-Type': contentType,
                'Content-Disposition': `attachment; filename="${exportFilename(extension, now)}"`,
                'Content-Length': String(body.length),
                // Never let a credential file sit in a shared or disk cache.
                'Cache-Control': 'no-store, no-cache, must-revalidate, private',
                Pragma: 'no-cache',
                'X-Content-Type-Options': 'nosniff',
            },
        });
    } catch (error) {
        console.error('Server export error:', error);
        await audit(false, 'Export failed');
        return errorResponse('Failed to build export', 500);
    }
}
