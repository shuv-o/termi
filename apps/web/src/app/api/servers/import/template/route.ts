/**
 * GET /api/servers/import/template?format=csv|json|xlsx
 *
 * Returns a blank, ready-to-edit import template in the requested format. This
 * is the only way to obtain an .xlsx template: a spreadsheet is a ZIP of XML
 * that the browser cannot assemble, so it is built here.
 *
 * The template contains nothing but public example rows — no user data — but it
 * still requires a session, since it is only ever offered inside the app.
 */

import { NextRequest } from 'next/server';

import { getCurrentUser } from '@/lib/auth';
import { errorResponse, unauthorizedResponse } from '@/lib/api';
import { buildXlsx, buildCsv, SAMPLE_COLUMNS, SAMPLE_ROWS, SAMPLE_JSON } from '@/lib/transfer';

export async function GET(request: NextRequest) {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    const format = new URL(request.url).searchParams.get('format') ?? 'csv';

    const columns = SAMPLE_COLUMNS.map((header) => ({ header }));
    // Stable date so the file is byte-identical between requests (aids caching
    // and avoids Date.now noise); the value is cosmetic in a template.
    const stamp = new Date('2026-01-01T00:00:00.000Z');

    let body: Buffer;
    let contentType: string;
    let filename: string;

    switch (format) {
        case 'xlsx':
            body = buildXlsx('Termi Servers', columns, SAMPLE_ROWS, stamp);
            contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
            filename = 'termi-import-template.xlsx';
            break;
        case 'json':
            body = Buffer.from(SAMPLE_JSON, 'utf8');
            contentType = 'application/json';
            filename = 'termi-import-template.json';
            break;
        case 'csv':
            body = buildCsv(columns, SAMPLE_ROWS);
            contentType = 'text/csv; charset=utf-8';
            filename = 'termi-import-template.csv';
            break;
        default:
            return errorResponse('format must be one of: csv, json, xlsx', 400);
    }

    return new Response(new Uint8Array(body), {
        status: 200,
        headers: {
            'Content-Type': contentType,
            'Content-Disposition': `attachment; filename="${filename}"`,
            'Content-Length': String(body.length),
            'X-Content-Type-Options': 'nosniff',
        },
    });
}
