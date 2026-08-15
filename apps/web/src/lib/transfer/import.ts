/**
 * Parsing and validation for uploaded export files.
 *
 * Everything in here treats its input as hostile. An import file is attacker-
 * controlled by definition — it arrives as an upload, and a user can be talked
 * into importing one they did not create. So: validate the envelope before
 * decrypting, validate the plaintext after decrypting, and bound every list.
 *
 * Note this module is deliberately free of I/O. Host validation (SSRF) and the
 * database writes happen in the route, which can await; keeping the parsing
 * pure makes the interesting cases trivial to test.
 */

import {
    exportFileSchema,
    exportPayloadSchema,
    MAX_IMPORT_SERVERS,
    type ExportPayload,
    type ExportedServer,
} from './format';
import { openPayload, WrongPassphraseError } from './envelope';

export { WrongPassphraseError };

export class InvalidFileError extends Error {
    constructor(message = 'This file is not a valid Termix export.') {
        super(message);
        this.name = 'InvalidFileError';
    }
}

/** Thrown when the file is encrypted but no passphrase was supplied. */
export class PassphraseRequiredError extends Error {
    constructor() {
        super('This export is encrypted. Enter the passphrase used to create it.');
        this.name = 'PassphraseRequiredError';
    }
}

/**
 * Validate an uploaded JSON export and return its payload.
 *
 * @param raw - the parsed JSON, straight from the upload
 * @param passphrase - required only when the file is encrypted
 */
export function parseExportFile(raw: unknown, passphrase?: string): ExportPayload {
    const file = exportFileSchema.safeParse(raw);

    if (!file.success) {
        throw new InvalidFileError();
    }

    if (!file.data.encrypted) {
        return file.data.payload;
    }

    if (!passphrase) {
        throw new PassphraseRequiredError();
    }

    // Throws WrongPassphraseError on a GCM tag mismatch; the caller maps that
    // to a 400 so a wrong passphrase reads as user error, not server error.
    return openPayload(file.data.payload, file.data.kdf, passphrase);
}

// CSV

/**
 * Split CSV text into rows of fields (RFC 4180).
 *
 * Hand-written because the one case that matters is the one naive splitters get
 * wrong: a private key is a quoted field containing newlines, so splitting on
 * `\n` before parsing quotes would shred it.
 */
export function parseCsv(text: string): string[][] {
    // Strip the UTF-8 BOM our own export writes, and normalise line endings.
    const input = text.replace(/^﻿/, '');

    const rows: string[][] = [];
    let row: string[] = [];
    let field = '';
    let inQuotes = false;

    for (let i = 0; i < input.length; i++) {
        const ch = input[i];

        if (inQuotes) {
            if (ch === '"') {
                if (input[i + 1] === '"') {
                    field += '"'; // escaped quote
                    i++;
                } else {
                    inQuotes = false;
                }
            } else {
                field += ch;
            }
            continue;
        }

        if (ch === '"') {
            inQuotes = true;
        } else if (ch === ',') {
            row.push(field);
            field = '';
        } else if (ch === '\r') {
            // swallow; the \n that follows ends the row
        } else if (ch === '\n') {
            row.push(field);
            rows.push(row);
            row = [];
            field = '';
        } else {
            field += ch;
        }
    }

    // Flush a trailing row that had no terminating newline.
    if (field.length > 0 || row.length > 0) {
        row.push(field);
        rows.push(row);
    }

    return rows;
}

/** Header label → payload field, matched case-insensitively. */
const CSV_HEADERS: Record<string, string> = {
    name: 'name',
    group: 'groupName',
    protocol: 'protocol',
    host: 'host',
    port: 'port',
    username: 'username',
    description: 'description',
    tags: 'tags',
    favorite: 'isFavorite',
    password: 'password',
    'private key': 'privateKey',
    'key passphrase': 'passphrase',
    notes: 'notes',
};

