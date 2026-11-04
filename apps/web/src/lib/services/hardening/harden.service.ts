/**
 * Phase 2 hardening: applies the safe fixes from the security scan with
 * lockout protection, and hands back the new credentials for Termi to store.
 *
 * Storage is injected through `HardenHooks`, so this module only speaks SSH —
 * which is what lets it be run end-to-end against a throwaway container.
 *
 * Order of operations, and what happens if each step fails:
 *   connect, precheck ......... nothing changed yet; just stop
 *   savePending ............... new creds encrypted at rest BEFORE use
 *   access script ............. rollback armed first; on failure → rollback now
 *   verify (fresh connection) . on failure → rollback now, old creds kept
 *   cancel rollback ........... from the NEW login; on failure → rollback now
 *   commit .................... only now does Termi switch credentials
 *   extras (fail2ban, updates)  cannot lock anyone out; failures are warnings
 */

import { randomBytes } from 'crypto';
import { Client, utils, type ConnectConfig } from 'ssh2';
import { connectSSH, type SSHJumpConfig } from '../ssh-jump';
import { SCAN_SCRIPT } from './scan-script';
import { parseScanOutput, evaluateScan } from './evaluate';
import {
    assertPublicKey,
    assertUsername,
    buildAccessScript,
    buildCancelScript,
    buildExtrasScript,
    buildRollbackNowScript,
    generatePassword,
    HardeningInputError,
} from './harden-scripts';

export interface HardenTarget {
    host: string;
    port: number;
    username: string;
    password?: string;
    privateKey?: string;
    passphrase?: string;
    jump?: SSHJumpConfig | null;
}

export interface HardenOptions {
    /** Create a dedicated sudo user and log in as it from now on. */
    createUser: boolean;
    /** Name for that user. */
    newUsername?: string;
    /** Turn off password logins (key-only SSH). */
    disablePasswordLogin: boolean;
    /** Give the login user a new random password. */
    rotatePassword: boolean;
    fail2ban: boolean;
    autoUpdates: boolean;
    /** The user's own public key, so they keep a way in outside Termi. */
    extraPublicKey?: string;
}

export interface NewCredentials {
    username: string;
    /** Null when the password was left unchanged. */
    password: string | null;
    privateKey: string;
}

export type StepStatus = 'running' | 'done' | 'warning' | 'failed' | 'skipped';

export type HardenEvent =
    | { type: 'step'; id: string; status: StepStatus; label: string }
    | {
          type: 'done';
          ok: boolean;
          /** 'succeeded' | 'failed' (nothing changed / rolled back) | 'rollback-pending' */
          outcome: 'succeeded' | 'failed' | 'rollback-pending';
          message: string;
          username?: string;
      };

export interface HardenHooks {
    onEvent(event: HardenEvent): void;
    /** Persist the new credentials encrypted, before they are put to use. */
    savePending(creds: NewCredentials): Promise<void>;
    /** Make them the server's credentials. Called only after verification. */
    commit(creds: NewCredentials): Promise<void>;
}

type Elevation = { kind: 'root' } | { kind: 'sudo' } | { kind: 'sudo-password'; password: string };

// ── SSH plumbing ─────────────────────────────────────────────────────────────

