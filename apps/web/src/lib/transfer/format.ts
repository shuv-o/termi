/**
 * Termi server export/import file format (v1).
 *
 * One shape covers both the encrypted and the plaintext variants so a single
 * parser can read either — `encrypted` selects which branch `payload` holds.
 *
 * Groups are referenced by *name* rather than id: ids are meaningless in
 * another account, and the importer recreates or matches groups by name.
 */

import { z } from 'zod';

import { Protocol } from '@/app/generated/prisma/client';

export const EXPORT_FORMAT = 'termi-export' as const;
export const EXPORT_VERSION = 1 as const;

/**
 * Upper bound on servers in a single import.
 *
 * Import decrypts and SSRF-checks every host, so an unbounded file is a cheap
 * way to tie up the event loop and hammer DNS. Well beyond any real inventory.
 */
export const MAX_IMPORT_SERVERS = 1000;

/** Minimum length for an export passphrase. */
export const MIN_PASSPHRASE_LENGTH = 12;

// PAYLOAD

const groupSchema = z.object({
    name: z.string().min(1).max(100),
    description: z.string().max(500).nullish(),
    color: z.string().max(32).nullish(),
    icon: z.string().max(64).nullish(),
});

const serverSchema = z.object({
    name: z.string().min(1).max(100),
    description: z.string().max(500).nullish(),
    groupName: z.string().max(100).nullish(),

    host: z.string().min(1).max(255),
    port: z.number().int().min(1).max(65535),
    protocol: z.nativeEnum(Protocol),
    username: z.string().min(1).max(255),

    // Only present when the export included credentials.
    password: z.string().max(4096).nullish(),
    privateKey: z.string().max(32768).nullish(),
    passphrase: z.string().max(4096).nullish(),
    notes: z.string().max(8192).nullish(),

    tags: z.array(z.string().max(64)).max(50).optional(),
    color: z.string().max(32).nullish(),
    icon: z.string().max(64).nullish(),

    displayWidth: z.number().int().min(640).max(7680).nullish(),
    displayHeight: z.number().int().min(480).max(4320).nullish(),
    colorDepth: z.union([z.literal(8), z.literal(16), z.literal(24), z.literal(32)]).nullish(),
    rdpSecurity: z.enum(['any', 'rdp', 'nla', 'tls']).nullish(),

    isFavorite: z.boolean().optional(),
});

export const exportPayloadSchema = z.object({
    // Optional so a hand-authored payload can list servers alone; groups are
    // re-derived from each server's `groupName` on import regardless.
    groups: z.array(groupSchema).max(500).default([]),
    servers: z.array(serverSchema).max(MAX_IMPORT_SERVERS),
});

export type ExportPayload = z.infer<typeof exportPayloadSchema>;
export type ExportedServer = z.infer<typeof serverSchema>;
export type ExportedGroup = z.infer<typeof groupSchema>;

// ENVELOPE

/** AES-256-GCM ciphertext, matching the shape used elsewhere in `lib/crypto`. */
const encryptedDataSchema = z.object({
    iv: z.string().min(1),
    data: z.string().min(1),
    tag: z.string().min(1),
});

/**
 * Key-derivation parameters, stored alongside the ciphertext so a file stays
 * readable if the defaults are ever tightened. Only the salt is secret-adjacent
 * (it isn't secret at all — it exists to defeat precomputed tables).
 */
const kdfSchema = z.object({
    algorithm: z.literal('pbkdf2'),
    digest: z.literal('sha256'),
    iterations: z.number().int().min(100_000),
    salt: z.string().min(1),
});

export type ExportKdf = z.infer<typeof kdfSchema>;

const baseFields = {
    format: z.literal(EXPORT_FORMAT),
    version: z.literal(EXPORT_VERSION),
    // These three are informational — Termi's own exports always write them, but
    // they are optional on import so a file can be hand-authored from just
    // `format`, `version`, `encrypted` and `payload`.
    exportedAt: z.string().optional(),
    includesCredentials: z.boolean().optional(),
    serverCount: z.number().int().min(0).optional(),
};

/**
 * The file as it lands on disk.
 *
 * A discriminated union on `encrypted` means the parser cannot confuse an
 * encrypted file for a plaintext one — the `payload` type differs, and zod
 * rejects a mismatch rather than silently reading garbage.
 */
export const exportFileSchema = z.discriminatedUnion('encrypted', [
    z.object({
        ...baseFields,
        encrypted: z.literal(false),
        payload: exportPayloadSchema,
    }),
    z.object({
        ...baseFields,
        encrypted: z.literal(true),
        kdf: kdfSchema,
        payload: encryptedDataSchema,
    }),
]);

export type ExportFile = z.infer<typeof exportFileSchema>;

/** Suggested download filename, e.g. `termi-servers-2026-07-18.json`. */
export function exportFilename(extension: 'json' | 'xlsx' | 'csv', date: Date): string {
    const stamp = date.toISOString().slice(0, 10);
    return `termi-servers-${stamp}.${extension}`;
}
