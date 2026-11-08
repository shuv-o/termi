/**
 * Server Management Service
 *
 * Handles CRUD operations for server credentials with encryption.
 */

import { prisma } from '@/lib/db';
import { Protocol } from '@/app/generated/prisma/client';
import { encryptCredentials, decryptCredentials, ServerCredentials } from '@/lib/crypto';
import { pinOf, type HostKeyPin } from '@/lib/security/host-key';

// TYPES

/**
 * Decrypted credentials for the bastion a server is reached through. Only ever
 * built server-side and handed to the SSH pool or sealed inside a gateway JWE.
 */
export type AgentForwardingMode = 'off' | 'on' | 'confirm';

/** Agent keys must be the user's own keychain entries that hold a private key. */
async function assertAgentKeys(userId: string, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const count = await prisma.keychainCredential.count({
        where: { id: { in: ids }, userId, privateKey: { not: null } },
    });
    if (count !== new Set(ids).size) {
        throw new JumpHostError('Choose keychain entries of your own that contain a private key');
    }
}

export interface JumpConfig {
    serverId: string;
    certificate?: string | null;
    /** The bastion's pinned SSH host key. */
    hostKey: HostKeyPin;
    host: string;
    port: number;
    username: string;
    password?: string;
    privateKey?: string;
    passphrase?: string;
}

/** A user-facing reason a jump-host choice was rejected (shown as a 400). */
export class JumpHostError extends Error {}

/**
 * Protocols that can be reached through an SSH jump host. RDP and VNC go
 * through the gateway's guacd relay, which needs GUACD_TUNNEL_HOST there.
 */
const JUMPABLE_PROTOCOLS: Protocol[] = ['SSH', 'SCP', 'RDP', 'VNC'];

/**
 * Checks that `jumpServerId` is a valid bastion for a server owned by `userId`.
 * Rules: it is the user's own SSH server, not the server itself, it is not
 * itself behind a jump (one hop only), and the target speaks SSH or SCP.
 * A server that other servers already jump through cannot get a jump of its
 * own either, since that would make those servers two hops deep.
 */
export async function assertValidJumpHost(
    userId: string,
    jumpServerId: string,
    targetProtocol: Protocol,
    selfId?: string,
): Promise<void> {
    if (!JUMPABLE_PROTOCOLS.includes(targetProtocol)) {
        throw new JumpHostError('Telnet servers cannot connect through a jump host');
    }
    if (selfId && jumpServerId === selfId) {
        throw new JumpHostError('A server cannot be its own jump host');
    }
    const jump = await prisma.server.findFirst({
        where: { id: jumpServerId, userId },
        select: { protocol: true, jumpServerId: true, name: true },
    });
    if (!jump) throw new JumpHostError('Jump host not found');
    if (jump.protocol !== 'SSH') {
        throw new JumpHostError(`${jump.name} is not an SSH server, so it cannot be a jump host`);
    }
    if (jump.jumpServerId) {
        throw new JumpHostError(
            `${jump.name} is itself reached through a jump host. Only one hop is supported.`,
        );
    }
    if (selfId) {
        const dependants = await prisma.server.count({ where: { jumpServerId: selfId } });
        if (dependants > 0) {
            throw new JumpHostError(
                'Other servers connect through this one, so it cannot use a jump host itself',
            );
        }
    }
}

/** Loads and decrypts the jump host for a server row, if it has one. */
export async function loadJump(
    jumpServerId: string | null,
    ownerId: string,
): Promise<JumpConfig | null> {
    if (!jumpServerId) return null;
    const jump = await prisma.server.findFirst({ where: { id: jumpServerId, userId: ownerId } });
    if (!jump) return null;
    const creds = decryptCredentials(
        {
            host: jump.host,
            username: jump.username,
            password: jump.password || undefined,
            privateKey: jump.privateKey || undefined,
            passphrase: jump.passphrase || undefined,
            notes: undefined,
        },
        ownerId,
    );
    return {
        serverId: jump.id,
        hostKey: pinOf(jump),
        certificate: jump.certificate,
        host: creds.host,
        port: jump.port,
        username: creds.username,
        password: creds.password,
        privateKey: creds.privateKey,
        passphrase: creds.passphrase,
    };
}

export interface CreateServerInput {
    userId: string;
    name: string;
    description?: string;
    groupId?: string;
    host: string;
    port: number;
    protocol: Protocol;
    username: string;
    password?: string;
    privateKey?: string;
    passphrase?: string;
    notes?: string;
    tags?: string[];
    displayWidth?: number;
    displayHeight?: number;
    colorDepth?: number;
    rdpSecurity?: string;
    jumpServerId?: string | null;
    certificate?: string | null;
    agentForwarding?: AgentForwardingMode;
    agentKeychainIds?: string[];
}

