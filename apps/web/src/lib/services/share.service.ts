/**
 * Server Sharing Service
 *
 * Manages server invitations and active shares between users.
 */

import { randomBytes } from 'crypto';
import nodemailer from 'nodemailer';
import { prisma } from '@/lib/db';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function createTransporter() {
    if (!process.env.SMTP_HOST) {
        return nodemailer.createTransport({ streamTransport: true, newline: 'unix' });
    }
    return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: process.env.SMTP_SECURE === 'true',
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
}

// ============================================================================
// INVITE
// ============================================================================

export async function sendShareInvitation(
    serverId: string,
    inviterId: string,
    inviteeEmail: string,
    permissions: 'manage' | 'connect' = 'connect'
): Promise<{ success: boolean; error?: string }> {
    // Verify inviter owns the server
    const server = await prisma.server.findFirst({
        where: { id: serverId, userId: inviterId },
        select: { id: true, name: true },
    });
    if (!server) return { success: false, error: 'Server not found' };

    const inviterUser = await prisma.user.findUnique({
        where: { id: inviterId },
        select: { email: true },
    });
    if (!inviterUser) return { success: false, error: 'Inviter not found' };

    // Can't invite yourself
    if (inviterUser.email.toLowerCase() === inviteeEmail.toLowerCase()) {
        return { success: false, error: 'You cannot invite yourself' };
    }

    // Check if already actively shared with this email
    const inviteeUser = await prisma.user.findFirst({
        where: { email: { equals: inviteeEmail, mode: 'insensitive' } },
        select: { id: true },
    });
    if (inviteeUser) {
        const existing = await prisma.serverShare.findFirst({
            where: { serverId, sharedWithId: inviteeUser.id },
        });
        if (existing) return { success: false, error: 'Server is already shared with this user' };
    }

    // Expire any existing pending invitation for this email+server
    await prisma.serverInvitation.updateMany({
        where: { serverId, inviteeEmail: inviteeEmail.toLowerCase(), status: 'PENDING' },
        data: { status: 'EXPIRED' },
    });

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

    await prisma.serverInvitation.create({
        data: {
            token,
            serverId,
            inviterId,
            inviteeEmail: inviteeEmail.toLowerCase(),
            permissions,
            expiresAt,
        },
    });

    await prisma.auditLog.create({
        data: {
            userId: inviterId,
            action: 'SERVER_INVITE_SENT',
            resource: `server:${serverId}`,
            details: { inviteeEmail, permissions },
        },
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://termi.dp.shuvoo.com';
    const inviteUrl = `${appUrl}/invitations/${token}`;
    const from = process.env.SMTP_FROM || '"Termi" <noreply@termi.app>';

    const transporter = createTransporter();
    await transporter.sendMail({
        from,
        to: inviteeEmail,
        subject: `${inviterUser.email} invited you to manage a server on Termi`,
        html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px;background:#0f1117;color:#e2e8f0;border-radius:12px">
          <h2 style="margin:0 0 8px;font-size:22px;color:#fff">Server Invitation</h2>
          <p style="margin:0 0 20px;color:#94a3b8">
            <strong style="color:#a78bfa">${inviterUser.email}</strong> has invited you to
            <strong>${permissions === 'manage' ? 'manage' : 'connect to'}</strong>
            the server <strong style="color:#fff">${server.name}</strong> on Termi.
          </p>
          <a href="${inviteUrl}" style="display:inline-block;background:#6366f1;color:white;padding:13px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px;margin:0 0 24px">
            Accept Invitation
          </a>
          <p style="color:#64748b;font-size:13px;margin:0">
            This invitation expires in 7 days. If you don't have a Termi account yet, you'll be asked to create one first.
          </p>
          <p style="color:#475569;font-size:12px;margin:16px 0 0">
            If you weren't expecting this invitation, you can safely ignore this email.
          </p>
        </div>
        `,
    });

    if (!process.env.SMTP_HOST) {
        console.log('[ShareService] Invitation URL:', inviteUrl);
    }

    return { success: true };
}

// ============================================================================
// LOOKUP
// ============================================================================

export async function getInvitationByToken(token: string) {
    return prisma.serverInvitation.findFirst({
        where: { token, status: 'PENDING', expiresAt: { gt: new Date() } },
        include: {
            server: { select: { id: true, name: true, protocol: true } },
            inviter: { select: { email: true } },
        },
    });
}

export async function getServerShares(serverId: string, ownerId: string) {
    // Verify ownership
    const server = await prisma.server.findFirst({
        where: { id: serverId, userId: ownerId },
        select: { id: true },
    });
    if (!server) return null;

    const [shares, pending] = await Promise.all([
        prisma.serverShare.findMany({
            where: { serverId, ownerId },
            include: { sharedWith: { select: { id: true, email: true } } },
            orderBy: { createdAt: 'desc' },
        }),
        prisma.serverInvitation.findMany({
            where: { serverId, inviterId: ownerId, status: 'PENDING', expiresAt: { gt: new Date() } },
            select: { id: true, inviteeEmail: true, permissions: true, expiresAt: true, createdAt: true },
            orderBy: { createdAt: 'desc' },
        }),
    ]);

    return { shares, pending };
}

// ============================================================================
// ACCEPT
// ============================================================================

export async function acceptInvitation(
    token: string,
    userId: string
): Promise<{ success: boolean; error?: string; serverId?: string }> {
    const invitation = await prisma.serverInvitation.findFirst({
        where: { token, status: 'PENDING', expiresAt: { gt: new Date() } },
        include: { inviter: { select: { email: true } } },
    });

    if (!invitation) return { success: false, error: 'Invitation not found or expired' };

    // Verify the accepting user's email matches
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true },
    });
    if (!user) return { success: false, error: 'User not found' };
    if (user.email.toLowerCase() !== invitation.inviteeEmail.toLowerCase()) {
        return { success: false, error: 'This invitation was sent to a different email address' };
    }

    // Idempotent — check if share already exists
    const existing = await prisma.serverShare.findFirst({
        where: { serverId: invitation.serverId, sharedWithId: userId },
    });

    if (!existing) {
        await prisma.serverShare.create({
            data: {
                serverId: invitation.serverId,
                ownerId: invitation.inviterId,
                sharedWithId: userId,
                permissions: invitation.permissions,
            },
        });
    }

    await prisma.serverInvitation.update({
        where: { id: invitation.id },
        data: { status: 'ACCEPTED' },
    });

    await prisma.auditLog.create({
        data: {
            userId,
            action: 'SERVER_INVITE_ACCEPTED',
            resource: `server:${invitation.serverId}`,
        },
    });

    return { success: true, serverId: invitation.serverId };
}

// ============================================================================
// REVOKE
// ============================================================================

export async function revokeShare(
    shareId: string,
    ownerId: string
): Promise<{ success: boolean; error?: string }> {
    const share = await prisma.serverShare.findFirst({
        where: { id: shareId, ownerId },
    });
    if (!share) return { success: false, error: 'Share not found' };

    await prisma.serverShare.delete({ where: { id: shareId } });

    await prisma.auditLog.create({
        data: {
            userId: ownerId,
            action: 'SERVER_SHARE_REVOKED',
            resource: `server:${share.serverId}`,
            details: { shareId },
        },
    });

    return { success: true };
}

// ============================================================================
// SHARED SERVERS (for dashboard display)
// ============================================================================

export async function getSharedServers(userId: string) {
    const { decryptCredentials } = await import('@/lib/crypto');

    const shares = await prisma.serverShare.findMany({
        where: { sharedWithId: userId },
        include: {
            server: {
                select: {
                    id: true, name: true, description: true, protocol: true,
                    tags: true, isFavorite: true, lastUsedAt: true, password: true,
                    host: true, username: true, port: true,
                    group: { select: { id: true, name: true, color: true } },
                },
            },
            owner: { select: { email: true } },
        },
        orderBy: { createdAt: 'desc' },
    });

    return shares.map(share => {
        const { password, host, username, ...rest } = share.server;
        const creds = decryptCredentials({ host, username });
        return {
            ...rest,
            host: creds.host,
            username: creds.username,
            hasPassword: !!password,
            sharedBy: share.owner.email,
            permissions: share.permissions,
            shareId: share.id,
        };
    });
}

export async function revokeInvitation(
    invitationId: string,
    inviterId: string
): Promise<{ success: boolean; error?: string }> {
    const invitation = await prisma.serverInvitation.findFirst({
        where: { id: invitationId, inviterId, status: 'PENDING' },
    });
    if (!invitation) return { success: false, error: 'Invitation not found' };

    await prisma.serverInvitation.update({
        where: { id: invitationId },
        data: { status: 'EXPIRED' },
    });

    return { success: true };
}
