/** Form/API validation for OpenSSH user certificates (see ssh-cert.ts). */

import { z } from 'zod';
import { CertificateError, parseCertificate } from './ssh-cert';

/** A certificate line, or empty / null to remove it. */
export const certificateField = z
    .string()
    .max(16384)
    .nullable()
    .optional()
    .superRefine((value, ctx) => {
        if (!value?.trim()) return;
        try {
            parseCertificate(value);
        } catch (err) {
            ctx.addIssue({
                code: 'custom',
                message: err instanceof CertificateError ? err.message : 'Invalid certificate',
            });
        }
    })
    .transform((v) => (v === undefined ? undefined : v?.trim() || null));

export const agentFields = {
    agentForwarding: z.enum(['off', 'on', 'confirm']).optional(),
    agentKeychainIds: z.array(z.string().min(1).max(64)).max(10).optional(),
};
