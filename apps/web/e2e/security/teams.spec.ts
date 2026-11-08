import { expect, test } from '@playwright/test';
import { BASE } from './env';
import { json, signInPage, signedIn, state } from './helpers';

test.describe.configure({ mode: 'serial' });

let teamId: string;
let inviteToken: string;

const tokenFor = async (user: 'alice' | 'bob') =>
    (
        await (
            await signedIn(user)
        ).post('/api/connection/token', {
            data: { serverId: state().sshServerId, protocol: 'ssh' },
        })
    ).status();

test('create a team and invite a member', async () => {
    const alice = await signedIn('alice');
    const created = await json(await alice.post('/api/teams', { data: { name: 'Ops' } }));
    expect(created.status).toBe(201);
    teamId = created.body!.data.team.id;

    const invited = await json(
        await alice.post(`/api/teams/${teamId}/members`, {
            data: { email: 'bob@sec-e2e.local', role: 'MEMBER' },
        }),
    );
    expect(invited.status).toBe(201);
    inviteToken = invited.body!.data.inviteUrl.split('/teams/join/')[1];
    expect(inviteToken).toMatch(/^[0-9a-f]{64}$/);

    // The invitation only works for the invited address.
    const wrong = await alice.post(`/api/teams/join/${inviteToken}`);
    expect(wrong.status()).toBe(403);
});

test('before joining, bob cannot see the team or reach its servers', async () => {
    const bob = await signedIn('bob');
    expect((await bob.get(`/api/teams/${teamId}`)).status()).toBe(404);
    const alice = await signedIn('alice');
    await alice.post(`/api/teams/${teamId}/servers`, { data: { serverId: state().sshServerId } });
    expect(await tokenFor('bob')).toBe(404);
});

test('a member can connect to vault servers but never see their secrets', async () => {
    const bob = await signedIn('bob');
    const describe = await json(await bob.get(`/api/teams/join/${inviteToken}`));
    expect(describe.body!.data.invitation).toMatchObject({ teamName: 'Ops', role: 'MEMBER' });
    expect((await bob.post(`/api/teams/join/${inviteToken}`)).status()).toBe(200);
    // The link is single-use.
    expect((await bob.post(`/api/teams/join/${inviteToken}`)).status()).toBe(404);

    expect(await tokenFor('bob')).toBe(200);
    const id = state().sshServerId;
    expect((await bob.get(`/api/servers/${id}`)).status()).toBe(404);
    expect(
        (await bob.post(`/api/servers/${id}/reveal`, { data: { field: 'password' } })).status(),
    ).not.toBe(200);
    expect((await bob.patch(`/api/servers/${id}`, { data: { name: 'pwned' } })).status()).toBe(404);

    const shared = await json(await bob.get('/api/shared-servers'));
    expect(shared.body!.data.servers).toEqual(
        expect.arrayContaining([expect.objectContaining({ id, sharedBy: 'Ops (team)' })]),
    );
});

test('members cannot manage the team; owners can delegate', async () => {
    const bob = await signedIn('bob');
    const alice = await signedIn('alice');
    const team = await json(await alice.get(`/api/teams/${teamId}`));
    const aliceId = team.body!.data.team.members.find((m: { you: boolean }) => m.you).userId;
    const bobId = state().bobId;

    expect(
        (
            await bob.post(`/api/teams/${teamId}/members`, {
                data: { email: 'x@sec-e2e.local' },
            })
        ).status(),
    ).toBe(403);
    expect((await bob.delete(`/api/teams/${teamId}/members/${aliceId}`)).status()).toBe(403);
    expect(
        (
            await bob.patch(`/api/teams/${teamId}/members/${bobId}`, { data: { role: 'OWNER' } })
        ).status(),
    ).toBe(403);
    expect((await bob.delete(`/api/teams/${teamId}`)).status()).toBe(403);
    // Bob can't put someone else's server in the vault, nor take one out.
    expect(
        (
            await bob.post(`/api/teams/${teamId}/servers`, {
                data: { serverId: state().vncServerId },
            })
        ).status(),
    ).toBe(403);
    expect((await bob.delete(`/api/teams/${teamId}/servers/${state().sshServerId}`)).status()).toBe(
        403,
    );

    // The owner makes Bob an admin: now he can invite, but not invite owners.
    expect(
        (
            await alice.patch(`/api/teams/${teamId}/members/${bobId}`, { data: { role: 'ADMIN' } })
        ).status(),
    ).toBe(200);
    expect(
        (
            await bob.post(`/api/teams/${teamId}/members`, {
                data: { email: 'y@sec-e2e.local', role: 'ADMIN' },
            })
        ).status(),
    ).toBe(201);
    expect(
        (
            await bob.post(`/api/teams/${teamId}/members`, {
                data: { email: 'z@sec-e2e.local', role: 'OWNER' },
            })
        ).status(),
    ).toBe(400);
    // …and an admin still can't remove the owner.
    expect((await bob.delete(`/api/teams/${teamId}/members/${aliceId}`)).status()).toBe(403);
    // The last owner can't leave.
    expect((await alice.delete(`/api/teams/${teamId}/members/${aliceId}`)).status()).toBe(400);
});

test('the team page shows the vault and members', async ({ page }) => {
    await signInPage(page, 'alice');
    await page.goto(`${BASE}/panel/teams/${teamId}`);
    await expect(page.getByRole('heading', { name: 'Ops' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'ssh-box' })).toBeVisible();
    await expect(page.getByText('bob@sec-e2e.local')).toBeVisible();
    await expect(page.getByText('y@sec-e2e.local')).toBeVisible(); // pending invitation
});

test('leaving the team removes access', async () => {
    const bob = await signedIn('bob');
    expect((await bob.delete(`/api/teams/${teamId}/members/${state().bobId}`)).status()).toBe(200);
    expect(await tokenFor('bob')).toBe(404);
    expect((await bob.get(`/api/teams/${teamId}`)).status()).toBe(404);
    // The owner deletes the team; the server itself is untouched.
    const alice = await signedIn('alice');
    expect((await alice.delete(`/api/teams/${teamId}`)).status()).toBe(200);
    expect((await alice.get(`/api/servers/${state().sshServerId}`)).status()).toBe(200);
});