export interface UpdateServerInput {
    name?: string;
    description?: string;
    groupId?: string | null;
    host?: string;
    port?: number;
    protocol?: Protocol;
    username?: string;
    password?: string;
    privateKey?: string;
    passphrase?: string;
    notes?: string;
    tags?: string[];
    displayWidth?: number;
    displayHeight?: number;
    colorDepth?: number;
    rdpSecurity?: string;
    isFavorite?: boolean;
    jumpServerId?: string | null;
    certificate?: string | null;
    agentForwarding?: AgentForwardingMode;
    agentKeychainIds?: string[];
}

export interface ServerListItem {
    id: string;
    name: string;
    description?: string | null;
    protocol: Protocol;
    tags: string[];
    isFavorite: boolean;
    lastUsedAt: Date | null;
    hasPassword: boolean;
    host: string;
    username: string;
    port: number;
    /** The server this one is reached through, if any. */
    jumpServerId: string | null;
    group: {
        id: string;
        name: string;
        color: string | null;
    } | null;
}

// CREATE

export async function createServer(input: CreateServerInput) {
    const {
        userId,
        name,
        description,
        groupId,
        host,
        port,
        protocol,
        username,
        password,
        privateKey,
        passphrase,
        notes,
        tags,
        ...settings
    } = input;

    // Verify the group belongs to this user before assigning
    if (groupId) {
        const group = await prisma.serverGroup.findFirst({ where: { id: groupId, userId } });
        if (!group) throw new Error('Group not found or access denied');
    }

    if (settings.jumpServerId) {
        await assertValidJumpHost(userId, settings.jumpServerId, protocol);
    }
    if (settings.agentKeychainIds?.length) {
        await assertAgentKeys(userId, settings.agentKeychainIds);
    }

    // Encrypt sensitive credentials
    const credentials: ServerCredentials = {
        host,
        username,
        password,
        privateKey,
        passphrase,
        notes,
    };

    const encrypted = encryptCredentials(credentials, userId);

    const server = await prisma.server.create({
        data: {
            userId,
            name,
            description,
            groupId,
            host: encrypted.host,
            port,
            protocol,
            username: encrypted.username,
            password: encrypted.password,
            privateKey: encrypted.privateKey,
            passphrase: encrypted.passphrase,
            notes: encrypted.notes,
            tags: tags || [],
            ...settings,
        },
        select: {
            id: true,
            name: true,
            protocol: true,
        },
    });

    // Audit log
    await prisma.auditLog.create({
        data: {
            userId,
            action: 'SERVER_CREATED',
            resource: `server:${server.id}`,
            details: { name: server.name, protocol: server.protocol },
        },
    });

    return server;
}

// READ

export async function getServers(userId: string): Promise<ServerListItem[]> {
    const rows = await prisma.server.findMany({
        where: { userId },
        select: {
            id: true,
            name: true,
            description: true,
            protocol: true,
            tags: true,
            isFavorite: true,
            lastUsedAt: true,
            password: true,
            host: true,
            username: true,
            port: true,
            jumpServerId: true,
            group: {
                select: {
                    id: true,
                    name: true,
                    color: true,
                },
            },
        },
        orderBy: [{ isFavorite: 'desc' }, { lastUsedAt: 'desc' }, { name: 'asc' }],
    });
    return rows.map(({ password, host, username, ...rest }) => {
        const creds = decryptCredentials({ host, username }, userId);
        return { ...rest, hasPassword: !!password, host: creds.host, username: creds.username };
    });
}

/**
 * Returns a server record with **decrypted credentials** (password, privateKey, passphrase).
 *
 * ⚠️  NEVER return this object directly to the client.
 * Client-facing routes MUST strip credential fields:
 *   const { password, privateKey, passphrase, ...safeFields } = server;
 *
 * Use `getServerForConnection()` for SSH/SFTP connection setup.
 * Use `getServers()` for list views (already strips credentials).
 */
export async function getServerById(serverId: string, userId: string) {
    const server = await prisma.server.findFirst({
        where: { id: serverId, userId },
        include: {
            group: {
                select: {
                    id: true,
                    name: true,
                    color: true,
                },
            },
        },
    });

    if (!server) {
        return null;
    }

    // Decrypt credentials
    const encrypted = {
        host: server.host,
        username: server.username,
        password: server.password || undefined,
        privateKey: server.privateKey || undefined,
        passphrase: server.passphrase || undefined,
        notes: server.notes || undefined,
    };

    const credentials = decryptCredentials(encrypted, server.userId);

    return {
        ...server,
        host: credentials.host,
        username: credentials.username,
        password: credentials.password,
        privateKey: credentials.privateKey,
        passphrase: credentials.passphrase,
        notes: credentials.notes,
        hostKey: pinOf(server),
        jump: await loadJump(server.jumpServerId, server.userId),
    };
}

