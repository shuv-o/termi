/**
 * Seeds the security suite's database. Run by global-setup with the app's
 * environment, so values are encrypted exactly as the app would.
 */
import { writeFileSync } from 'fs';
import { prisma } from '@/lib/db';
import { encryptCredentials, hashPassword } from '@/lib/crypto';

async function main() {
    const out: Record<string, string> = {};
    for (const [key, u] of Object.entries(
        JSON.parse(process.env.SEC_E2E_USERS!) as Record<
            string,
            { email: string; password: string }
        >,
    )) {
        const user = await prisma.user.create({
            data: {
                email: u.email,
                name: key,
                passwordHash: await hashPassword(u.password),
                isVerified: true,
                // Alice and Bob are long-time users; Carol has just signed up.
                onboardedAt: key === 'carol' ? null : new Date(),
            },
        });
        out[`${key}Id`] = user.id;
    }
    const ssh = encryptCredentials(
        { host: '127.0.0.1', username: 'root', password: process.env.SEC_E2E_SSH_PASSWORD! },
        out.aliceId,
    );
    out.sshServerId = (
        await prisma.server.create({
            data: {
                userId: out.aliceId,
                name: 'ssh-box',
                host: ssh.host,
                port: Number(process.env.SEC_E2E_SSH_PORT),
                protocol: 'SSH',
                username: ssh.username,
                password: ssh.password,
                tags: [],
            },
        })
    ).id;
    const vnc = encryptCredentials(
        {
            host: process.env.SEC_E2E_VNC_IP!,
            username: 'vnc',
            password: process.env.SEC_E2E_VNC_PASSWORD!,
        },
        out.aliceId,
    );
    out.vncServerId = (
        await prisma.server.create({
            data: {
                userId: out.aliceId,
                name: 'vnc-box',
                host: vnc.host,
                port: 5900,
                protocol: 'VNC',
                username: vnc.username,
                password: vnc.password,
                tags: [],
            },
        })
    ).id;
    writeFileSync(process.env.SEC_E2E_STATE!, JSON.stringify(out));
    await prisma.$disconnect();
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
