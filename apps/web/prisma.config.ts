import 'dotenv/config';
import { defineConfig } from 'prisma/config';

function getDatabaseUrl(): string {
    const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, DB_SCHEMA, DATABASE_URL } =
        process.env;
    if (DB_HOST && DB_USER && DB_PASSWORD && DB_NAME) {
        const schema = DB_SCHEMA ?? 'public';
        const port = DB_PORT ?? '5432';
        // DB_SSLMODE (e.g. require, verify-full) turns on TLS to the database —
        // use it whenever Postgres isn't on the same host or a private network.
        const ssl = process.env.DB_SSLMODE
            ? `&sslmode=${encodeURIComponent(process.env.DB_SSLMODE)}`
            : '';
        return `postgresql://${encodeURIComponent(DB_USER)}:${encodeURIComponent(DB_PASSWORD)}@${DB_HOST}:${port}/${DB_NAME}?schema=${schema}${ssl}`;
    }
    if (DATABASE_URL) return DATABASE_URL;

    // Offline commands (`prisma generate`, `format`, `validate`) never open a
    // connection, so they must not require DB credentials — otherwise CI, which
    // generates the client without a database, fails at config load. Hand them a
    // syntactically valid placeholder; commands that actually connect still error.
    const offlineCommand = process.argv.some((arg) =>
        ['generate', 'format', 'validate'].includes(arg),
    );
    if (offlineCommand) {
        return 'postgresql://user:password@localhost:5432/placeholder?schema=public';
    }

    throw new Error(
        'Database not configured. Set DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME or DATABASE_URL.',
    );
}

export default defineConfig({
    schema: 'prisma/schema.prisma',
    migrations: {
        path: 'prisma/migrations',
    },
    datasource: {
        url: getDatabaseUrl(),
    },
});
