/**
 * Re-encrypt stored secrets under the current key and field binding.
 *
 *   npm run db:reseal              # re-seal everything that needs it
 *   npm run db:reseal -- --dry-run # only count what would change
 *
 * Re-seals every value that is still in the unbound pre-1.2 format or sealed
 * under a key other than the current ENCRYPTION_KEY. Use it after upgrading
 * (to bind old values right away instead of on their next save) and to rotate
 * keys: set the new ENCRYPTION_KEY, put the old one in ENCRYPTION_KEY_PREVIOUS,
 * run this, then drop ENCRYPTION_KEY_PREVIOUS once it reports nothing left.
 *
 * Safe to re-run: values already sealed with the current key are skipped, and
 * each row is updated on its own, so an interrupted run just continues.
 */

import { prisma } from '../src/lib/db';
import { needsReseal, openField, sealField, type SealedModel } from '../src/lib/crypto/credentials';

const DRY_RUN = process.argv.includes('--dry-run');
const BATCH = 200;

interface Target {
    model: SealedModel;
    /** Prisma delegate name. */
    table:
        | 'server'
        | 'keychainCredential'
        | 'user'
        | 'recording'
        | 'serverMonitorConfig'
        | 'serverHardeningRun'
        | 'aiSettings'
        | 'aiConversation'
        | 'aiMessage'
        | 'aiMemory';
    fields: string[];
    /** Column holding the owning user's id. */
    owner: 'userId' | 'id';
}

const TARGETS: Target[] = [
    {
        model: 'Server',
        table: 'server',
        owner: 'userId',
        fields: ['host', 'username', 'password', 'privateKey', 'passphrase', 'notes'],
    },
    {
        model: 'KeychainCredential',
        table: 'keychainCredential',
        owner: 'userId',
        fields: ['username', 'password', 'privateKey', 'passphrase'],
    },
    { model: 'User', table: 'user', owner: 'id', fields: ['totpSecret'] },
    { model: 'Recording', table: 'recording', owner: 'userId', fields: ['content'] },
    {
        model: 'ServerMonitorConfig',
        table: 'serverMonitorConfig',
        owner: 'userId',
        fields: ['webhookUrl'],
    },
    {
        model: 'ServerHardeningRun',
        table: 'serverHardeningRun',
        owner: 'userId',
        fields: ['pendingSecret'],
    },
    { model: 'AiSettings', table: 'aiSettings', owner: 'userId', fields: ['apiKey'] },
    { model: 'AiConversation', table: 'aiConversation', owner: 'userId', fields: ['title'] },
    { model: 'AiMessage', table: 'aiMessage', owner: 'userId', fields: ['content'] },
    { model: 'AiMemory', table: 'aiMemory', owner: 'userId', fields: ['content'] },
];

type Row = Record<string, string | null>;
type Delegate = {
    findMany(args: unknown): Promise<Row[]>;
    update(args: unknown): Promise<unknown>;
};

async function resealTarget(t: Target) {
    const delegate = (prisma as unknown as Record<string, Delegate>)[t.table];
    const select: Record<string, true> = { id: true, [t.owner]: true };
    for (const f of t.fields) select[f] = true;

    let cursor: string | undefined;
    let resealed = 0;
    let failed = 0;
    for (;;) {
        const rows = await delegate.findMany({
            select,
            orderBy: { id: 'asc' },
            take: BATCH,
            ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        });
        if (rows.length === 0) break;
        cursor = rows[rows.length - 1].id as string;

        for (const row of rows) {
            const owner = row[t.owner] as string;
            const data: Record<string, string> = {};
            for (const field of t.fields) {
                const value = row[field];
                if (!value || !needsReseal(value)) continue;
                try {
                    data[field] = sealField(
                        openField(value, t.model, field, owner),
                        t.model,
                        field,
                        owner,
                    );
                } catch (err) {
                    failed++;
                    console.error(
                        `  ${t.model} ${row.id} ${field}: cannot decrypt (${err instanceof Error ? err.message : err})`,
                    );
                }
            }
            const count = Object.keys(data).length;
            if (count === 0) continue;
            resealed += count;
            if (!DRY_RUN) await delegate.update({ where: { id: row.id }, data });
        }
    }
    console.log(
        `${t.model.padEnd(20)} ${DRY_RUN ? 'would re-seal' : 're-sealed'} ${resealed} value(s)` +
            (failed ? `, ${failed} unreadable` : ''),
    );
    return failed;
}

async function main() {
    console.log(DRY_RUN ? 'Dry run — nothing is written.\n' : 'Re-sealing stored secrets…\n');
    let failed = 0;
    for (const t of TARGETS) failed += await resealTarget(t);
    if (failed) {
        console.error(
            `\n${failed} value(s) could not be decrypted with ENCRYPTION_KEY or ENCRYPTION_KEY_PREVIOUS. ` +
                'They were left unchanged.',
        );
        process.exitCode = 1;
    }
}

main()
    .catch((err) => {
        console.error(err);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
