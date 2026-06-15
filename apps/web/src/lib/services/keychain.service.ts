/**
 * Keychain Credential Service
 *
 * Manages reusable credential sets (username + auth) that can be
 * applied to any server, stored with AES-256-GCM encryption.
 */

import { prisma } from '@/lib/db';
import { EncryptionContext, encryptCredentialField, decryptCredentialField } from '@/lib/crypto';

// TYPES

export interface KeychainEntry {
    id: string;
    label: string;
    username: string;
    hasPassword: boolean;
    hasPrivateKey: boolean;
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
}

export interface CreateKeychainInput {
    label: string;
    username: string;
    password?: string;
    privateKey?: string;
    passphrase?: string;
}

export type UpdateKeychainInput = Partial<CreateKeychainInput>;

// CREATE

export async function createKeychainCredential(
    userId: string,
    input: CreateKeychainInput,
    context?: EncryptionContext,
): Promise<KeychainEntry> {
    const encUsername = encryptCredentialField(input.username, context);
    const encPassword = input.password
        ? encryptCredentialField(input.password, context)
        : undefined;
    const encPrivateKey = input.privateKey
        ? encryptCredentialField(input.privateKey, context)
        : undefined;
    const encPassphrase = input.passphrase
        ? encryptCredentialField(input.passphrase, context)
        : undefined;

    const entry = await prisma.keychainCredential.create({
        data: {
            userId,
            label: input.label,
            username: encUsername,
            password: encPassword,
            privateKey: encPrivateKey,
            passphrase: encPassphrase,
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
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
    };
}

// READ

export async function getKeychainCredentials(
    userId: string,
    context?: EncryptionContext,
): Promise<KeychainEntry[]> {
    const rows = await prisma.keychainCredential.findMany({
        where: { userId },
        orderBy: { label: 'asc' },
    });

    return rows.map((row) => ({
        id: row.id,
        label: row.label,
        username: decryptCredentialField(row.username, context),
        hasPassword: !!row.password,
        hasPrivateKey: !!row.privateKey,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    }));
}

export async function getKeychainCredentialById(
    id: string,
    userId: string,
    context?: EncryptionContext,
): Promise<KeychainEntryFull | null> {
    const row = await prisma.keychainCredential.findFirst({ where: { id, userId } });
    if (!row) return null;

    return {
        id: row.id,
        label: row.label,
        username: decryptCredentialField(row.username, context),
        password: row.password ? decryptCredentialField(row.password, context) : undefined,
        privateKey: row.privateKey ? decryptCredentialField(row.privateKey, context) : undefined,
        passphrase: row.passphrase ? decryptCredentialField(row.passphrase, context) : undefined,
    };
}

// UPDATE

export async function updateKeychainCredential(
    id: string,
    userId: string,
    input: UpdateKeychainInput,
    context?: EncryptionContext,
): Promise<KeychainEntry | null> {
    const existing = await prisma.keychainCredential.findFirst({ where: { id, userId } });
    if (!existing) return null;

    const updateData: Record<string, unknown> = {};
    if (input.label !== undefined) updateData.label = input.label;
    if (input.username !== undefined)
        updateData.username = encryptCredentialField(input.username, context);
    if (input.password !== undefined)
        updateData.password = input.password
            ? encryptCredentialField(input.password, context)
            : null;
    if (input.privateKey !== undefined)
        updateData.privateKey = input.privateKey
            ? encryptCredentialField(input.privateKey, context)
            : null;
    if (input.passphrase !== undefined)
        updateData.passphrase = input.passphrase
            ? encryptCredentialField(input.passphrase, context)
            : null;

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
                : decryptCredentialField(existing.username, context),
        hasPassword: !!updated.password,
        hasPrivateKey: !!updated.privateKey,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
    };
}

// DELETE

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
