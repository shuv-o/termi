/**
 * Termi Database Client
 *
 * Singleton Prisma client instance with proper configuration
 * for both development and production environments.
 */

import { PrismaClient } from '@/app/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

// STARTUP VALIDATION

/**
 * Build a PostgreSQL connection URL from split env vars.
 * Falls back to DATABASE_URL for backwards compatibility.
 */
function getDatabaseUrl(): string {
    const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, DB_SCHEMA, DATABASE_URL } =
        process.env;
    if (DB_HOST && DB_USER && DB_PASSWORD && DB_NAME) {
        const schema = DB_SCHEMA ?? 'public';
        const port = DB_PORT ?? '5432';
        return `postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${port}/${DB_NAME}?schema=${schema}`;
    }
    if (DATABASE_URL) return DATABASE_URL;
    // During `next build` no DB connection is needed — return a placeholder so the
    // build succeeds without requiring runtime secrets as build-time args.
    if (process.env.NEXT_PHASE === 'phase-production-build') {
        return 'postgresql://build:build@localhost:5432/build';
    }
    throw new Error(
        'Database not configured. Set DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME or DATABASE_URL.',
    );
}

// CLIENT SINGLETON (lazy – initialised on first access, not at import time)

// Prevent multiple Prisma Client instances in development
const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined;
    pool: Pool | undefined;
};

function getPrisma(): PrismaClient {
    if (globalForPrisma.prisma) return globalForPrisma.prisma;

    const pool = globalForPrisma.pool ?? new Pool({ connectionString: getDatabaseUrl() });
    globalForPrisma.pool = pool;

    const adapter = new PrismaPg(pool);

    const client = new PrismaClient({
        adapter,
        log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    });

    globalForPrisma.prisma = client;

    return client;
}

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
    get(_target, prop) {
        return (getPrisma() as unknown as Record<string | symbol, unknown>)[prop];
    },
});

export default prisma;
