/**
 * Termi Database Client
 *
 * Singleton Prisma client instance with proper configuration
 * for both development and production environments.
 */

import { PrismaClient } from '@/app/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

// ============================================================================
// STARTUP VALIDATION
// ============================================================================

/**
 * Assert that DATABASE_URL includes SSL parameters in production.
 * Exported for unit-testing. Called automatically at module load time.
 *
 * @param url - The DATABASE_URL string to check (defaults to process.env.DATABASE_URL)
 * @throws Error in production when SSL is not configured
 */
export function assertDatabaseSslInProduction(url?: string): void {
    if (process.env.NODE_ENV !== 'production') return;
    const dbUrl = url ?? process.env.DATABASE_URL ?? '';
    const hasSsl =
        dbUrl.includes('sslmode=require') ||
        dbUrl.includes('sslmode=verify-full') ||
        dbUrl.includes('sslmode=verify-ca') ||
        dbUrl.includes('ssl=true');
    if (!hasSsl) {
        throw new Error(
            'DATABASE_URL must include SSL parameters for production deployments. ' +
            'Append ?sslmode=require to your connection string. ' +
            'Example: postgresql://user:pass@host:5432/termi?sslmode=require'
        );
    }
}

// Run at module load — fails fast before any query is made
assertDatabaseSslInProduction();

// ============================================================================
// CLIENT SINGLETON
// ============================================================================

// Prevent multiple Prisma Client instances in development
const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined;
    pool: Pool | undefined;
};

// Create PostgreSQL connection pool
const pool = globalForPrisma.pool ?? new Pool({
    connectionString: process.env.DATABASE_URL,
});

if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.pool = pool;
}

// Create Prisma adapter
const adapter = new PrismaPg(pool);

export const prisma =
    globalForPrisma.prisma ??
    new PrismaClient({
        adapter,
        log: process.env.NODE_ENV === 'development'
            ? ['query', 'error', 'warn']
            : ['error'],
    });

if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = prisma;
}

export default prisma;
