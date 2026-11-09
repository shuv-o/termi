/**
 * Teams: a group of users sharing a vault of servers.
 *
 * A server in a team stays owned by whoever added it — its credentials remain
 * sealed to that owner (see lib/crypto/credentials.ts), exactly like a server
 * shared with one person. Members can open it (terminal, files through the
 * gateway, tunnels); only the owner can edit it, see its secrets or forward
 * keys to it.
 *
 * Roles:
 *   OWNER   everything, incl. roles and deleting the team (there is always one)
 *   ADMIN   invite members/admins, remove members, remove any server
 *   MEMBER  connect, add servers they own, remove their own servers, leave
 */

import { createHash, randomBytes } from 'crypto';
import { prisma } from '@/lib/db';
import type { TeamRole } from '@/app/generated/prisma/client';
import { decryptCredentials, openField } from '@/lib/crypto';
import { sendEmail } from '@/lib/auth/email-otp';

export class TeamError extends Error {
    constructor(
        message: string,
        readonly status = 400,
    ) {
        super(message);
    }
}

const RANK: Record<TeamRole, number> = { MEMBER: 1, ADMIN: 2, OWNER: 3 };
export const MAX_TEAMS_PER_USER = 20;
export const MAX_TEAM_MEMBERS = 200;
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

async function audit(
    userId: string,
    action:
        | 'TEAM_CREATED'
        | 'TEAM_DELETED'
        | 'TEAM_MEMBER_INVITED'
        | 'TEAM_MEMBER_JOINED'
        | 'TEAM_MEMBER_REMOVED'
        | 'TEAM_ROLE_CHANGED'
        | 'TEAM_SERVER_ADDED'
        | 'TEAM_SERVER_REMOVED',
    teamId: string,
    details?: Record<string, string>,
) {
    await prisma.auditLog.create({
        data: { userId, action, resource: `team:${teamId}`, details },
    });
}

/** The caller's role, or a 404 when they aren't a member (the team stays hidden). */
async function roleIn(teamId: string, userId: string): Promise<TeamRole> {
    const m = await prisma.teamMember.findUnique({
        where: { teamId_userId: { teamId, userId } },
        select: { role: true },
    });
    if (!m) throw new TeamError('Team not found', 404);
    return m.role;
}

async function requireRole(teamId: string, userId: string, min: TeamRole): Promise<TeamRole> {
    const role = await roleIn(teamId, userId);
    if (RANK[role] < RANK[min]) throw new TeamError('You do not have permission to do that', 403);
    return role;
}

export async function createTeam(userId: string, name: string) {
    const count = await prisma.teamMember.count({ where: { userId } });
    if (count >= MAX_TEAMS_PER_USER) {
        throw new TeamError(`You can be in up to ${MAX_TEAMS_PER_USER} teams`);
    }
    const team = await prisma.team.create({
        data: { name, members: { create: { userId, role: 'OWNER' } } },
    });
    await audit(userId, 'TEAM_CREATED', team.id, { name });
    return team;
}

export async function listTeams(userId: string) {
    const memberships = await prisma.teamMember.findMany({
        where: { userId },
        include: {
            team: { include: { _count: { select: { members: true, servers: true } } } },
        },
        orderBy: { createdAt: 'asc' },
    });
    return memberships.map((m) => ({
        id: m.team.id,
        name: m.team.name,
        role: m.role,
        memberCount: m.team._count.members,
        serverCount: m.team._count.servers,
    }));
}

export async function getTeam(teamId: string, userId: string) {
    const role = await roleIn(teamId, userId);
    const team = await prisma.team.findUniqueOrThrow({
        where: { id: teamId },
        include: {
            members: {
                include: { user: { select: { id: true, email: true, name: true } } },
                orderBy: { createdAt: 'asc' },
            },
            servers: {
                include: {
                    server: {
                        select: {
                            id: true,
                            name: true,
                            protocol: true,
                            host: true,
                            port: true,
                            userId: true,
                            user: { select: { email: true } },
                        },
                    },
                },
                orderBy: { createdAt: 'asc' },
            },
            invitations: {
                where: { status: 'PENDING', expiresAt: { gt: new Date() } },
                select: { id: true, email: true, role: true, expiresAt: true },
            },
        },
    });
    return {
        id: team.id,
        name: team.name,
        role,
        members: team.members.map((m) => ({
            userId: m.user.id,
            email: m.user.email,
            name: m.user.name,
            role: m.role,
            you: m.user.id === userId,
        })),
        servers: team.servers.map(({ server }) => ({
            id: server.id,
            name: server.name,
            protocol: server.protocol,
            host: openField(server.host, 'Server', 'host', server.userId),
            port: server.port,
            ownerEmail: server.user.email,
            yours: server.userId === userId,
        })),
        // Only those who can invite see who's been invited.
        invitations: RANK[role] >= RANK.ADMIN ? team.invitations : [],
    };
}

