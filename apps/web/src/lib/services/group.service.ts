/**
 * Server Group Management Service
 */

import { prisma } from '@/lib/db';
import { decryptCredentials } from '@/lib/crypto';

export interface CreateGroupInput {
    userId: string;
    name: string;
    description?: string;
    color?: string;
    icon?: string;
}

export interface UpdateGroupInput {
    name?: string;
    description?: string;
    color?: string;
    icon?: string;
    sortOrder?: number;
}

export async function createServerGroup(input: CreateGroupInput) {
    const { userId, name, description, color, icon } = input;

    const existing = await prisma.serverGroup.findFirst({
        where: { userId, name },
    });

    if (existing) {
        throw new Error('A group with this name already exists');
    }

    const maxOrder = await prisma.serverGroup.aggregate({
        where: { userId },
        _max: { sortOrder: true },
    });

    const group = await prisma.serverGroup.create({
        data: {
            userId,
            name,
            description,
            color,
            icon,
            sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
        },
    });

    await prisma.auditLog.create({
        data: {
            userId,
            action: 'GROUP_CREATED',
            resource: `group:${group.id}`,
            details: { name },
        },
    });

    return group;
}

export async function getServerGroups(userId: string) {
    return prisma.serverGroup.findMany({
        where: { userId },
        include: {
            _count: {
                select: { servers: true },
            },
        },
        orderBy: { sortOrder: 'asc' },
    });
}

export async function getServerGroupById(groupId: string, userId: string) {
    const group = await prisma.serverGroup.findFirst({
        where: { id: groupId, userId },
        include: {
            servers: {
                select: {
                    id: true,
                    name: true,
                    protocol: true,
                    isFavorite: true,
                    lastUsedAt: true,
                    host: true,
                    username: true,
                    port: true,
                    userId: true,
                },
                orderBy: { name: 'asc' },
            },
        },
    });

    if (!group) return group;

    // `host`/`username` are AES-256-GCM encrypted at rest — decrypt for display.
    return {
        ...group,
        servers: group.servers.map(({ host, username, userId: ownerId, ...rest }) => {
            const creds = decryptCredentials({ host, username }, ownerId);
            return { ...rest, host: creds.host, username: creds.username };
        }),
    };
}

export async function updateServerGroup(groupId: string, userId: string, input: UpdateGroupInput) {
    // Verify ownership
    const existing = await prisma.serverGroup.findFirst({
        where: { id: groupId, userId },
    });

    if (!existing) {
        return null;
    }

    // Check for duplicate name if changing
    if (input.name && input.name !== existing.name) {
        const duplicate = await prisma.serverGroup.findFirst({
            where: { userId, name: input.name },
        });

        if (duplicate) {
            throw new Error('A group with this name already exists');
        }
    }

    const updated = await prisma.serverGroup.update({
        where: { id: groupId },
        data: input,
    });

    await prisma.auditLog.create({
        data: {
            userId,
            action: 'GROUP_UPDATED',
            resource: `group:${groupId}`,
        },
    });

    return updated;
}

export async function deleteServerGroup(groupId: string, userId: string) {
    // Verify ownership
    const existing = await prisma.serverGroup.findFirst({
        where: { id: groupId, userId },
        select: { id: true, name: true },
    });

    if (!existing) {
        return false;
    }

    // Note: Deleting group will set server groupId to null (onDelete: SetNull)
    await prisma.serverGroup.delete({
        where: { id: groupId },
    });

    await prisma.auditLog.create({
        data: {
            userId,
            action: 'GROUP_DELETED',
            resource: `group:${groupId}`,
            details: { name: existing.name },
        },
    });

    return true;
}

export async function reorderGroups(userId: string, groupIds: string[]) {
    // Update sort order for each group
    await Promise.all(
        groupIds.map((id, index) =>
            prisma.serverGroup.updateMany({
                where: { id, userId },
                data: { sortOrder: index },
            }),
        ),
    );

    return true;
}