function connect(t: HardenTarget, timeoutMs = 15_000): Promise<Client> {
    return new Promise((resolve, reject) => {
        const client = new Client();
        const cc: ConnectConfig = {
            host: t.host,
            port: t.port,
            username: t.username,
            readyTimeout: timeoutMs,
            keepaliveInterval: 10_000,
        };
        if (t.privateKey) {
            cc.privateKey = t.privateKey;
            if (t.passphrase) cc.passphrase = t.passphrase;
        } else if (t.password) {
            cc.password = t.password;
            cc.tryKeyboard = true;
            client.on('keyboard-interactive', (_n, _i, _l, _p, finish) => finish([t.password!]));
        }
        client.once('ready', () => resolve(client));
        client.once('error', reject);
        connectSSH(client, cc, t.jump);
    });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * After sshd is reloaded it re-executes itself, and a connection that lands in
 * that instant is dropped before the handshake. Retry those — but never an
 * authentication failure, which is a real answer.
 */
async function connectWithRetry(t: HardenTarget, attempts = 3): Promise<Client> {
    for (let i = 1; ; i++) {
        try {
            return await connect(t);
        } catch (err) {
            const msg = (err as Error).message;
            const transient = /before handshake|ECONNREFUSED|ECONNRESET|timed out/i.test(msg);
            if (!transient || i >= attempts) throw err;
            await sleep(1500 * i);
        }
    }
}

function exec(
    client: Client,
    command: string,
    stdin: string,
    timeoutMs: number,
): Promise<{ out: string; code: number | null }> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('timed out')), timeoutMs);
        client.exec(command, (err, stream) => {
            if (err) {
                clearTimeout(timer);
                return reject(err);
            }
            let out = '';
            let code: number | null = null;
            stream.on('data', (d: Buffer) => (out += d.toString('utf8')));
            stream.stderr.on('data', () => {});
            stream.on('exit', (c: number | null) => (code = c));
            stream.on('close', () => {
                clearTimeout(timer);
                resolve({ out, code });
            });
            stream.end(stdin);
        });
    });
}

/**
 * Runs a script as root. With a sudo password, `-k` forces sudo to read it
 * even if a timestamp is cached — otherwise the password line would be handed
 * to the shell as a command. sudo reads the password byte by byte, so the rest
 * of stdin (the script) is left for `sh -s`.
 */
function runAsRoot(client: Client, elev: Elevation, script: string, timeoutMs: number) {
    switch (elev.kind) {
        case 'root':
            return exec(client, 'sh -s', script, timeoutMs);
        case 'sudo':
            return exec(client, 'sudo -n sh -s', script, timeoutMs);
        case 'sudo-password':
            return exec(client, "sudo -k -S -p '' sh -s", `${elev.password}\n${script}`, timeoutMs);
    }
}

function lines(out: string, prefix: string): string[] {
    return out
        .split(/\r?\n/)
        .filter((l) => l.startsWith(prefix))
        .map((l) => l.slice(prefix.length));
}

const STEP_LABELS: Record<string, string> = {
    connect: 'Connect',
    check: 'Check access',
    backup: 'Back up configuration',
    rollback: 'Arm automatic rollback',
    user: 'Create admin user',
    password: 'Set a new password',
    key: 'Install SSH key',
    sshd: 'Apply SSH settings',
    verify: 'Log in with the new credentials',
    confirm: 'Disarm the rollback',
    save: 'Save the new credentials',
    fail2ban: 'Brute-force protection',
    updates: 'Automatic security updates',
};

// ── The run ──────────────────────────────────────────────────────────────────