export async function renameTeam(teamId: string, userId: string, name: string) {
    await requireRole(teamId, userId, 'ADMIN');
    await prisma.team.update({ where: { id: teamId }, data: { name } });
}

export async function deleteTeam(teamId: string, userId: string) {
    await requireRole(teamId, userId, 'OWNER');
    await prisma.team.delete({ where: { id: teamId } });
    await audit(userId, 'TEAM_DELETED', teamId);
}

export async function inviteToTeam(
    teamId: string,
    userId: string,
    email: string,
    role: TeamRole,
): Promise<{ inviteUrl: string }> {
    const myRole = await requireRole(teamId, userId, 'ADMIN');
    if (role === 'OWNER' || RANK[role] > RANK[myRole]) {
        throw new TeamError('You can invite members or admins only', 403);
    }
    const normalized = email.trim().toLowerCase();
    const [team, inviter, members] = await Promise.all([
        prisma.team.findUniqueOrThrow({ where: { id: teamId }, select: { name: true } }),
        prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } }),
        prisma.teamMember.findMany({
            where: { teamId },
            select: { user: { select: { email: true } } },
        }),
    ]);
    if (members.length >= MAX_TEAM_MEMBERS) {
        throw new TeamError(`A team can have up to ${MAX_TEAM_MEMBERS} members`);
    }
    if (members.some((m) => m.user.email.toLowerCase() === normalized)) {
        throw new TeamError('That person is already in the team');
    }

    await prisma.teamInvitation.updateMany({
        where: { teamId, email: normalized, status: 'PENDING' },
        data: { status: 'REVOKED' },
    });
    const token = randomBytes(32).toString('hex');
    await prisma.teamInvitation.create({
        data: {
            teamId,
            email: normalized,
            role,
            tokenHash: hashToken(token),
            invitedById: userId,
            expiresAt: new Date(Date.now() + INVITE_TTL_MS),
        },
    });
    await audit(userId, 'TEAM_MEMBER_INVITED', teamId, { email: normalized, role });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://termi.run';
    const inviteUrl = `${appUrl}/teams/join/${token}`;
    await sendEmail(
        normalized,
        `${inviter.email} invited you to the team "${team.name}" on Termi`,
        `<p><strong>${escapeHtml(inviter.email)}</strong> invited you to join the team
<strong>${escapeHtml(team.name)}</strong> on Termi as ${role === 'ADMIN' ? 'an admin' : 'a member'}.
Members can connect to the servers in the team's vault.</p>
<p><a href="${inviteUrl}">Join the team</a> — the link expires in 7 days.</p>
<p>If you weren't expecting this, you can ignore this email.</p>`,
    ).catch((err) => console.error('[teams] invitation email failed:', err));
    if (!process.env.SMTP_HOST) console.log('[teams] Invitation URL:', inviteUrl);
    return { inviteUrl };
}

/** What an invitation link is for, shown before joining. */
export async function describeInvitation(token: string) {
    const inv = await prisma.teamInvitation.findUnique({
        where: { tokenHash: hashToken(token) },
        include: { team: { select: { name: true } } },
    });
    if (!inv || inv.status !== 'PENDING' || inv.expiresAt < new Date()) return null;
    return { teamName: inv.team.name, role: inv.role, email: inv.email };
}

export async function acceptInvitation(token: string, userId: string) {
    const inv = await prisma.teamInvitation.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!inv || inv.status !== 'PENDING' || inv.expiresAt < new Date()) {
        throw new TeamError('This invitation has expired or was already used', 404);
    }
    const user = await prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { email: true },
    });
    if (user.email.toLowerCase() !== inv.email) {
        throw new TeamError('This invitation was sent to a different email address', 403);
    }
    await prisma.$transaction([
        prisma.teamMember.upsert({
            where: { teamId_userId: { teamId: inv.teamId, userId } },
            create: { teamId: inv.teamId, userId, role: inv.role },
            update: {},
        }),
        prisma.teamInvitation.update({ where: { id: inv.id }, data: { status: 'ACCEPTED' } }),
    ]);
    await audit(userId, 'TEAM_MEMBER_JOINED', inv.teamId);
    return { teamId: inv.teamId };
}

export async function revokeInvitation(teamId: string, userId: string, invitationId: string) {
    await requireRole(teamId, userId, 'ADMIN');
    await prisma.teamInvitation.updateMany({
        where: { id: invitationId, teamId, status: 'PENDING' },
        data: { status: 'REVOKED' },
    });
}

