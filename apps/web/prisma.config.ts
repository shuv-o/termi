import 'dotenv/config';
import { defineConfig } from 'prisma/config';

function getDatabaseUrl(): string {
    const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, DB_SCHEMA, DATABASE_URL } =
        process.env;
    if (DB_HOST && DB_USER && DB_PASSWORD && DB_NAME) {
        const schema = DB_SCHEMA ?? 'public';
        const port = DB_PORT ?? '5432';
        return `postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${port}/${DB_NAME}?schema=${schema}`;
    }
    if (DATABASE_URL) return DATABASE_URL;
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