export async function getServerForConnection(
    serverId: string,
    userId: string,
): Promise<
    | (ServerCredentials & {
          id: string;
          name: string;
          port: number;
          protocol: Protocol;
          displayWidth: number | null;
          displayHeight: number | null;
          colorDepth: number | null;
          rdpSecurity: string | null;
          hostKey: HostKeyPin;
          certificate: string | null;
          /** The owner's id: agent forwarding only applies when the owner connects. */
          ownerId: string;
          agentForwarding: string;
          agentKeychainIds: string[];
          jump: JumpConfig | null;
      })
    | null
> {
    // Try as owner first
    let server = await prisma.server.findFirst({
        where: { id: serverId, userId },
    });

    // Fall back to shared access: fetch the server as its owner
    if (!server) {
        const share = await prisma.serverShare.findFirst({
            where: { serverId, sharedWithId: userId },
        });
        if (share) {
            server = await prisma.server.findFirst({
                where: { id: serverId, userId: share.ownerId },
            });
        }
    }

    if (!server) {
        return null;
    }

    // Update last used
    await prisma.server.update({
        where: { id: serverId },
        data: {
            lastUsedAt: new Date(),
            useCount: { increment: 1 },
        },
    });

    // Decrypt credentials
    const encrypted = {
        host: server.host,
        username: server.username,
        password: server.password || undefined,
        privateKey: server.privateKey || undefined,
        passphrase: server.passphrase || undefined,
        notes: undefined,
    };

    const credentials = decryptCredentials(encrypted, server.userId);

    return {
        id: server.id,
        name: server.name,
        port: server.port,
        protocol: server.protocol,
        displayWidth: server.displayWidth,
        displayHeight: server.displayHeight,
        colorDepth: server.colorDepth,
        rdpSecurity: server.rdpSecurity ?? null,
        ...credentials,
        hostKey: pinOf(server),
        certificate: server.certificate,
        ownerId: server.userId,
        agentForwarding: server.agentForwarding,
        agentKeychainIds: server.agentKeychainIds,
        // The jump host always belongs to the server's owner — for a shared
        // server too, so a recipient never needs the bastion shared with them.
        jump: await loadJump(server.jumpServerId, server.userId),
    };
}

// UPDATE

export async function updateServer(serverId: string, userId: string, input: UpdateServerInput) {
    // Verify ownership
    const existing = await prisma.server.findFirst({
        where: { id: serverId, userId },
    });

    if (!existing) {
        return null;
    }

    // Verify the new group belongs to this user (if group is being changed)
    if (input.groupId) {
        const group = await prisma.serverGroup.findFirst({ where: { id: input.groupId, userId } });
        if (!group) throw new Error('Group not found or access denied');
    }

    // Re-check the jump whenever the jump or the protocol changes.
    const finalJump = input.jumpServerId !== undefined ? input.jumpServerId : existing.jumpServerId;
    if (finalJump && (input.jumpServerId !== undefined || input.protocol !== undefined)) {
        await assertValidJumpHost(userId, finalJump, input.protocol ?? existing.protocol, serverId);
    }

    // Build update data
    const updateData: Record<string, unknown> = {};

    // Non-encrypted fields
    if (input.name !== undefined) updateData.name = input.name;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.groupId !== undefined) updateData.groupId = input.groupId;
    if (input.port !== undefined) {
        updateData.port = input.port;
        if (input.port !== existing.port) {
            updateData.hostKeyFingerprint = null;
            updateData.hostKeyType = null;
            updateData.hostKeyTrustedAt = null;
        }
    }
    if (input.protocol !== undefined) updateData.protocol = input.protocol;
    if (input.tags !== undefined) updateData.tags = input.tags;
    if (input.displayWidth !== undefined) updateData.displayWidth = input.displayWidth;
    if (input.displayHeight !== undefined) updateData.displayHeight = input.displayHeight;
    if (input.colorDepth !== undefined) updateData.colorDepth = input.colorDepth;
    if (input.rdpSecurity !== undefined) updateData.rdpSecurity = input.rdpSecurity;
    if (input.isFavorite !== undefined) updateData.isFavorite = input.isFavorite;
    if (input.jumpServerId !== undefined) updateData.jumpServerId = input.jumpServerId;
    if (input.certificate !== undefined) updateData.certificate = input.certificate || null;
    if (input.agentForwarding !== undefined) updateData.agentForwarding = input.agentForwarding;
    if (input.agentKeychainIds !== undefined) {
        await assertAgentKeys(userId, input.agentKeychainIds);
        updateData.agentKeychainIds = input.agentKeychainIds;
    }

    // Encrypted fields - need to re-encrypt if changed
    const needsEncryption =
        input.host ||
        input.username ||
        input.password ||
        input.privateKey ||
        input.passphrase ||
        input.notes;

    if (needsEncryption) {
        // Get current decrypted values
        const currentEncrypted = {
            host: existing.host,
            username: existing.username,
            password: existing.password || undefined,
            privateKey: existing.privateKey || undefined,
            passphrase: existing.passphrase || undefined,
            notes: existing.notes || undefined,
        };

        const current = decryptCredentials(currentEncrypted, existing.userId);

        // Merge with new values
        const newCredentials: ServerCredentials = {
            host: input.host ?? current.host,
            username: input.username ?? current.username,
            password: input.password ?? current.password,
            privateKey: input.privateKey ?? current.privateKey,
            passphrase: input.passphrase ?? current.passphrase,
            notes: input.notes ?? current.notes,
        };

        // Re-encrypt
        const encrypted = encryptCredentials(newCredentials, existing.userId);

        // A different host is a different machine: pin its key afresh.
        if (newCredentials.host !== current.host) {
            updateData.hostKeyFingerprint = null;
            updateData.hostKeyType = null;
            updateData.hostKeyTrustedAt = null;
        }

        updateData.host = encrypted.host;
        updateData.username = encrypted.username;
        updateData.password = encrypted.password;
        updateData.privateKey = encrypted.privateKey;
        updateData.passphrase = encrypted.passphrase;
        updateData.notes = encrypted.notes;
    }

    const updated = await prisma.server.update({
        where: { id: serverId },
        data: updateData,
        select: {
            id: true,
            name: true,
            protocol: true,
        },
    });

    // Audit log
    await prisma.auditLog.create({
        data: {
            userId,
            action: 'SERVER_UPDATED',
            resource: `server:${serverId}`,
        },
    });

    return updated;
}