async function ownerCount(teamId: string) {
    return prisma.teamMember.count({ where: { teamId, role: 'OWNER' } });
}

/** Remove a member, or leave (memberId = yourself). */
export async function removeMember(teamId: string, userId: string, memberId: string) {
    const myRole = await roleIn(teamId, userId);
    const target = await prisma.teamMember.findUnique({
        where: { teamId_userId: { teamId, userId: memberId } },
    });
    if (!target) throw new TeamError('Member not found', 404);
    // Anyone may leave; an owner may remove anyone; an admin, members only.
    const allowed =
        memberId === userId ||
        myRole === 'OWNER' ||
        (myRole === 'ADMIN' && target.role === 'MEMBER');
    if (!allowed) throw new TeamError('You do not have permission to remove this member', 403);
    if (target.role === 'OWNER' && (await ownerCount(teamId)) === 1) {
        throw new TeamError(
            'The last owner cannot leave; make someone else an owner, or delete the team',
        );
    }
    await prisma.$transaction([
        prisma.teamMember.delete({ where: { id: target.id } }),
        // Their servers leave the vault with them.
        prisma.teamServer.deleteMany({ where: { teamId, server: { userId: memberId } } }),
    ]);
    await audit(userId, 'TEAM_MEMBER_REMOVED', teamId, { memberId });
}

export async function changeRole(teamId: string, userId: string, memberId: string, role: TeamRole) {
    await requireRole(teamId, userId, 'OWNER');
    const target = await prisma.teamMember.findUnique({
        where: { teamId_userId: { teamId, userId: memberId } },
    });
    if (!target) throw new TeamError('Member not found', 404);
    if (target.role === 'OWNER' && role !== 'OWNER' && (await ownerCount(teamId)) === 1) {
        throw new TeamError('A team needs at least one owner');
    }
    await prisma.teamMember.update({ where: { id: target.id }, data: { role } });
    await audit(userId, 'TEAM_ROLE_CHANGED', teamId, { memberId, role });
}

export async function addServerToTeam(teamId: string, userId: string, serverId: string) {
    await roleIn(teamId, userId);
    const server = await prisma.server.findFirst({
        where: { id: serverId, userId },
        select: { id: true },
    });
    if (!server) throw new TeamError('You can only add servers you own', 403);
    await prisma.teamServer.upsert({
        where: { teamId_serverId: { teamId, serverId } },
        create: { teamId, serverId, addedById: userId },
        update: {},
    });
    await audit(userId, 'TEAM_SERVER_ADDED', teamId, { serverId });
}

export async function removeServerFromTeam(teamId: string, userId: string, serverId: string) {
    const role = await roleIn(teamId, userId);
    const link = await prisma.teamServer.findUnique({
        where: { teamId_serverId: { teamId, serverId } },
        include: { server: { select: { userId: true } } },
    });
    if (!link) throw new TeamError('Server not found in this team', 404);
    if (link.server.userId !== userId && RANK[role] < RANK.ADMIN) {
        throw new TeamError('Only the server owner or a team admin can remove it', 403);
    }
    await prisma.teamServer.delete({ where: { id: link.id } });
    await audit(userId, 'TEAM_SERVER_REMOVED', teamId, { serverId });
}

/**
 * The owner of `serverId` when `userId` may connect to it through a team, or
 * null. (Owning or a direct share are checked by the caller first.)
 */
export async function teamServerOwner(serverId: string, userId: string): Promise<string | null> {
    const link = await prisma.teamServer.findFirst({
        where: { serverId, team: { members: { some: { userId } } } },
        select: { server: { select: { userId: true } } },
    });
    return link?.server.userId ?? null;
}

/** Servers reachable through the user's teams (not their own), for listings. */
export async function teamServersFor(userId: string) {
    const links = await prisma.teamServer.findMany({
        where: { team: { members: { some: { userId } } }, server: { userId: { not: userId } } },
        include: {
            team: { select: { name: true } },
            server: {
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
                    userId: true,
                    group: { select: { id: true, name: true, color: true } },
                },
            },
        },
    });
    const seen = new Set<string>();
    return links
        .filter((l) => !seen.has(l.server.id) && seen.add(l.server.id))
        .map(({ server, team }) => {
            const { password, host, username, userId: ownerId, ...rest } = server;
            const creds = decryptCredentials({ host, username }, ownerId);
            return {
                ...rest,
                host: creds.host,
                username: creds.username,
                hasPassword: !!password,
                sharedBy: `${team.name} (team)`,
                permissions: 'connect',
                teamName: team.name,
            };
        });
}
