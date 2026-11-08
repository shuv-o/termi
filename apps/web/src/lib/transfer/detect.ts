/**
 * Import file format detection. Kept dependency-free: the import dialog runs
 * it in the browser, where the parsers' server-side imports can't go.
 */

export type ForeignFormat = 'ssh-config' | 'putty' | 'mobaxterm';

/** Guess a file's format from its name and content. */
export function detectFormat(
    fileName: string,
    text: string,
): ForeignFormat | 'json' | 'csv' | null {
    const name = fileName.toLowerCase();
    const head = text.replace(/^\uFEFF/, '').trimStart().slice(0, 4096);
    if (name.endsWith('.json') || head.startsWith('{')) return 'json';
    if (name.endsWith('.reg') || /^Windows Registry Editor|^REGEDIT4/i.test(head)) return 'putty';
    if (/\.(mxtsessions|moba|ini)$/.test(name) || /^\[Bookmarks/im.test(head)) return 'mobaxterm';
    if (name.endsWith('.csv')) return 'csv';
    if (/^\s*(Host|Match)\s+\S/im.test(head) || name === 'config' || name.endsWith('.conf')) {
        return 'ssh-config';
    }
    if (head.includes(',')) return 'csv';
    return null;
}
