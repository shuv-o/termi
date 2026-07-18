/**
 * Command Snippet Service
 *
 * User-defined one-tap commands for the terminal toolbar.
 *
 * Unlike keychain entries these are not encrypted: a snippet is a command the
 * user types into their own shell, not a secret. The UI warns against putting
 * passwords in one — a credential belongs on the server record, where it is
 * encrypted and can be revealed under step-up auth.
 */

import { prisma } from '@/lib/db';

export interface CreateSnippetInput {
    label: string;
    command: string;
    icon?: string;
    runImmediately?: boolean;
}

export type UpdateSnippetInput = Partial<CreateSnippetInput> & { sortOrder?: number };

export async function getSnippets(userId: string) {
    return prisma.commandSnippet.findMany({
        where: { userId },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
}

export async function createSnippet(userId: string, input: CreateSnippetInput) {
    // Append to the end of the user's existing list.
    const last = await prisma.commandSnippet.findFirst({
        where: { userId },
        orderBy: { sortOrder: 'desc' },
        select: { sortOrder: true },
    });

    return prisma.commandSnippet.create({
        data: {
            userId,
            label: input.label,
            command: input.command,
            icon: input.icon,
            runImmediately: input.runImmediately ?? false,
            sortOrder: (last?.sortOrder ?? -1) + 1,
        },
    });
}

/**
 * Update a snippet.
 *
 * Scoped by userId in the same query as the id, so a guessed id belonging to
 * another account matches nothing rather than updating it.
 */
export async function updateSnippet(id: string, userId: string, input: UpdateSnippetInput) {
    const result = await prisma.commandSnippet.updateMany({
        where: { id, userId },
        data: input,
    });

    if (result.count === 0) return null;

    return prisma.commandSnippet.findUnique({ where: { id } });
}

export async function deleteSnippet(id: string, userId: string): Promise<boolean> {
    const result = await prisma.commandSnippet.deleteMany({ where: { id, userId } });
    return result.count > 0;
}
