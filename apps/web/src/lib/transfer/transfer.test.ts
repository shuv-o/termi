import { describe, it, expect, beforeAll } from 'vitest';
import { inflateRawSync } from 'zlib';

import { sanitizeCell, buildCsv, buildXlsx, columnLetter } from './spreadsheet';
import { sealPayload, openPayload, WrongPassphraseError } from './envelope';
import {
    parseCsv,
    parseCsvExport,
    parseExportFile,
    InvalidFileError,
    PassphraseRequiredError,
} from './import';
import { buildExportFile, buildPayload, buildSpreadsheet, type StoredServer } from './export';
import { SAMPLE_CSV, SAMPLE_JSON, SAMPLE_COLUMNS, SAMPLE_ROWS } from './samples';
import type { ExportPayload } from './format';
// Imported statically so the test encrypts through the same path the app does.
// (The system key is read lazily on first use, so importing before `beforeAll`
// sets ENCRYPTION_KEY is fine.)
import { encryptCredentials } from '@/lib/crypto/credentials';

// `lib/crypto` derives the system key from the environment on first use.
beforeAll(() => {
    process.env.ENCRYPTION_KEY ??= 'test-encryption-key-at-least-32-characters-long';
});

const NOW = new Date('2026-07-18T12:00:00.000Z');

function payload(overrides: Partial<ExportPayload['servers'][number]> = {}): ExportPayload {
    return {
        groups: [{ name: 'Production', description: null, color: null, icon: null }],
        servers: [
            {
                name: 'web-01',
                description: null,
                groupName: 'Production',
                host: 'example.com',
                port: 22,
                protocol: 'SSH',
                username: 'deploy',
                password: 'hunter2',
                privateKey: null,
                passphrase: null,
                notes: null,
                tags: ['prod'],
                color: null,
                icon: null,
                displayWidth: null,
                displayHeight: null,
                colorDepth: null,
                rdpSecurity: null,
                isFavorite: false,
                ...overrides,
            },
        ],
    };
}

// ZIP / XLSX

/** Minimal ZIP reader — walks local file headers and inflates each entry. */
function readZip(buf: Buffer): Map<string, string> {
    const files = new Map<string, string>();
    let offset = 0;

    while (offset + 4 <= buf.length && buf.readUInt32LE(offset) === 0x04034b50) {
        const method = buf.readUInt16LE(offset + 8);
        const compressedSize = buf.readUInt32LE(offset + 18);
        const nameLength = buf.readUInt16LE(offset + 26);
        const extraLength = buf.readUInt16LE(offset + 28);

        const nameStart = offset + 30;
        const name = buf.subarray(nameStart, nameStart + nameLength).toString('utf8');

        const dataStart = nameStart + nameLength + extraLength;
        const data = buf.subarray(dataStart, dataStart + compressedSize);

        files.set(name, (method === 8 ? inflateRawSync(data) : data).toString('utf8'));
        offset = dataStart + compressedSize;
    }

    return files;
}

