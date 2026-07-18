/**
 * Builds export payloads from stored servers.
 *
 * Credentials live encrypted at rest, so producing an export means decrypting
 * them in memory. Everything here treats that plaintext as radioactive: it is
 * only materialised when the caller explicitly asked for credentials, and the
 * `omitCredentials` path never decrypts the secret fields at all.
 */

import { decryptCredentials } from '@/lib/crypto/credentials';

import {
    EXPORT_FORMAT,
    EXPORT_VERSION,
    type ExportFile,
    type ExportPayload,
    type ExportedServer,
} from './format';
import { sealPayload } from './envelope';
import { buildCsv, buildXlsx, type CellValue, type SheetColumn } from './spreadsheet';

/** A server row as it comes out of Prisma, with fields still encrypted. */
export interface StoredServer {
    name: string;
    description: string | null;
    host: string;
    port: number;
    protocol: string;
    username: string;
    password: string | null;
    privateKey: string | null;
    passphrase: string | null;
    notes: string | null;
    tags: string[];
    color: string | null;
    icon: string | null;
    displayWidth: number | null;
    displayHeight: number | null;
    colorDepth: number | null;
    rdpSecurity: string | null;
    isFavorite: boolean;
    group: {
        name: string;
        description: string | null;
        color: string | null;
        icon: string | null;
    } | null;
}

export interface BuildPayloadOptions {
    /** When false, secrets are dropped and never decrypted. */
    includeCredentials: boolean;
}

/**
 * Decrypt stored servers into a portable payload.
 *
 * Host and username are always decrypted — they are encrypted at rest but are
 * not optional here, since an export without them describes nothing.
 */
export function buildPayload(
    servers: StoredServer[],
    { includeCredentials }: BuildPayloadOptions,
): ExportPayload {
    const groups = new Map<string, ExportPayload['groups'][number]>();

    const exported: ExportedServer[] = servers.map((server) => {
        const decrypted = decryptCredentials({
            host: server.host,
            username: server.username,
            // Only feed the secret fields in when they are actually wanted —
            // decryptCredentials skips whatever is undefined.
            password: includeCredentials ? (server.password ?? undefined) : undefined,
            privateKey: includeCredentials ? (server.privateKey ?? undefined) : undefined,
            passphrase: includeCredentials ? (server.passphrase ?? undefined) : undefined,
            notes: includeCredentials ? (server.notes ?? undefined) : undefined,
        });

        if (server.group && !groups.has(server.group.name)) {
            groups.set(server.group.name, {
                name: server.group.name,
                description: server.group.description,
                color: server.group.color,
                icon: server.group.icon,
            });
        }

        return {
            name: server.name,
            description: server.description,
            groupName: server.group?.name ?? null,

            host: decrypted.host,
            port: server.port,
            protocol: server.protocol as ExportedServer['protocol'],
            username: decrypted.username,

            password: decrypted.password ?? null,
            privateKey: decrypted.privateKey ?? null,
            passphrase: decrypted.passphrase ?? null,
            notes: decrypted.notes ?? null,

            tags: server.tags,
            color: server.color,
            icon: server.icon,

            displayWidth: server.displayWidth,
            displayHeight: server.displayHeight,
            colorDepth: server.colorDepth as ExportedServer['colorDepth'],
            rdpSecurity: server.rdpSecurity as ExportedServer['rdpSecurity'],

            isFavorite: server.isFavorite,
        };
    });

    return { groups: [...groups.values()], servers: exported };
}

/** Wrap a payload in the file envelope, encrypting it when a passphrase is given. */
export function buildExportFile(
    payload: ExportPayload,
    options: { includesCredentials: boolean; passphrase?: string; now: Date },
): ExportFile {
    const base = {
        format: EXPORT_FORMAT,
        version: EXPORT_VERSION,
        exportedAt: options.now.toISOString(),
        includesCredentials: options.includesCredentials,
        serverCount: payload.servers.length,
    };

    if (options.passphrase) {
        const { kdf, payload: sealed } = sealPayload(payload, options.passphrase);
        return { ...base, encrypted: true, kdf, payload: sealed };
    }

    return { ...base, encrypted: false, payload };
}

// SPREADSHEET

/**
 * Columns for the tabular exports.
 *
 * Secret columns are appended only when credentials are included, so a
 * no-credentials spreadsheet has no empty "Password" column inviting someone
 * to fill it in and re-import.
 */
function spreadsheetColumns(includeCredentials: boolean): SheetColumn[] {
    const columns: SheetColumn[] = [
        { header: 'Name', width: 24 },
        { header: 'Group', width: 18 },
        { header: 'Protocol', width: 10 },
        { header: 'Host', width: 28 },
        { header: 'Port', width: 8 },
        { header: 'Username', width: 18 },
        { header: 'Description', width: 32 },
        { header: 'Tags', width: 22 },
        { header: 'Favorite', width: 10 },
    ];

    if (includeCredentials) {
        columns.push(
            { header: 'Password', width: 24 },
            { header: 'Private Key', width: 40 },
            { header: 'Key Passphrase', width: 20 },
            { header: 'Notes', width: 40 },
        );
    }

    return columns;
}

function spreadsheetRows(payload: ExportPayload, includeCredentials: boolean): CellValue[][] {
    return payload.servers.map((server) => {
        const row: CellValue[] = [
            server.name,
            server.groupName ?? '',
            server.protocol,
            server.host,
            server.port,
            server.username,
            server.description ?? '',
            (server.tags ?? []).join(', '),
            server.isFavorite ?? false,
        ];

        if (includeCredentials) {
            row.push(
                server.password ?? '',
                server.privateKey ?? '',
                server.passphrase ?? '',
                server.notes ?? '',
            );
        }

        return row;
    });
}

/**
 * Render a payload as a spreadsheet.
 *
 * Note these formats are export-only and cannot be encrypted — a spreadsheet
 * that needs a passphrase to open is no longer a spreadsheet. The caller is
 * responsible for having obtained explicit acknowledgement first.
 */
export function buildSpreadsheet(
    payload: ExportPayload,
    options: { format: 'xlsx' | 'csv'; includesCredentials: boolean; now: Date },
): Buffer {
    const columns = spreadsheetColumns(options.includesCredentials);
    const rows = spreadsheetRows(payload, options.includesCredentials);

    return options.format === 'csv'
        ? buildCsv(columns, rows)
        : buildXlsx('Termi Servers', columns, rows, options.now);
}
