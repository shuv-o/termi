/**
 * Removes secrets from text before it reaches an AI provider or the stored
 * assistant history. Pure: the caller passes the secrets it knows about.
 *
 * Two layers:
 * 1. Exact secrets — every password, key and passphrase Termi holds for the
 *    user, and this server's own secrets. Catches anything, however unusual.
 * 2. Patterns — private-key blocks, credentials in URLs, `password=…`-style
 *    assignments, password flags on common commands, bearer tokens, shadow
 *    hashes and well-known token formats (cloud, Git hosts, chat, AI, payment).
 *
 * Erring towards removal is deliberate: a missing word costs a little
 * context, a leaked password cannot be taken back.
 */

export const REDACTED = '[redacted]';

export interface RedactResult {
    text: string;
    /** How many secrets were removed. */
    count: number;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Secrets shorter than this are too likely to match ordinary text. */
const MIN_EXACT = 4;

const SECRET_KEY =
    '[A-Za-z0-9_.-]*(?:passw(?:or)?d|passwd|pwd|passphrase|secret|token|api[_-]?key|apikey|access[_-]?key|private[_-]?key|client[_-]?secret|credentials?|auth[_-]?token|authorization|session[_-]?key|encryption[_-]?key|signing[_-]?key)[A-Za-z0-9_.-]*';

type Rule = [RegExp, string | ((...m: string[]) => string)];

const RULES: Rule[] = [
    // Private-key blocks, including one cut off before its END line.
    [
        /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z0-9 ]*PRIVATE KEY-----|$)/g,
        '[private key redacted]',
    ],
    // scheme://user:password@host
    [/\b([a-z][a-z0-9+.-]*:\/\/[^\s:/@'"]+:)([^\s@/'"]+)@/gi, (_m, pre) => `${pre}${REDACTED}@`],
    // Authorization: Bearer … / Basic …
    [/\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, (_m, kind) => `${kind} ${REDACTED}`],
    // --password=x / --password x / --token x …
    [
        /(--(?:password|passwd|pass|token|secret|api-key|apikey|access-key|secret-key|client-secret)(?:=|\s+))("[^"]*"|'[^']*'|\S+)/gi,
        (_m, flag) => `${flag}${REDACTED}`,
    ],
    // mysql -pSECRET (password glued to -p)
    [
        /\b((?:mysql|mysqldump|mysqladmin|mariadb|mariadb-dump)\b[^\n]*?\s-p)(?!\s)("[^"]*"|'[^']*'|\S+)/gi,
        (_m, pre) => `${pre}${REDACTED}`,
    ],
    // sshpass -p SECRET
    [/\b(sshpass\s+-p\s*)("[^"]*"|'[^']*'|\S+)/gi, (_m, pre) => `${pre}${REDACTED}`],
    // PASSWORD=x, "api_key": "x", secret: x, client_secret = 'x'
    [
        new RegExp(
            `(["']?${SECRET_KEY}["']?\\s*[:=]\\s*)("[^"\\n]*"|'[^'\\n]*'|[^\\s,;"'}]+)`,
            'gi',
        ),
        (_m, pre) => `${pre}${REDACTED}`,
    ],
    // /etc/shadow: user:$6$salt$hash:…
    [/^([^:\s]+):(\$[0-9a-z]+\$[^:\s]+):/gim, (_m, user) => `${user}:${REDACTED}:`],
    // Well-known token formats.
    [/\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, REDACTED],
    [/\bgh[pousr]_[A-Za-z0-9]{30,}\b/g, REDACTED],
    [/\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, REDACTED],
    [/\bglpat-[A-Za-z0-9_-]{20,}\b/g, REDACTED],
    [/\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g, REDACTED],
    [/\bsk-ant-[A-Za-z0-9_-]{20,}/g, REDACTED],
    [/\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}/g, REDACTED],
    [/\b[sr]k_(?:live|test)_[A-Za-z0-9]{16,}\b/g, REDACTED],
    [/\bAIza[0-9A-Za-z_-]{35}\b/g, REDACTED],
    [/\bnpm_[A-Za-z0-9]{30,}\b/g, REDACTED],
    [/\bdckr_pat_[A-Za-z0-9_-]{20,}\b/g, REDACTED],
    [/\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, REDACTED],
];

export function redact(input: string, knownSecrets: Iterable<string> = []): RedactResult {
    let text = input;
    let count = 0;

    // Longest first, so a secret that contains another is removed whole.
    const secrets = [...new Set(knownSecrets)]
        .map((s) => s.trim())
        .filter((s) => s.length >= MIN_EXACT)
        .sort((a, b) => b.length - a.length);
    for (const secret of secrets) {
        const re = new RegExp(escapeRe(secret), 'g');
        text = text.replace(re, () => {
            count++;
            return REDACTED;
        });
    }

    for (const [re, replacement] of RULES) {
        text = text.replace(re, (...args: string[]) => {
            const match = args[0];
            const out =
                typeof replacement === 'string'
                    ? replacement
                    : replacement(...(args as unknown as string[]));
            if (out !== match) count++;
            return out;
        });
    }

    return { text, count };
}
