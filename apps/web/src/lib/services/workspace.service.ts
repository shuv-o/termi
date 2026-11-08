/**
 * Saved workspaces: a named list of terminal tabs plus how they are split.
 *
 * A workspace stores only server ids. Whether the user can still open each
 * server is decided when the list is read (servers get deleted, shares get
 * revoked), so a stale workspace degrades to "n servers unavailable" rather
 * than opening anything the user can no longer reach.
 */

import { z } from 'zod';
import { prisma } from '@/lib/db';
import { Prisma } from '@/app/generated/prisma/client';

export const MAX_WORKSPACES = 50;
export const MAX_WORKSPACE_TABS = 12;

const tabSchema = z.object({ serverId: z.string().min(1).max(64).nullable() });

const splitSchema = z
    .object({
        layout: z.enum(['columns', 'rows', 'grid']),
        panes: z
            .array(
                z
                    .number()
                    .int()
                    .min(0)
                    .max(MAX_WORKSPACE_TABS - 1),
            )
            .min(2)
            .max(4),
        x: z.number().min(0).max(1),
        y: z.number().min(0).max(1),
    })
    .nullable();

export const workspaceSchema = z
    .object({
        name: z.string().trim().min(1, 'Name the workspace').max(60),
        tabs: z
            .array(tabSchema)
            .min(1, 'A workspace needs at least one session')
            .max(MAX_WORKSPACE_TABS),
        split: splitSchema.default(null),
    })
    .refine(
        (w) =>
            !w.split ||
            (w.split.panes.every((i) => i < w.tabs.length) &&
                new Set(w.split.panes).size === w.split.panes.length),
        { message: 'The layout refers to a session that is not in the workspace', path: ['split'] },
    );

export type WorkspaceInput = z.infer<typeof workspaceSchema>;

/** The servers among `ids` the user owns or has been shared. */
async function accessibleServers(userId: string, ids: string[]) {
    if (ids.length === 0) return new Map<string, string>();
    const [owned, shared] = await Promise.all([
        prisma.server.findMany({
            where: { id: { in: ids }, userId },
            select: { id: true, name: true, protocol: true },
        }),
        prisma.serverShare.findMany({
            where: { serverId: { in: ids }, sharedWithId: userId },
            select: { server: { select: { id: true, name: true, protocol: true } } },
        }),
    ]);
    const viaTeams = await prisma.teamServer.findMany({
        where: { serverId: { in: ids }, team: { members: { some: { userId } } } },
        select: { server: { select: { id: true, name: true, protocol: true } } },
    });
    const map = new Map<string, string>();
    for (const s of [...owned, ...shared.map((x) => x.server), ...viaTeams.map((x) => x.server)]) {
        // Terminal workspaces hold SSH sessions only.
        if (s.protocol === 'SSH') map.set(s.id, s.name);
    }
    return map;
}

export class WorkspaceError extends Error {}

export async function saveWorkspace(userId: string, input: WorkspaceInput) {
    const serverIds = input.tabs.map((t) => t.serverId).filter((id): id is string => !!id);
    const allowed = await accessibleServers(userId, serverIds);
    const missing = serverIds.filter((id) => !allowed.has(id));
    if (missing.length) throw new WorkspaceError('Some of these servers are not available to you');

    const existing = await prisma.workspace.findUnique({
        where: { userId_name: { userId, name: input.name } },
        select: { id: true },
    });
    if (!existing && (await prisma.workspace.count({ where: { userId } })) >= MAX_WORKSPACES) {
        throw new WorkspaceError(`You can keep up to ${MAX_WORKSPACES} workspaces`);
    }

    const data = {
        tabs: input.tabs as Prisma.InputJsonValue,
        split: input.split ? (input.split as Prisma.InputJsonValue) : Prisma.DbNull,
    };
    return prisma.workspace.upsert({
        where: { userId_name: { userId, name: input.name } },
        create: { userId, name: input.name, ...data },
        update: data,
    });
}

/** The user's workspaces, with each tab resolved against current access. */
export async function listWorkspaces(userId: string) {
    const rows = await prisma.workspace.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
    });
    const ids = new Set<string>();
    for (const r of rows) {
        for (const t of tabsOf(r.tabs)) if (t.serverId) ids.add(t.serverId);
    }
    const allowed = await accessibleServers(userId, [...ids]);
    return rows.map((r) => {
        const split = splitSchema.safeParse(r.split ?? null);
        return {
            id: r.id,
            name: r.name,
            updatedAt: r.updatedAt,
            split: split.success ? split.data : null,
            tabs: tabsOf(r.tabs).map((t) => ({
                serverId: t.serverId,
                serverName: t.serverId ? (allowed.get(t.serverId) ?? null) : null,
                available: t.serverId === null || allowed.has(t.serverId),
            })),
        };
    });
}

function tabsOf(value: unknown): { serverId: string | null }[] {
    const parsed = z.array(tabSchema).safeParse(value);
    return parsed.success ? parsed.data : [];
}

export async function deleteWorkspace(userId: string, id: string): Promise<boolean> {
    const { count } = await prisma.workspace.deleteMany({ where: { id, userId } });
    return count > 0;
}
