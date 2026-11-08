import { expect, test } from '@playwright/test';
import { BASE } from './env';
import { json, signInPage, signedIn, sql, state } from './helpers';

test.describe.configure({ mode: 'serial' });

const SSH_CONFIG = `
Host bastion
    HostName 127.0.0.1
    User ops
    IdentityFile ~/.ssh/id_ed25519

Host inner
    HostName 10.1.2.3
    ProxyJump bastion

Host metadata
    HostName 169.254.169.254
    User x
`;

test('importing an ssh config: preview, hostile hosts refused, keychain login applied', async () => {
    const bob = await signedIn('bob');
    const { bobId } = state();

    const preview = await json(
        await bob.post('/api/servers/import', {
            data: { content: SSH_CONFIG, fileType: 'ssh-config', dryRun: true },
        }),
    );
    expect(preview.status).toBe(200);
    expect(preview.body!.data.total).toBe(3);
    expect(preview.body!.data.notes.join(' ')).toContain('~/.ssh/id_ed25519');
    // A preview writes nothing.
    expect(sql(`select count(*) from "Server" where "userId"='${bobId}' and name='inner'`)).toBe(
        '0',
    );

    const kc = await json(
        await bob.post('/api/keychain', {
            data: { label: 'imported', username: 'kcuser', password: 'kc-import-pw' },
        }),
    );
    const done = await json(
        await bob.post('/api/servers/import', {
            data: {
                content: SSH_CONFIG,
                fileType: 'ssh-config',
                keychainId: kc.body!.data.entry.id,
            },
        }),
    );
    expect(done.status).toBe(200);
    expect(done.body!.data.imported).toBe(2);
    // The metadata address is refused even from an imported file.
    expect(done.body!.data.failed).toEqual([expect.objectContaining({ name: 'metadata' })]);

    // inner goes through bastion; its credentials came from the keychain and
    // are stored encrypted; the keychain username filled the missing User only.
    expect(
        sql(
            `select count(*) from "Server" s join "Server" j on s."jumpServerId" = j.id where s."userId"='${bobId}' and s.name='inner' and j.name='bastion'`,
        ),
    ).toBe('1');
    expect(
        sql(`select password like 'v2:%' from "Server" where "userId"='${bobId}' and name='inner'`),
    ).toBe('t');
    const inner = sql(`select id from "Server" where "userId"='${bobId}' and name='inner'`);
    const bastion = sql(`select id from "Server" where "userId"='${bobId}' and name='bastion'`);
    const user = async (id: string) =>
        (await json(await bob.get(`/api/servers/${id}`))).body!.data.server.username;
    expect(await user(inner)).toBe('kcuser');
    expect(await user(bastion)).toBe('ops');
});

test('the import dialog reads a PuTTY export (UTF-16) and previews it', async ({ page }) => {
    await signInPage(page, 'bob');
    await page.goto(`${BASE}/panel`);
    await page.getByRole('button', { name: 'Import or export servers' }).click();
    await page.getByRole('menuitem', { name: 'Import servers' }).click();

    const reg = [
        'Windows Registry Editor Version 5.00',
        '',
        '[HKEY_CURRENT_USER\\Software\\SimonTatham\\PuTTY\\Sessions\\Putty%20Box]',
        '"HostName"="admin@127.0.0.1"',
        '"PortNumber"=dword:00000016',
        '"Protocol"="ssh"',
        '',
    ].join('\r\n');
    await page.locator('input[type=file]').setInputFiles({
        name: 'putty.reg',
        mimeType: 'text/plain',
        buffer: Buffer.from('﻿' + reg, 'utf16le'),
    });

    await expect(page.getByText(/PuTTY sessions/)).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Putty Box' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'admin' })).toBeVisible();
    await page.getByRole('button', { name: 'Import 1' }).click();
    await expect(page.getByText('Import complete')).toBeVisible();
    expect(
        sql(`select count(*) from "Server" where "userId"='${state().bobId}' and name='Putty Box'`),
    ).toBe('1');
});