describe('spreadsheet formula injection', () => {
    it.each(['=1+1', '+1', '-1', '@SUM(A1)', '\tx', '\rx'])('neutralises %j', (value) => {
        expect(sanitizeCell(value)).toBe(`'${value}`);
    });

    it('leaves ordinary values untouched', () => {
        expect(sanitizeCell('web-01')).toBe('web-01');
        expect(sanitizeCell('')).toBe('');
    });

    it('neutralises a formula that reached a CSV cell', () => {
        const csv = buildCsv(
            [{ header: 'Name' }],
            [['=HYPERLINK("http://evil","click")']],
        ).toString('utf8');
        // Quoted because it contains a comma and a quote — but the leading
        // apostrophe is what stops Excel executing it.
        expect(csv).toContain(`"'=HYPERLINK(""http://evil"",""click"")"`);
    });

    it('does not sanitise XLSX, where a declared string type is already safe', () => {
        // OOXML states the cell type explicitly, so `=cmd|calc` in an inlineStr
        // is never evaluated. Prefixing it would corrupt the value for nothing.
        const sheet = readZip(buildXlsx('S', [{ header: 'Name' }], [['=cmd|calc']], NOW)).get(
            'xl/worksheets/sheet1.xml',
        )!;

        expect(sheet).toContain('<t xml:space="preserve">=cmd|calc</t>');
        expect(sheet).not.toContain('&apos;=cmd');
    });

    it('keeps a private key byte-exact in XLSX despite its leading dashes', () => {
        // Regression: sanitising XLSX prefixed every exported key with an
        // apostrophe, because '-' is a formula trigger in text formats.
        const key = '-----BEGIN OPENSSH PRIVATE KEY-----\nbody\n-----END-----';
        const sheet = readZip(buildXlsx('S', [{ header: 'Key' }], [[key]], NOW)).get(
            'xl/worksheets/sheet1.xml',
        )!;

        expect(sheet).toContain(`<t xml:space="preserve">${key}</t>`);
    });
});

