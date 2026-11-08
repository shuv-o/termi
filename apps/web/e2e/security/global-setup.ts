import { execFileSync } from 'child_process';
import { join } from 'path';
import {
    DB,
    DOCKER_NET,
    GUACD_CONTAINER,
    GUACD_PORT,
    SSH_CONTAINER,
    SSH_PASSWORD,
    SSH_PORT,
    USERS,
    VNC_CONTAINER,
    VNC_PASSWORD,
    appEnv,
} from './env';

export const STATE_FILE = join(__dirname, '.state.json');
const WEB_DIR = join(__dirname, '..', '..');
const run = (cmd: string, args: string[], env: Record<string, string> = {}) =>
    execFileSync(cmd, args, { stdio: 'pipe', env: { ...process.env, ...env }, cwd: WEB_DIR })
        .toString()
        .trim();
const quiet = (cmd: string, args: string[]) => {
    try {
        run(cmd, args);
    } catch {
        /* already gone */
    }
};

export function cleanupDocker() {
    quiet('docker', ['rm', '-f', SSH_CONTAINER, VNC_CONTAINER, GUACD_CONTAINER]);
    quiet('docker', ['network', 'rm', DOCKER_NET]);
}

export default async function globalSetup() {
    cleanupDocker();

    // Fresh database, built from migrations (as a new install would be).
    const pgEnv = { PGHOST: DB.host, PGPORT: DB.port, PGUSER: DB.user, PGPASSWORD: DB.password };
    run('dropdb', ['--if-exists', '--force', DB.name], pgEnv);
    run('createdb', [DB.name], pgEnv);
    run('npx', ['prisma', 'migrate', 'deploy'], appEnv());

    // Containers: SSH host serving a hostile web app, VNC desktop, guacd.
    const fixtures = join(__dirname, 'fixtures');
    run('docker', ['network', 'create', DOCKER_NET]);
    run('docker', [
        'build',
        '-q',
        '--build-arg',
        `SSH_PASSWORD=${SSH_PASSWORD}`,
        '-t',
        SSH_CONTAINER,
        join(fixtures, 'ssh-app'),
    ]);
    run('docker', [
        'run',
        '-d',
        '--name',
        SSH_CONTAINER,
        '-p',
        `127.0.0.1:${SSH_PORT}:22`,
        SSH_CONTAINER,
    ]);
    run('docker', [
        'build',
        '-q',
        '--build-arg',
        `VNC_PASSWORD=${VNC_PASSWORD}`,
        '-t',
        VNC_CONTAINER,
        join(fixtures, 'vnc'),
    ]);
    run('docker', ['run', '-d', '--name', VNC_CONTAINER, '--network', DOCKER_NET, VNC_CONTAINER]);
    run('docker', [
        'run',
        '-d',
        '--name',
        GUACD_CONTAINER,
        '--network',
        DOCKER_NET,
        '-p',
        `127.0.0.1:${GUACD_PORT}:4822`,
        'guacamole/guacd:1.6.0',
    ]);
    const vncIp = run('docker', [
        'inspect',
        '-f',
        '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}',
        VNC_CONTAINER,
    ]);

    // Wait for sshd.
    for (let i = 0; i < 30; i++) {
        try {
            run('docker', [
                'exec',
                SSH_CONTAINER,
                'sh',
                '-c',
                'nc -z 127.0.0.1 22 || (ps | grep -q sshd)',
            ]);
            break;
        } catch {
            await new Promise((r) => setTimeout(r, 1000));
        }
    }

    run('npx', ['tsx', '--tsconfig', 'tsconfig.json', 'e2e/security/seed.ts'], {
        ...appEnv(),
        SEC_E2E_USERS: JSON.stringify(USERS),
        SEC_E2E_SSH_PASSWORD: SSH_PASSWORD,
        SEC_E2E_SSH_PORT: String(SSH_PORT),
        SEC_E2E_VNC_IP: vncIp,
        SEC_E2E_VNC_PASSWORD: VNC_PASSWORD,
        SEC_E2E_STATE: STATE_FILE,
    });
}
