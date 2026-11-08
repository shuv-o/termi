/**
 * Port-forwarding requests, shared by /api/connection/token (desktop app) and
 * /api/tunnels (bridge script). Turns a validated request into the token
 * claims the gateway's TunnelMuxHandler reads.
 */

import { z } from 'zod';
import type { ConnectionTokenClaims } from '@/lib/auth/connectionToken';

/** Where a remote forward may listen on the server. */
export const BIND_ADDRESSES = ['127.0.0.1', '0.0.0.0'] as const;

const port = z.number().int().min(1).max(65535);

export const forwardFields = {
    mode: z.enum(['local', 'dynamic', 'remote']).default('local'),
    /** local: the target, as seen from the server. */
    remoteHost: z.string().min(1).max(255).optional(),
    remotePort: port.optional(),
    /** remote: where the server listens (0 = any free port). */
    bindAddress: z.enum(BIND_ADDRESSES).default('127.0.0.1'),
    bindPort: z.number().int().min(0).max(65535).optional(),
};

export const forwardSchema = z.object(forwardFields);
export type ForwardRequest = z.infer<typeof forwardSchema>;

/** The claims for a forwarding request, or a message explaining what's missing. */
export function forwardClaims(
    req: ForwardRequest,
): Pick<ConnectionTokenClaims, 'forward' | 'remoteHost' | 'remotePort'> | { error: string } {
    switch (req.mode) {
        case 'local':
            if (!req.remoteHost || !req.remotePort) {
                return { error: 'Choose the host and port to forward to' };
            }
            return {
                forward: { kind: 'local' },
                remoteHost: req.remoteHost,
                remotePort: req.remotePort,
            };
        case 'dynamic':
            return { forward: { kind: 'dynamic' } };
        case 'remote':
            if (req.bindPort === undefined) {
                return { error: 'Choose the port the server should listen on' };
            }
            return {
                forward: { kind: 'remote', bindAddress: req.bindAddress, bindPort: req.bindPort },
            };
    }
}
