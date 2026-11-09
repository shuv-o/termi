/**
 * Keychain Credential Service
 *
 * Manages reusable credential sets (username + auth) that can be
 * applied to any server, stored with AES-256-GCM encryption.
 */

import { prisma } from '@/lib/db';
import { sealField, openField } from '@/lib/crypto';

export interface KeychainEntry {
    id: string;
    label: string;
    username: string;
    hasPassword: boolean;
    hasPrivateKey: boolean;
    /** The entry's OpenSSH certificate (public). */
    certificate: string | null;
    createdAt: Date;
    updatedAt: Date;
}

export interface KeychainEntryFull {
    id: string;
    label: string;
    username: string;
    password?: string;
    privateKey?: string;
    passphrase?: string;
    certificate?: string | null;
}

export interface CreateKeychainInput {
    label: string;
    username: string;
    password?: string;
    privateKey?: string;
    passphrase?: string;
    certificate?: string | null;
}

export type UpdateKeychainInput = Partial<CreateKeychainInput>;

export async function createKeychainCredential(
    userId: string,
    input: CreateKeychainInput,
): Promise<KeychainEntry> {
    const encUsername = sealField(input.username, 'KeychainCredential', 'username', userId);
    const encPassword = input.password
        ? sealField(input.password, 'KeychainCredential', 'password', userId)
        : undefined;
    const encPrivateKey = input.privateKey
        ? sealField(input.privateKey, 'KeychainCredential', 'privateKey', userId)
        : undefined;
    const encPassphrase = input.passphrase
        ? sealField(input.passphrase, 'KeychainCredential', 'passphrase', userId)
        : undefined;

    const entry = await prisma.keychainCredential.create({
        data: {
            userId,
            label: input.label,
            username: encUsername,
            password: encPassword,
            privateKey: encPrivateKey,
            passphrase: encPassphrase,
            certificate: input.certificate || null,
        },
    });

    await prisma.auditLog.create({
        data: {
            userId,
            action: 'KEYCHAIN_CREATED',
            resource: `keychain:${entry.id}`,
            details: { label: entry.label },
        },
    });

    return {
        id: entry.id,
        label: entry.label,
        username: input.username,
        hasPassword: !!input.password,
        hasPrivateKey: !!input.privateKey,
        certificate: entry.certificate,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
    };
}

export async function getKeychainCredentials(userId: string): Promise<KeychainEntry[]> {
    const rows = await prisma.keychainCredential.findMany({
        where: { userId },
        orderBy: { label: 'asc' },
    });

    return rows.map((row) => ({
        id: row.id,
        label: row.label,
        username: openField(row.username, 'KeychainCredential', 'username', userId),
        hasPassword: !!row.password,
        hasPrivateKey: !!row.privateKey,
        certificate: row.certificate,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    }));
}

export async function getKeychainCredentialById(
    id: string,
    userId: string,
): Promise<KeychainEntryFull | null> {
    const row = await prisma.keychainCredential.findFirst({ where: { id, userId } });
    if (!row) return null;

    return {
        id: row.id,
        label: row.label,
        username: openField(row.username, 'KeychainCredential', 'username', userId),
        password: row.password
            ? openField(row.password, 'KeychainCredential', 'password', userId)
            : undefined,
        privateKey: row.privateKey
            ? openField(row.privateKey, 'KeychainCredential', 'privateKey', userId)
            : undefined,
        passphrase: row.passphrase
            ? openField(row.passphrase, 'KeychainCredential', 'passphrase', userId)
            : undefined,
        certificate: row.certificate,
    };
}

export async function updateKeychainCredential(
    id: string,
    userId: string,
    input: UpdateKeychainInput,
): Promise<KeychainEntry | null> {
    const existing = await prisma.keychainCredential.findFirst({ where: { id, userId } });
    if (!existing) return null;

    const updateData: Record<string, unknown> = {};
    if (input.label !== undefined) updateData.label = input.label;
    if (input.username !== undefined)
        updateData.username = sealField(input.username, 'KeychainCredential', 'username', userId);
    if (input.password !== undefined)
        updateData.password = input.password
            ? sealField(input.password, 'KeychainCredential', 'password', userId)
            : null;
    if (input.privateKey !== undefined)
        updateData.privateKey = input.privateKey
            ? sealField(input.privateKey, 'KeychainCredential', 'privateKey', userId)
            : null;
    if (input.passphrase !== undefined)
        updateData.passphrase = input.passphrase
            ? sealField(input.passphrase, 'KeychainCredential', 'passphrase', userId)
            : null;

    if (input.certificate !== undefined) updateData.certificate = input.certificate || null;

    const updated = await prisma.keychainCredential.update({
        where: { id },
        data: updateData,
    });

    await prisma.auditLog.create({
        data: {
            userId,
            action: 'KEYCHAIN_UPDATED',
            resource: `keychain:${id}`,
        },
    });

    return {
        id: updated.id,
        label: updated.label,
        username:
            input.username !== undefined
                ? input.username
                : openField(existing.username, 'KeychainCredential', 'username', userId),
        hasPassword: !!updated.password,
        hasPrivateKey: !!updated.privateKey,
        certificate: updated.certificate,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
    };
}

export async function deleteKeychainCredential(id: string, userId: string): Promise<boolean> {
    const existing = await prisma.keychainCredential.findFirst({
        where: { id, userId },
        select: { id: true, label: true },
    });
    if (!existing) return false;

    await prisma.keychainCredential.delete({ where: { id } });

    await prisma.auditLog.create({
        data: {
            userId,
            action: 'KEYCHAIN_DELETED',
            resource: `keychain:${id}`,
            details: { label: existing.label },
        },
    });

    return true;
}

/**
 * Fill a request's credentials from one of the user's keychain entries,
 * server-side, so the secrets never travel to the browser. Returns the input
 * without `keychainId` (unchanged when none was given), or null if the entry
 * doesn't exist or isn't the user's.
 */
export async function withKeychainCredentials<
    T extends {
        keychainId?: string;
        username?: string;
        password?: string;
        privateKey?: string;
        passphrase?: string;
        certificate?: string | null;
    },
>(input: T, userId: string): Promise<Omit<T, 'keychainId'> | null> {
    const { keychainId, ...rest } = input;
    if (!keychainId) return rest;
    const entry = await getKeychainCredentialById(keychainId, userId);
    if (!entry) return null;
    return {
        ...rest,
        username: rest.username || entry.username,
        password: entry.password,
        privateKey: entry.privateKey,
        passphrase: entry.passphrase,
        // The entry's certificate belongs to its key; a key without one drops
        // any certificate the form had.
        certificate: entry.privateKey ? (entry.certificate ?? null) : rest.certificate,
    };
}
