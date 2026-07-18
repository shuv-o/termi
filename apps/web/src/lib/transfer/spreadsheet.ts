/**
 * Minimal CSV and XLSX writers — no third-party dependencies.
 *
 * An .xlsx is a ZIP of XML parts, and everything we need (a single flat sheet
 * with a bold header row) is a few hundred lines. That is a better trade than
 * pulling a spreadsheet library and its transitive tree into an app whose whole
 * job is holding credentials.
 *
 * The CSV writer guards against spreadsheet formula injection — see
 * {@link sanitizeCell}. That matters more here than in a typical export: server
 * names, tags and notes are free text the user (or someone who shared a server
 * with them) controls, and the export is opened in Excel by definition.
 *
 * The XLSX writer deliberately does *not* sanitize. Formula injection is a
 * text-parsing problem: it exists because a spreadsheet app has to guess
 * whether `=A1` in a CSV is a formula or a string. OOXML has no such ambiguity
 * — a formula lives in an `<f>` element, and `<c t="inlineStr">` is a string by
 * declaration, which Excel will never evaluate. Sanitizing there would buy no
 * safety and would corrupt real data: every private key starts with `-----`,
 * which is a trigger character.
 */

import { deflateRawSync } from 'zlib';

export type CellValue = string | number | boolean | null | undefined;

export interface SheetColumn {
    header: string;
    /** Width in character units. Excel's default is ~8.43. */
    width?: number;
}

// FORMULA INJECTION

/**
 * Characters that make Excel, LibreOffice and Google Sheets treat a cell as a
 * formula rather than text. A cell starting with one of these can invoke DDE or
 * exfiltrate data via `=HYPERLINK(...)` the moment the file is opened.
 */
const FORMULA_TRIGGERS = ['=', '+', '-', '@', '\t', '\r'];

/**
 * Neutralise a value a spreadsheet would otherwise execute as a formula when
 * parsing a text file.
 *
 * Prefixing with an apostrophe is the standard mitigation: Excel strips it on
 * import and treats the remainder as literal text. We only touch strings that
 * actually start with a trigger, so ordinary data is untouched — and negative
 * numbers stay numeric because they are passed through as numbers, not strings.
 *
 * CSV only. See the module comment for why XLSX neither needs nor wants this.
 */
export function sanitizeCell(value: string): string {
    if (value.length === 0) return value;
    return FORMULA_TRIGGERS.includes(value[0]) ? `'${value}` : value;
}

// CSV

/**
 * Build an RFC 4180 CSV.
 *
 * A UTF-8 BOM is prepended because Excel otherwise reads a CSV as the system
 * ANSI codepage and mangles every non-ASCII character in a hostname or note.
 */
export function buildCsv(columns: SheetColumn[], rows: CellValue[][]): Buffer {
    const escape = (value: CellValue): string => {
        if (value === null || value === undefined) return '';
        if (typeof value === 'number') return String(value);
        if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';

        const safe = sanitizeCell(value);
        // Quote when the value contains a delimiter, quote or newline; doubling
        // any embedded quote per RFC 4180.
        return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
    };

    const lines = [
        columns.map((c) => escape(c.header)).join(','),
        ...rows.map((row) => row.map(escape).join(',')),
    ];

    return Buffer.concat([Buffer.from('﻿', 'utf8'), Buffer.from(lines.join('\r\n'), 'utf8')]);
}

// XML

/** Excel's hard limit on the length of a single cell's text. */
const MAX_CELL_CHARS = 32767;

/**
 * Strip characters XML 1.0 cannot represent, then escape the markup ones.
 *
 * Control characters are the practical concern: they can arrive inside a stored
 * note or a private key, and Excel rejects the entire workbook as corrupt
 * rather than skipping the offending cell.
 */
function escapeXml(value: string): string {
    return value
        .slice(0, MAX_CELL_CHARS)
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/** 0 → "A", 25 → "Z", 26 → "AA". */
export function columnLetter(index: number): string {
    let letter = '';
    let n = index;
    while (n >= 0) {
        letter = String.fromCharCode((n % 26) + 65) + letter;
        n = Math.floor(n / 26) - 1;
    }
    return letter;
}

function cellXml(ref: string, value: CellValue, styleIndex: number): string {
    const style = styleIndex ? ` s="${styleIndex}"` : '';

    if (value === null || value === undefined || value === '') {
        return `<c r="${ref}"${style}/>`;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
        return `<c r="${ref}"${style}><v>${value}</v></c>`;
    }
    if (typeof value === 'boolean') {
        return `<c r="${ref}"${style} t="b"><v>${value ? 1 : 0}</v></c>`;
    }

    // Inline strings avoid a sharedStrings.xml part entirely. Slightly larger
    // on disk, considerably simpler to get right. Declaring the type is also
    // what makes formula sanitisation unnecessary here.
    return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${escapeXml(
        String(value),
    )}</t></is></c>`;
}

function sheetXml(columns: SheetColumn[], rows: CellValue[][]): string {
    const cols = columns.some((c) => c.width)
        ? `<cols>${columns
              .map((c, i) =>
                  c.width
                      ? `<col min="${i + 1}" max="${i + 1}" width="${c.width}" customWidth="1"/>`
                      : '',
              )
              .join('')}</cols>`
        : '';

    const headerRow = `<row r="1">${columns
        .map((c, i) => cellXml(`${columnLetter(i)}1`, c.header, 1))
        .join('')}</row>`;

    const bodyRows = rows
        .map((row, r) => {
            const cells = row
                .map((value, i) => cellXml(`${columnLetter(i)}${r + 2}`, value, 0))
                .join('');
            return `<row r="${r + 2}">${cells}</row>`;
        })
        .join('');

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetPr><outlinePr summaryBelow="1" summaryRight="1"/></sheetPr><dimension ref="A1"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/>${cols}<sheetData>${headerRow}${bodyRows}</sheetData></worksheet>`;
}

// ZIP

/** CRC-32 (IEEE 802.3), the checksum every ZIP entry carries. */
const CRC_TABLE = (() => {
    const table = new Int32Array(256);
    for (let i = 0; i < 256; i++) {
        let c = i;
        for (let k = 0; k < 8; k++) {
            c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        }
        table[i] = c;
    }
    return table;
})();

function crc32(buf: Buffer): number {
    let crc = -1;
    for (let i = 0; i < buf.length; i++) {
        crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xff];
    }
    return (crc ^ -1) >>> 0;
}