export async function hardenServer(
    target: HardenTarget,
    options: HardenOptions,
    hooks: HardenHooks,
): Promise<void> {
    const emit = (id: string, status: StepStatus, label = STEP_LABELS[id] ?? id) =>
        hooks.onEvent({ type: 'step', id, status, label });
    const done = (
        outcome: 'succeeded' | 'failed' | 'rollback-pending',
        message: string,
        username?: string,
    ) => hooks.onEvent({ type: 'done', ok: outcome === 'succeeded', outcome, message, username });

    let oldClient: Client | null = null;
    let newClient: Client | null = null;
    // Set once the access script may have changed the server, cleared on commit:
    // an unexpected error in between must undo, not just report.
    let pendingRollback: { runId: string; elev: Elevation } | null = null;
    try {
        // Validate options before touching anything.
        const newUsername = options.createUser
            ? assertUsername((options.newUsername ?? '').trim())
            : null;
        const extraKey = options.extraPublicKey?.trim()
            ? assertPublicKey(options.extraPublicKey)
            : null;

        // ── Connect + precheck ───────────────────────────────────────────────
        emit('connect', 'running');
        try {
            oldClient = await connect(target);
        } catch (err) {
            emit('connect', 'failed');
            return done('failed', `Could not connect: ${(err as Error).message}`);
        }
        emit('connect', 'done');

        emit('check', 'running');
        const scanRun = await exec(oldClient, 'sh -s', SCAN_SCRIPT, 60_000);
        const raw = parseScanOutput(scanRun.out);
        const report = evaluateScan(raw, { authMethod: target.privateKey ? 'key' : 'password' });
        const who = await exec(
            oldClient,
            'sh -s',
            'id -un; printf "%s\\n" "$SSH_CLIENT" | cut -d" " -f1',
            10_000,
        );
        const [loginUser = '', clientIp = ''] = who.out.split(/\r?\n/).map((s) => s.trim());

        let elev: Elevation | null = null;
        if (report.privilege === 'root') elev = { kind: 'root' };
        else if (report.privilege === 'sudo') elev = { kind: 'sudo' };
        else if (target.password) {
            const probe = await exec(
                oldClient,
                "sudo -k -S -p '' true",
                `${target.password}\n`,
                15_000,
            );
            if (probe.code === 0) elev = { kind: 'sudo-password', password: target.password };
        }
        if (!elev) {
            emit('check', 'failed');
            return done(
                'failed',
                `${loginUser || target.username} needs root or sudo rights to change the server's settings. Nothing was changed.`,
            );
        }
        if (report.os.family === 'other') {
            emit('check', 'failed');
            return done('failed', `${report.os.name} is not supported yet. Nothing was changed.`);
        }
        if (newUsername) {
            const exists = await exec(
                oldClient,
                'sh -s',
                `id ${newUsername} >/dev/null 2>&1 && echo yes`,
                10_000,
            );
            if (exists.out.trim() === 'yes' && newUsername !== loginUser) {
                emit('check', 'failed');
                return done(
                    'failed',
                    `A user named ${newUsername} already exists. Pick another name.`,
                );
            }
        }
        emit('check', 'done');

        // ── New credentials, saved before use ────────────────────────────────
        const targetUser = newUsername ?? loginUser;
        const runId = randomBytes(12).toString('hex');
        const keyPair = utils.generateKeyPairSync('ed25519', { comment: 'termi' });
        // A non-root account needs a known password for sudo; root does not.
        const mustSetPassword =
            options.rotatePassword || !!newUsername || (targetUser !== 'root' && !target.password);
        const newPassword = mustSetPassword ? generatePassword(randomBytes) : null;
        const creds: NewCredentials = {
            username: targetUser,
            password: newPassword,
            privateKey: keyPair.private,
        };
        await hooks.savePending(creds);

        // ── Access changes, with rollback armed ──────────────────────────────
        pendingRollback = { runId, elev };
        const access = await runAsRoot(
            oldClient,
            elev,
            buildAccessScript({
                runId,
                targetUser,
                createUser: !!newUsername,
                newPassword,
                publicKeys: [keyPair.public.trim(), ...(extraKey ? [extraKey] : [])],
                disablePasswordLogin: options.disablePasswordLogin,
                permitRootLogin: targetUser === 'root' ? 'prohibit-password' : 'no',
            }),
            120_000,
        );
        for (const line of lines(access.out, 'STEP=')) {
            const [id, ...rest] = line.split(' ');
            if (id === 'sshd-warn') emit('sshd', 'warning', rest.join(' '));
            else emit(id, 'done');
        }
        const failure = lines(access.out, 'FAIL=')[0];
        if (failure || !access.out.includes('ACCESS_DONE=1')) {
            const [id = 'sshd', ...msg] = (failure ?? 'sshd the script stopped early').split(' ');
            emit(id, 'failed');
            await runAsRoot(oldClient, elev, buildRollbackNowScript(runId), 30_000).catch(() => {});
            pendingRollback = null;
            return done('failed', `Stopped: ${msg.join(' ')}. Everything was rolled back.`);
        }

        // ── Prove the new login works, on a fresh connection ─────────────────
        emit('verify', 'running');
        const newTarget: HardenTarget = {
            ...target,
            username: targetUser,
            privateKey: keyPair.private,
            passphrase: undefined,
            password: undefined,
        };
        let newElev: Elevation;
        try {
            await sleep(1000); // let the reloaded sshd settle
            newClient = await connectWithRetry(newTarget);
            const whoNew = (await exec(newClient, 'sh -s', 'id -un', 10_000)).out.trim();
            if (whoNew !== targetUser) throw new Error(`logged in as ${whoNew || 'nobody'}`);
            if (targetUser === 'root') {
                newElev = { kind: 'root' };
            } else {
                const sudoPw = newPassword ?? target.password ?? '';
                const sudo = await exec(newClient, "sudo -k -S -p '' true", `${sudoPw}\n`, 15_000);
                if (sudo.code !== 0) throw new Error(`${targetUser} could not use sudo`);
                newElev = { kind: 'sudo-password', password: sudoPw };
            }
        } catch (err) {
            emit('verify', 'failed');
            pendingRollback = null;
            const rolledBack = await runAsRoot(
                oldClient,
                elev,
                buildRollbackNowScript(runId),
                30_000,
            )
                .then((r) => r.out.includes('ROLLED_BACK=1'))
                .catch(() => false);
            return rolledBack
                ? done(
                      'failed',
                      `The new login did not work (${(err as Error).message}), so every change was rolled back. Termi still uses the old credentials.`,
                  )
                : done(
                      'rollback-pending',
                      `The new login did not work (${(err as Error).message}). The server will restore its previous settings within 5 minutes on its own. Termi still uses the old credentials.`,
                  );
        }
        emit('verify', 'done');

        // ── Disarm the rollback from the new login, then commit ──────────────
        emit('confirm', 'running');
        const cancel = await runAsRoot(newClient, newElev, buildCancelScript(runId), 30_000).catch(
            () => null,
        );
        if (!cancel?.out.includes('CANCELLED=1')) {
            emit('confirm', 'failed');
            pendingRollback = null;
            await runAsRoot(oldClient, elev, buildRollbackNowScript(runId), 30_000).catch(() => {});
            return done(
                'failed',
                'Could not disarm the automatic rollback, so the changes were undone to keep Termi and the server in step.',
            );
        }
        emit('confirm', 'done');

        emit('save', 'running');
        await hooks.commit(creds);
        pendingRollback = null;
        emit('save', 'done');

        // ── Extras: cannot lock anyone out ───────────────────────────────────
        if (options.fail2ban || options.autoUpdates) {
            if (options.fail2ban) emit('fail2ban', 'running');
            if (options.autoUpdates) emit('updates', 'running');
            const ignoreIps = [clientIp].filter(Boolean);
            const extras = await runAsRoot(
                newClient,
                newElev,
                buildExtrasScript({
                    runId,
                    family: report.os.family,
                    fail2ban: options.fail2ban,
                    autoUpdates: options.autoUpdates,
                    sshPort: Number(raw.values.get('sshd_port')) || target.port,
                    ignoreIps,
                }),
                600_000,
            ).catch(() => null);
            for (const line of lines(extras?.out ?? '', 'STEP=')) {
                const [id, ...rest] = line.split(' ');
                const base = id.replace(/-(fail|skip)$/, '');
                emit(
                    base,
                    id.endsWith('-fail') ? 'warning' : id.endsWith('-skip') ? 'skipped' : 'done',
                    id.endsWith('-fail') || id.endsWith('-skip')
                        ? rest.join(' ')
                        : STEP_LABELS[base],
                );
            }
            if (!extras?.out.includes('EXTRAS_DONE=1')) {
                if (options.fail2ban && !extras?.out.includes('STEP=fail2ban'))
                    emit('fail2ban', 'warning', 'Did not finish');
                if (options.autoUpdates && !extras?.out.includes('STEP=updates'))
                    emit('updates', 'warning', 'Did not finish');
            }
        }

        done(
            'succeeded',
            `Done. Termi now logs in as ${targetUser} with a new SSH key${newPassword ? ' and password' : ''}.`,
            targetUser,
        );
    } catch (err) {
        const message =
            err instanceof HardeningInputError
                ? err.message
                : `Unexpected error: ${(err as Error).message}`;
        if (pendingRollback && oldClient) {
            const { runId, elev } = pendingRollback;
            const undone = await runAsRoot(oldClient, elev, buildRollbackNowScript(runId), 30_000)
                .then((r) => r.out.includes('ROLLED_BACK=1'))
                .catch(() => false);
            done(
                undone ? 'failed' : 'rollback-pending',
                undone
                    ? `${message}. Every change was rolled back; Termi still uses the old credentials.`
                    : `${message}. The server will restore its previous settings within 5 minutes on its own.`,
            );
        } else {
            done('failed', `${message}. Nothing was changed.`);
        }
    } finally {
        oldClient?.end();
        newClient?.end();
    }
}
