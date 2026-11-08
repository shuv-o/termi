import { execFileSync } from 'child_process';
import { rmSync } from 'fs';
import { cleanupDocker, STATE_FILE } from './global-setup';
import { DB } from './env';

export default async function globalTeardown() {
    cleanupDocker();
    rmSync(STATE_FILE, { force: true });
    if (!process.env.SEC_E2E_KEEP_DB) {
        try {
            execFileSync('dropdb', ['--if-exists', '--force', DB.name], {
                env: {
                    ...process.env,
                    PGHOST: DB.host,
                    PGPORT: DB.port,
                    PGUSER: DB.user,
                    PGPASSWORD: DB.password,
                },
            });
        } catch {
            /* best effort */
        }
    }
}