// DELETE

export async function deleteServer(serverId: string, userId: string) {
    // Verify ownership
    const existing = await prisma.server.findFirst({
        where: { id: serverId, userId },
        select: { id: true, name: true },
    });

    if (!existing) {
        return false;
    }

    // Refuse to delete a bastion that is still in use: its targets would
    // otherwise be left pointing at hosts this server must never dial directly.
    const dependants = await prisma.server.findMany({
        where: { jumpServerId: serverId },
        select: { name: true },
        take: 3,
    });
    if (dependants.length > 0) {
        const names = dependants.map((d) => d.name).join(', ');
        throw new JumpHostError(
            `Other servers connect through ${existing.name} (${names}). Change their jump host first.`,
        );
    }

    await prisma.server.delete({
        where: { id: serverId },
    });

    // Audit log
    await prisma.auditLog.create({
        data: {
            userId,
            action: 'SERVER_DELETED',
            resource: `server:${serverId}`,
            details: { name: existing.name },
        },
    });

    return true;
}

// SEARCH

export async function searchServers(
    userId: string,
    query: string,
    protocol?: Protocol,
    groupId?: string,
    favoritesOnly?: boolean,
): Promise<ServerListItem[]> {
    const rows = await prisma.server.findMany({
        where: {
            userId,
            AND: [
                query
                    ? {
                          OR: [
                              { name: { contains: query, mode: 'insensitive' } },
                              { description: { contains: query, mode: 'insensitive' } },
                              { tags: { has: query } },
                          ],
                      }
                    : {},
                protocol ? { protocol } : {},
                groupId ? { groupId } : {},
                favoritesOnly ? { isFavorite: true } : {},
            ],
        },
        select: {
            id: true,
            name: true,
            description: true,
            protocol: true,
            tags: true,
            isFavorite: true,
            lastUsedAt: true,
            password: true,
            host: true,
            username: true,
            port: true,
            jumpServerId: true,
            group: {
                select: {
                    id: true,
                    name: true,
                    color: true,
                },
            },
        },
        orderBy: [{ isFavorite: 'desc' }, { lastUsedAt: 'desc' }, { name: 'asc' }],
    });
    return rows.map(({ password, host, username, ...rest }) => {
        const creds = decryptCredentials({ host, username }, userId);
        return { ...rest, hasPassword: !!password, host: creds.host, username: creds.username };
    });
}

// TOGGLE FAVORITE

export async function toggleFavorite(serverId: string, userId: string) {
    const server = await prisma.server.findFirst({
        where: { id: serverId, userId },
        select: { isFavorite: true },
    });

    if (!server) {
        return null;
    }

    return prisma.server.update({
        where: { id: serverId },
        data: { isFavorite: !server.isFavorite },
        select: { id: true, isFavorite: true },
    });
}
