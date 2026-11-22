/**
 * POST /api/internal/connections — gateway only.
 *
 * A gateway reports everything it has open and gets back the connections
 * their owners asked to close (lib/services/live-connection.service.ts).
 * Authenticated like the access check: a gateway service token (purpose
 * "connections"), or a desktop app's own gateway signing with its device key,
 * which may only report its own user's connections.
 */

import { z } from 'zod';
import { verifyServiceToken } from '@/lib/auth';
import { errorResponse, successResponse, validateBody } from '@/lib/api';
import { verifyDeviceRequest } from '@/lib/auth/device';
import { recordReport } from '@/lib/services/live-connection.service';

const id = z.string().min(1).max(200);
const schema = z.object({
    gatewayId: z.string().min(1).max(100),
    intervalSec: z.number().int().min(1).max(600),
    connections: z
        .array(
            z.object({
                id,
                userId: id,
                sid: id.nullable(),
                kind: z.enum(['session', 'guest', 'socket']),
                protocol: z.enum(['ssh', 'scp', 'rdp', 'vnc', 'telnet', 'local', 'tunnel']),
                serverId: id.optional(),
                sessionId: id.optional(),
                attached: z.boolean(),
                guests: z.number().int().min(0).max(1000),
                startedAt: z.number().int().nonnegative(),
                lastActivityAt: z.number().int().nonnegative(),
                detail: z
                    .object({
                        forward: z.enum(['local', 'dynamic', 'remote']).optional(),
                        remotePort: z.number().int().min(0).max(65535).optional(),
                        bindPort: z.number().int().min(0).max(65535).optional(),
                        guestMode: z.enum(['view', 'control']).optional(),
                    })
                    .strict()
                    .optional(),
            }),
        )
        .max(20_000),
});

export async function POST(request: Request) {
    const auth = request.headers.get('authorization') ?? '';
    let device: { id: string; userId: string } | null = null;
    if (auth.startsWith('Device ')) {
        device = await verifyDeviceRequest(auth, 'connections');
        if (!device) return errorResponse('Unauthorized', 401);
    } else {
        const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
        if (!token || !(await verifyServiceToken(token, 'connections'))) {
            return errorResponse('Unauthorized', 401);
        }
    }

    const validation = await validateBody(request, schema);
    if ('error' in validation) return validation.error;
    const { gatewayId, intervalSec, connections } = validation.data;

    const close = await recordReport(
        device
            ? {
                  // A device's gateway can't pick another gateway's id, nor
                  // list anyone else's connections.
                  gatewayId: `device:${device.id}:${gatewayId}`.slice(0, 200),
                  deviceId: device.id,
                  intervalSec,
                  connections: connections.filter((c) => c.userId === device.userId),
              }
            : { gatewayId: `gw:${gatewayId}`, deviceId: null, intervalSec, connections },
    );
    return successResponse({ close });
}