/**
 * Undo the apostrophe that the spreadsheet writer adds to neutralise formulas,
 * so a round-trip through Excel does not permanently scar the data.
 */
function unsanitize(value: string): string {
    return value.startsWith("'") ? value.slice(1) : value;
}

/**
 * Build a payload from CSV text produced by our spreadsheet export.
 *
 * Import accepts CSV but not .xlsx: reading a workbook means unzipping and
 * parsing XML from an untrusted archive, which is a meaningfully larger attack
 * surface than a text file. Excel can "Save As" CSV in one step.
 */
export function parseCsvExport(text: string): ExportPayload {
    const rows = parseCsv(text).filter((r) => r.some((cell) => cell.trim() !== ''));

    if (rows.length < 2) {
        throw new InvalidFileError('The file has no data rows.');
    }
    if (rows.length - 1 > MAX_IMPORT_SERVERS) {
        throw new InvalidFileError(`An import is limited to ${MAX_IMPORT_SERVERS} servers.`);
    }

    const headers = rows[0].map((h) => CSV_HEADERS[h.trim().toLowerCase()] ?? null);

    if (!headers.includes('name') || !headers.includes('host')) {
        throw new InvalidFileError('The file needs at least "Name" and "Host" columns.');
    }

    const servers = rows.slice(1).map((row) => {
        const record: Record<string, unknown> = {};

        headers.forEach((field, i) => {
            if (!field) return; // unrecognised column — ignore rather than fail
            const value = unsanitize((row[i] ?? '').trim());
            if (value === '') return;

            switch (field) {
                case 'port':
                    record.port = Number.parseInt(value, 10);
                    break;
                case 'tags':
                    record.tags = value
                        .split(',')
                        .map((t) => t.trim())
                        .filter(Boolean);
                    break;
                case 'isFavorite':
                    record.isFavorite = /^(true|yes|1)$/i.test(value);
                    break;
                case 'protocol':
                    record.protocol = value.toUpperCase();
                    break;
                default:
                    record[field] = value;
            }
        });

        // A CSV written by hand will omit these; fall back to sane defaults so
        // the row validates instead of rejecting the whole file.
        record.port ??= defaultPort(String(record.protocol ?? ''));
        record.protocol ??= 'SSH';
        record.username ??= 'root';

        return record;
    });

    const parsed = exportPayloadSchema.safeParse({ groups: [], servers });

    if (!parsed.success) {
        const issue = parsed.error.issues[0];
        const rowNumber = typeof issue?.path[1] === 'number' ? issue.path[1] + 2 : undefined;
        throw new InvalidFileError(
            rowNumber
                ? `Row ${rowNumber}: ${issue.message} (${issue.path.slice(2).join('.')})`
                : 'The file could not be read as a server list.',
        );
    }

    return withDerivedGroups(parsed.data);
}

function defaultPort(protocol: string): number {
    switch (protocol.toUpperCase()) {
        case 'RDP':
            return 3389;
        case 'VNC':
            return 5900;
        case 'TELNET':
            return 23;
        default:
            return 22;
    }
}

/** Recreate the group list from whatever group names the rows referenced. */
function withDerivedGroups(payload: ExportPayload): ExportPayload {
    const names = new Set(
        payload.servers.map((s) => s.groupName).filter((n): n is string => Boolean(n)),
    );

    return {
        servers: payload.servers,
        groups: [...names].map((name) => ({ name, description: null, color: null, icon: null })),
    };
}

// SUMMARY

export interface ImportSummary {
    total: number;
    withCredentials: number;
    groups: string[];
}

/** Describe a parsed payload, for the confirmation step before anything is written. */
export function summarise(payload: ExportPayload): ImportSummary {
    return {
        total: payload.servers.length,
        withCredentials: payload.servers.filter(hasCredentials).length,
        groups: payload.groups.map((g) => g.name),
    };
}

export function hasCredentials(server: ExportedServer): boolean {
    return Boolean(server.password || server.privateKey);
}
