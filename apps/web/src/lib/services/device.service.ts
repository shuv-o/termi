/**
 * Desktop app devices that may connect to their user's own servers directly.
 *
 * Registering one hands it the ability to receive server logins (sealed to
 * its key), so the route requires a fresh password or passkey proof, the
 * event is audit-logged and emailed, and the device lives only as long as the
 * sign-in that registered it.
 */

import { prisma } from '@/lib/db';
import { keyIdOf, parsePublicKey, type PublicJwk } from '@/lib/auth/device';
import { notifySecurityEvent } from './security-alerts.service';

export class DeviceError extends Error {
    constructor(
        message: string,
        public status = 400,
    ) {
        super(message);
    }
}

export interface CurrentDevice {
    id: string;
    keyId: string;
    encKey: PublicJwk;
    name: string;
    createdAt: Date;
}

export async function registerDevice(
    userId: string,
    sessionId: string,
    input: { name: string; encKey: unknown; sigKey: unknown },
    context: { ipAddress?: string; deviceInfo?: string } = {},
): Promise<CurrentDevice> {
    const encKey = parsePublicKey(input.encKey);
    const sigKey = parsePublicKey(input.sigKey);
    if (!encKey || !sigKey) throw new DeviceError('These are not valid public device keys.');
    if (encKey.x === sigKey.x && encKey.y === sigKey.y) {
        throw new DeviceError('The sealing and signing keys must differ.');
    }
    const keyId = await keyIdOf(sigKey);
    const holder = await prisma.device.findUnique({ where: { keyId }, select: { userId: true } });
    if (holder && holder.userId !== userId) {
        throw new DeviceError('This device key is already registered to another account.', 409);
    }

    // One device per sign-in, and one sign-in per device key.
    const [, device] = await prisma.$transaction([
        prisma.device.deleteMany({ where: { OR: [{ sessionId }, { keyId }] } }),
        prisma.device.create({
            data: {
                userId,
                sessionId,
                keyId,
                encKey: { ...encKey },
                sigKey: { ...sigKey },
                name: input.name,
            },
        }),
    ]);
    await prisma.auditLog.create({
        data: {
            userId,
            action: 'DEVICE_REGISTERED',
            resource: `device:${device.id}`,
            details: { name: input.name },
            ipAddress: context.ipAddress,
            userAgent: context.deviceInfo,
        },
    });
    notifySecurityEvent(userId, 'device_registered', context);
    return { id: device.id, keyId, encKey, name: device.name, createdAt: device.createdAt };
}

/** The device registered by this sign-in, if any. */
export async function currentDevice(
    userId: string,
    sessionId: string,
): Promise<CurrentDevice | null> {
    const d = await prisma.device.findUnique({ where: { sessionId } });
    if (!d || d.userId !== userId) return null;
    const encKey = parsePublicKey(d.encKey);
    if (!encKey) return null;
    return { id: d.id, keyId: d.keyId, encKey, name: d.name, createdAt: d.createdAt };
}

export async function removeDevice(userId: string, sessionId: string): Promise<boolean> {
    const { count } = await prisma.device.deleteMany({ where: { userId, sessionId } });
    return count > 0;
}