describe('buildCsv', () => {
    it('prepends a UTF-8 BOM so Excel reads it as UTF-8', () => {
        const csv = buildCsv([{ header: 'Name' }], [['café']]);
        expect(csv.subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
    });

    it('escapes embedded quotes and preserves newlines inside a field', () => {
        const csv = buildCsv([{ header: 'Key' }], [['line1\nline2 "quoted"']]).toString('utf8');
        expect(csv).toContain('"line1\nline2 ""quoted"""');
    });

    it('writes numbers and booleans without quoting', () => {
        const csv = buildCsv([{ header: 'Port' }, { header: 'Fav' }], [[22, true]]).toString(
            'utf8',
        );
        expect(csv.split('\r\n')[1]).toBe('22,TRUE');
    });
});

describe('buildXlsx', () => {
    it('produces a ZIP containing every part Excel requires', () => {
        const files = readZip(buildXlsx('Servers', [{ header: 'Name' }], [['web-01']], NOW));

        expect([...files.keys()].sort()).toEqual([
            '[Content_Types].xml',
            '_rels/.rels',
            'xl/_rels/workbook.xml.rels',
            'xl/styles.xml',
            'xl/workbook.xml',
            'xl/worksheets/sheet1.xml',
        ]);
    });

    it('writes well-formed XML with the data in place', () => {
        const files = readZip(
            buildXlsx('Servers', [{ header: 'Name' }, { header: 'Port' }], [['web-01', 22]], NOW),
        );
        const sheet = files.get('xl/worksheets/sheet1.xml')!;

        expect(sheet.startsWith('<?xml version="1.0"')).toBe(true);
        expect(sheet).toContain('<t xml:space="preserve">web-01</t>');
        expect(sheet).toContain('<c r="B2"><v>22</v></c>'); // numbers stay numeric
        // Every opened tag is closed — a cheap well-formedness check.
        expect((sheet.match(/<row /g) ?? []).length).toBe(2);
        expect((sheet.match(/<\/row>/g) ?? []).length).toBe(2);
    });

    it('escapes XML metacharacters rather than corrupting the sheet', () => {
        const sheet = readZip(buildXlsx('S', [{ header: 'Name' }], [['a & b <c> "d"']], NOW)).get(
            'xl/worksheets/sheet1.xml',
        )!;

        expect(sheet).toContain('a &amp; b &lt;c&gt; &quot;d&quot;');
    });

    it('strips control characters that would make Excel reject the file', () => {
        const sheet = readZip(
            buildXlsx('S', [{ header: 'Name' }], [['before\u0000\u0007after']], NOW),
        ).get('xl/worksheets/sheet1.xml')!;

        expect(sheet).toContain('beforeafter');
        expect(sheet).not.toContain('\u0000');
    });

    it('sanitises a sheet name Excel would refuse', () => {
        const workbook = readZip(buildXlsx('a/b:c*d', [{ header: 'x' }], [], NOW)).get(
            'xl/workbook.xml',
        )!;
        expect(workbook).toContain('name="a_b_c_d"');
    });
});

describe('columnLetter', () => {
    it.each([
        [0, 'A'],
        [25, 'Z'],
        [26, 'AA'],
        [51, 'AZ'],
        [52, 'BA'],
    ])('%i → %s', (index, expected) => {
        expect(columnLetter(index)).toBe(expected);
    });
});

// ENCRYPTION

describe('export envelope', () => {
    it('round-trips a payload through a passphrase', () => {
        const original = payload();
        const { kdf, payload: sealed } = sealPayload(original, 'correct horse battery staple');

        expect(openPayload(sealed, kdf, 'correct horse battery staple')).toEqual(original);
    });

    it('does not leave the secret recoverable from the ciphertext', () => {
        const { payload: sealed } = sealPayload(payload(), 'correct horse battery staple');
        const blob = JSON.stringify(sealed);

        expect(blob).not.toContain('hunter2');
        expect(blob).not.toContain('example.com');
    });

    it('rejects a wrong passphrase rather than returning garbage', () => {
        const { kdf, payload: sealed } = sealPayload(payload(), 'correct horse battery staple');

        expect(() => openPayload(sealed, kdf, 'wrong passphrase here')).toThrow(
            WrongPassphraseError,
        );
    });

    it('rejects a tampered ciphertext', () => {
        const { kdf, payload: sealed } = sealPayload(payload(), 'correct horse battery staple');

        // Flip a byte in the ciphertext; GCM's auth tag must catch it.
        const raw = Buffer.from(sealed.data, 'base64');
        raw[0] ^= 0xff;
        const tampered = { ...sealed, data: raw.toString('base64') };

        expect(() => openPayload(tampered, kdf, 'correct horse battery staple')).toThrow(
            WrongPassphraseError,
        );
    });

    it('uses a fresh salt per export, so identical data yields different files', () => {
        const a = sealPayload(payload(), 'correct horse battery staple');
        const b = sealPayload(payload(), 'correct horse battery staple');

        expect(a.kdf.salt).not.toBe(b.kdf.salt);
        expect(a.payload.data).not.toBe(b.payload.data);
    });
});

// FILE PARSING

describe('parseExportFile', () => {
    it('reads back a plaintext export', () => {
        const file = buildExportFile(payload(), { includesCredentials: true, now: NOW });
        expect(parseExportFile(file)).toEqual(payload());
    });

    it('reads back an encrypted export', () => {
        const file = buildExportFile(payload(), {
            includesCredentials: true,
            passphrase: 'correct horse battery staple',
            now: NOW,
        });
        expect(parseExportFile(file, 'correct horse battery staple')).toEqual(payload());
    });

    it('asks for a passphrase instead of failing opaquely', () => {
        const file = buildExportFile(payload(), {
            includesCredentials: true,
            passphrase: 'correct horse battery staple',
            now: NOW,
        });
        expect(() => parseExportFile(file)).toThrow(PassphraseRequiredError);
    });

    it.each([
        ['not an object', 42],
        ['a foreign format', { format: 'other-tool', version: 1 }],
        [
            'a future version',
            { ...buildExportFile(payload(), { includesCredentials: false, now: NOW }), version: 2 },
        ],
        [
            'a payload of the wrong shape',
            {
                format: 'termix-export',
                version: 1,
                exportedAt: NOW.toISOString(),
                includesCredentials: false,
                serverCount: 0,
                encrypted: false,
                payload: { groups: [], servers: [{ name: 'x' }] }, // missing host/port/etc.
            },
        ],
    ])('rejects %s', (_label, input) => {
        expect(() => parseExportFile(input)).toThrow(InvalidFileError);
    });

    it('rejects an out-of-range port smuggled into a file', () => {
        const file = buildExportFile(payload({ port: 99999 } as never), {
            includesCredentials: false,
            now: NOW,
        });
        expect(() => parseExportFile(file)).toThrow(InvalidFileError);
    });
});

// CSV PARSING

describe('parseCsv', () => {
    it('keeps newlines inside a quoted field intact', () => {
        const rows = parseCsv('Name,Key\r\nweb-01,"-----BEGIN-----\nabc\n-----END-----"\r\n');

        expect(rows).toHaveLength(2);
        expect(rows[1][1]).toBe('-----BEGIN-----\nabc\n-----END-----');
    });

    it('unescapes doubled quotes', () => {
        expect(parseCsv('a\r\n"say ""hi"""')[1][0]).toBe('say "hi"');
    });

    it('handles a final row with no trailing newline', () => {
        expect(parseCsv('a,b\r\n1,2')).toEqual([
            ['a', 'b'],
            ['1', '2'],
        ]);
    });
});

// The samples shown in the import dialog must stay importable — a broken
// example is worse than none. These parse the exact strings the UI advertises.
describe('import samples', () => {
    it('parses the CSV template the dialog offers', () => {
        const parsed = parseCsvExport(SAMPLE_CSV);

        expect(parsed.servers.map((s) => s.name)).toEqual(['prod-web', 'db-primary', 'gateway']);
        expect(parsed.servers[0]).toMatchObject({
            host: 'web.example.com',
            port: 22,
            protocol: 'SSH',
            username: 'deploy',
            groupName: 'Production',
            tags: ['web', 'prod'],
        });
        // A non-default port in the sample must survive.
        expect(parsed.servers.find((s) => s.name === 'gateway')?.port).toBe(2222);
        // Groups are derived from the rows.
        expect(parsed.groups.map((g) => g.name).sort()).toEqual(['Network', 'Production']);
    });

    it('parses the JSON template the dialog offers', () => {
        const parsed = parseExportFile(JSON.parse(SAMPLE_JSON));

        expect(parsed.servers).toHaveLength(1);
        expect(parsed.servers[0]).toMatchObject({
            name: 'prod-web',
            host: 'web.example.com',
            protocol: 'SSH',
            port: 22,
            username: 'deploy',
        });
    });

    it('keeps the structured sample (used for the Excel template) in sync with the CSV', () => {
        // The .xlsx template is built server-side from SAMPLE_COLUMNS/SAMPLE_ROWS;
        // if those drift from SAMPLE_CSV, the three tabs would describe different
        // servers. Build a CSV from the structured data and parse it back.
        const columns = SAMPLE_COLUMNS.map((header) => ({ header }));
        const csv = buildCsv(columns, SAMPLE_ROWS).toString('utf8');

        const fromStructured = parseCsvExport(csv);
        const fromCsvString = parseCsvExport(SAMPLE_CSV);

        expect(fromStructured.servers).toEqual(fromCsvString.servers);
    });
});

describe('parseCsvExport', () => {
    it('round-trips a payload through the CSV writer', () => {
        const csv = buildSpreadsheet(payload(), {
            format: 'csv',
            includesCredentials: true,
            now: NOW,
        }).toString('utf8');

        const parsed = parseCsvExport(csv);

        expect(parsed.servers).toHaveLength(1);
        expect(parsed.servers[0]).toMatchObject({
            name: 'web-01',
            host: 'example.com',
            port: 22,
            protocol: 'SSH',
            username: 'deploy',
            password: 'hunter2',
            groupName: 'Production',
            tags: ['prod'],
        });
        expect(parsed.groups.map((g) => g.name)).toEqual(['Production']);
    });

    it('strips the apostrophe the writer added, so a round-trip is lossless', () => {
        const csv = buildSpreadsheet(payload({ name: '=web-01' }), {
            format: 'csv',
            includesCredentials: false,
            now: NOW,
        }).toString('utf8');

        expect(parseCsvExport(csv).servers[0].name).toBe('=web-01');
    });

    it('requires the columns it cannot invent', () => {
        expect(() => parseCsvExport('Port,Username\r\n22,root')).toThrow(InvalidFileError);
    });

    it('rejects a file with only a header row', () => {
        expect(() => parseCsvExport('Name,Host')).toThrow(InvalidFileError);
    });

    it('ignores unrecognised columns rather than failing', () => {
        const parsed = parseCsvExport('Name,Host,Nonsense\r\nweb-01,example.com,ignored');
        expect(parsed.servers[0].name).toBe('web-01');
    });

    it('reports the offending row number', () => {
        expect(() => parseCsvExport('Name,Host,Port\r\nweb-01,example.com,not-a-port')).toThrow(
            /Row 2/,
        );
    });
});

// PAYLOAD CONSTRUCTION

describe('buildPayload', () => {
    /** A stored row with the encrypted-at-rest fields already encrypted. */
    function stored(): StoredServer {
        // Encrypt through the real path so the test exercises decryption too.
        const encrypted = encryptCredentials({
            host: 'example.com',
            username: 'deploy',
            password: 'hunter2',
            privateKey: 'PRIVATE-KEY-BODY',
            passphrase: 'key-pass',
            notes: 'internal notes',
        });

        return {
            name: 'web-01',
            description: null,
            ...encrypted,
            port: 22,
            protocol: 'SSH',
            tags: [],
            color: null,
            icon: null,
            displayWidth: null,
            displayHeight: null,
            colorDepth: null,
            rdpSecurity: null,
            isFavorite: false,
            group: null,
        } as StoredServer;
    }

    it('decrypts credentials when asked for them', () => {
        const result = buildPayload([stored()], { includeCredentials: true });

        expect(result.servers[0]).toMatchObject({
            host: 'example.com',
            username: 'deploy',
            password: 'hunter2',
            privateKey: 'PRIVATE-KEY-BODY',
            passphrase: 'key-pass',
            notes: 'internal notes',
        });
    });

    it('omits every secret when credentials are excluded', () => {
        const result = buildPayload([stored()], { includeCredentials: false });
        const server = result.servers[0];

        // Host and username are still needed to describe the server at all.
        expect(server.host).toBe('example.com');
        expect(server.username).toBe('deploy');

        expect(server.password).toBeNull();
        expect(server.privateKey).toBeNull();
        expect(server.passphrase).toBeNull();
        expect(server.notes).toBeNull();

        // Belt and braces: no secret survives anywhere in the serialised form.
        const blob = JSON.stringify(result);
        expect(blob).not.toContain('hunter2');
        expect(blob).not.toContain('PRIVATE-KEY-BODY');
        expect(blob).not.toContain('internal notes');
    });

    it('omits the credential columns entirely from a no-credentials spreadsheet', () => {
        const csv = buildSpreadsheet(buildPayload([stored()], { includeCredentials: false }), {
            format: 'csv',
            includesCredentials: false,
            now: NOW,
        }).toString('utf8');

        expect(csv.split('\r\n')[0]).not.toContain('Password');
        expect(csv).not.toContain('hunter2');
    });
});

describe('buildExportFile', () => {
    it('records what the file contains in its header', () => {
        const file = buildExportFile(payload(), { includesCredentials: true, now: NOW });

        expect(file).toMatchObject({
            format: 'termix-export',
            version: 1,
            encrypted: false,
            includesCredentials: true,
            serverCount: 1,
            exportedAt: NOW.toISOString(),
        });
    });

    it('marks an encrypted file and stores its KDF parameters', () => {
        const file = buildExportFile(payload(), {
            includesCredentials: true,
            passphrase: 'correct horse battery staple',
            now: NOW,
        });

        expect(file.encrypted).toBe(true);
        if (!file.encrypted) throw new Error('unreachable');
        expect(file.kdf.iterations).toBeGreaterThanOrEqual(600_000);
        expect(file.kdf.algorithm).toBe('pbkdf2');
    });
});
