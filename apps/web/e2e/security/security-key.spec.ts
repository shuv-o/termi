import { execFileSync } from 'child_process';
import { randomUUID } from 'crypto';
import { expect, test, type Page } from '@playwright/test';
import { BASE, SSH_CONTAINER, SSH_PORT } from './env';
import { signInPage, signedIn, sql, state } from './helpers';

test.describe.configure({ mode: 'serial' });

const inBox = (cmd: string) =>
    execFileSync('docker', ['exec', SSH_CONTAINER, 'sh', '-c', cmd]).toString();

/** A USB security key that answers every touch request (Chrome's virtual authenticator). */
async function plugInSecurityKey(page: Page) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('WebAuthn.enable');
    const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
        options: {
            protocol: 'ctap2',
            transport: 'usb',
            hasResidentKey: false,
            hasUserVerification: true,
            isUserVerified: true,
            automaticPresenceSimulation: true,
        },
    });
    return { cdp, authenticatorId };
}

let serverId = '';

test('a FIDO2 key enrolled in the browser signs in to a real OpenSSH server', async ({ page }) => {
    const { cdp, authenticatorId } = await plugInSecurityKey(page);
    await signInPage(page, 'alice');
    await page.goto(`${BASE}/panel/keychain`);
    await page.getByLabel('Security key name').fill('Virtual key');
    await page.getByRole('button', { name: 'Add security key' }).click();
    const line = page.getByTestId('security-key-line').last();
    await expect(line).toContainText('sk-ecdsa-sha2-nistp256@openssh.com');
    const authorizedKey = (await line.textContent())!.trim();
    // The browser holds only a credential id; the private key stays on the device.
    const { credentials } = await cdp.send('WebAuthn.getCredentials', { authenticatorId });
    expect(credentials).toHaveLength(1);

    inBox(`echo '${authorizedKey}' >> /root/.ssh/authorized_keys`);

    const alice = await signedIn('alice');
    const keys = await (await alice.get('/api/ssh-security-keys')).json();
    const keyId = keys.data.keys.at(-1).id as string;
    const created = await (
        await alice.post('/api/servers', {
            data: {
                name: 'sk-box',
                host: '127.0.0.1',
                port: SSH_PORT,
                protocol: 'SSH',
                username: 'root',
                securityKeyId: keyId,
            },
        })
    ).json();
    expect(created.success).toBe(true);
    serverId = created.data.server.id;

    sql(`delete from "PersistentSession" where "userId"='${state().aliceId}'`);
    await alice.post('/api/sessions', {
        data: { sessionId: randomUUID(), serverId, serverName: 'sk-box' },
    });
    await page.setViewportSize({ width: 1300, height: 850 });
    await page.goto(`${BASE}/panel/sessions`);
    const pane = page.locator('[data-pane]').filter({ visible: true }).first();
    await expect(pane.locator('.xterm-rows')).toContainText('#', { timeout: 20_000 });
    await pane.locator('.xterm-screen').click();
    await page.keyboard.type('echo FIDO-$((40+2))\n');
    await expect(pane.locator('.xterm-rows')).toContainText('FIDO-42', { timeout: 20_000 });

    // The device's signature counter moved: it really signed the login.
    const after = await cdp.send('WebAuthn.getCredentials', { authenticatorId });
    expect(after.credentials[0].signCount).toBeGreaterThan(0);
});

test('a security-key server is for its owner, in a terminal, only', async () => {
    const alice = await signedIn('alice');
    // Nothing in the background can touch the key: no SFTP/SCP tokens.
    const scp = await alice.post('/api/connection/token', {
        data: { serverId, protocol: 'scp' },
    });
    expect(scp.status()).toBe(400);

    // Someone it's shared with can't use the owner's key.
    const { aliceId, bobId } = state();
    sql(
        `insert into "ServerShare" (id, "serverId", "ownerId", "sharedWithId", permissions) values ('share-sk-e2e', '${serverId}', '${aliceId}', '${bobId}', 'connect') on conflict do nothing`,
    );
    const bob = await signedIn('bob');
    const res = await bob.post('/api/connection/token', {
        data: { serverId, protocol: 'ssh' },
    });
    expect(res.status()).toBe(403);
});

test("nobody can attach someone else's security key to their server", async () => {
    const alice = await signedIn('alice');
    const keyId = (await (await alice.get('/api/ssh-security-keys')).json()).data.keys[0].id;
    const bob = await signedIn('bob');
    const res = await bob.post('/api/servers', {
        data: {
            name: 'steal',
            host: '127.0.0.1',
            port: SSH_PORT,
            protocol: 'SSH',
            username: 'root',
            securityKeyId: keyId,
        },
    });
    expect(res.status()).toBe(400);
    expect((await bob.delete(`/api/ssh-security-keys/${keyId}`)).status()).toBe(404);
});