interface ZipEntry {
    name: string;
    data: Buffer;
}

/**
 * Write a ZIP archive with deflate compression.
 *
 * Deliberately minimal: no zip64, no encryption, no directory entries. Export
 * files are far below the 4 GB / 65535-entry limits where any of that matters.
 */
function buildZip(entries: ZipEntry[], date: Date): Buffer {
    // MS-DOS timestamp — two packed 16-bit fields, seconds at 2s resolution.
    const dosTime =
        (date.getHours() << 11) |
        (date.getMinutes() << 5) |
        (Math.floor(date.getSeconds() / 2) & 0x1f);
    const dosDate =
        ((Math.max(date.getFullYear() - 1980, 0) & 0x7f) << 9) |
        ((date.getMonth() + 1) << 5) |
        date.getDate();

    const locals: Buffer[] = [];
    const centrals: Buffer[] = [];
    let offset = 0;

    for (const entry of entries) {
        const name = Buffer.from(entry.name, 'utf8');
        const compressed = deflateRawSync(entry.data);
        const crc = crc32(entry.data);

        const local = Buffer.alloc(30 + name.length);
        local.writeUInt32LE(0x04034b50, 0); // local file header signature
        local.writeUInt16LE(20, 4); // version needed
        local.writeUInt16LE(0, 6); // flags
        local.writeUInt16LE(8, 8); // method: deflate
        local.writeUInt16LE(dosTime, 10);
        local.writeUInt16LE(dosDate, 12);
        local.writeUInt32LE(crc, 14);
        local.writeUInt32LE(compressed.length, 18);
        local.writeUInt32LE(entry.data.length, 22);
        local.writeUInt16LE(name.length, 26);
        local.writeUInt16LE(0, 28); // extra field length
        name.copy(local, 30);

        const central = Buffer.alloc(46 + name.length);
        central.writeUInt32LE(0x02014b50, 0); // central directory signature
        central.writeUInt16LE(20, 4); // version made by
        central.writeUInt16LE(20, 6); // version needed
        central.writeUInt16LE(0, 8); // flags
        central.writeUInt16LE(8, 10); // method: deflate
        central.writeUInt16LE(dosTime, 12);
        central.writeUInt16LE(dosDate, 14);
        central.writeUInt32LE(crc, 16);
        central.writeUInt32LE(compressed.length, 20);
        central.writeUInt32LE(entry.data.length, 24);
        central.writeUInt16LE(name.length, 28);
        central.writeUInt16LE(0, 30); // extra field length
        central.writeUInt16LE(0, 32); // comment length
        central.writeUInt16LE(0, 34); // disk number
        central.writeUInt16LE(0, 36); // internal attributes
        central.writeUInt32LE(0, 38); // external attributes
        central.writeUInt32LE(offset, 42); // offset of local header
        name.copy(central, 46);

        locals.push(local, compressed);
        centrals.push(central);
        offset += local.length + compressed.length;
    }

    const centralDirectory = Buffer.concat(centrals);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0); // end of central directory signature
    end.writeUInt16LE(0, 4); // this disk
    end.writeUInt16LE(0, 6); // disk with central directory
    end.writeUInt16LE(entries.length, 8);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(centralDirectory.length, 12);
    end.writeUInt32LE(offset, 16);
    end.writeUInt16LE(0, 20); // comment length

    return Buffer.concat([...locals, centralDirectory, end]);
}

// WORKBOOK

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

const WORKBOOK_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;

/** Two cell formats: index 0 is the default, index 1 is bold (the header row). */
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

/**
 * Build a single-sheet .xlsx workbook.
 *
 * @param sheetName - tab name; Excel forbids `[]:*?/\` and caps it at 31 chars
 */
export function buildXlsx(
    sheetName: string,
    columns: SheetColumn[],
    rows: CellValue[][],
    date: Date,
): Buffer {
    const safeName = escapeXml(sheetName.replace(/[[\]:*?/\\]/g, '_').slice(0, 31)) || 'Sheet1';

    const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${safeName}" sheetId="1" r:id="rId1"/></sheets></workbook>`;

    return buildZip(
        [
            { name: '[Content_Types].xml', data: Buffer.from(CONTENT_TYPES, 'utf8') },
            { name: '_rels/.rels', data: Buffer.from(ROOT_RELS, 'utf8') },
            { name: 'xl/workbook.xml', data: Buffer.from(workbook, 'utf8') },
            { name: 'xl/_rels/workbook.xml.rels', data: Buffer.from(WORKBOOK_RELS, 'utf8') },
            { name: 'xl/styles.xml', data: Buffer.from(STYLES, 'utf8') },
            {
                name: 'xl/worksheets/sheet1.xml',
                data: Buffer.from(sheetXml(columns, rows), 'utf8'),
            },
        ],
        date,
    );
}
