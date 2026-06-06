import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
    prisma: {
        user: {
            findUnique: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
        },
        auditLog: { create: vi.fn() },
        passkey: { count: vi.fn() },
        session: { updateMany: vi.fn() },
        server: { deleteMany: vi.fn() },
        $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
            fn({
                user: { update: vi.fn() },
                server: { deleteMany: vi.fn() },
                session: { updateMany: vi.fn() },
                auditLog: { create: vi.fn() },
            }),
        ),
    },
}));

vi.mock('@/lib/crypto', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/lib/crypto')>();
    return {
        ...actual,
        hashPassword: vi.fn().mockResolvedValue('hashed-password'),
        generateSalt: vi.fn().mockReturnValue(Buffer.alloc(32, 1)),
        deriveMasterKey: vi.fn().mockReturnValue(Buffer.alloc(32, 2)),
        hashDerivedKey: vi.fn().mockReturnValue('hashed-derived-key'),
        generateSecureToken: vi.fn().mockReturnValue('test-token'),
        hashToken: vi.fn().mockReturnValue('hashed-token'),
    };
});

vi.mock('./session', () => ({
    getSession: vi.fn().mockResolvedValue({
        save: vi.fn(),
        isLoggedIn: false,
    }),
    createSession: vi.fn().mockResolvedValue('session-token'),
    validateSession: vi.fn().mockResolvedValue({ userId: 'user-1' }),
}));

vi.mock('./email-otp', () => ({
    sendEmailOTP: vi.fn(),
    verifyEmailOTP: vi.fn(),
}));

import { registerUser } from './auth';
import { prisma } from '@/lib/db';

describe('registerUser', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
        (prisma.user.create as ReturnType<typeof vi.fn>).mockResolvedValue({
            id: 'user-1',
            email: 'test@example.com',
        });
        (prisma.auditLog.create as ReturnType<typeof vi.fn>).mockResolvedValue({});
    });

    it('always creates user with masterKeyHash and masterKeySalt derived from password', async () => {
        const result = await registerUser({ email: 'test@example.com', password: 'Password1' });

        expect(result.success).toBe(true);
        const createCall = (prisma.user.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(createCall.data.masterKeyHash).toBe('hashed-derived-key');
        expect(createCall.data.masterKeySalt).toBeDefined();
        expect(createCall.data.passwordHash).toBe('hashed-password');
    });

    it('normalizes email to lowercase', async () => {
        await registerUser({ email: 'TEST@Example.com', password: 'Password1' });
        const createCall = (prisma.user.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(createCall.data.email).toBe('test@example.com');
    });

    it('returns error if email already exists', async () => {
        (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'existing' });
        const result = await registerUser({ email: 'test@example.com', password: 'Password1' });
        expect(result.success).toBe(false);
        expect(result.error).toBe('Email already registered');
    });
});
