import { describe, expect, it } from 'vitest';
import { REDACTED, redact } from './redact';

const clean = (s: string, known: string[] = []) => redact(s, known).text;

describe('redact: known secrets', () => {
    it('removes every exact occurrence, wherever it appears', () => {
        const pw = 'Tr0ub4dor&3';
        const r = redact(`echo ${pw} | sudo -S true\nlogin: ${pw}`, [pw]);
        expect(r.text).not.toContain(pw);
        expect(r.count).toBe(2);
    });

    it('removes a longer secret whole when it contains a shorter one', () => {
        expect(clean('key=abcd1234efgh', ['abcd', 'abcd1234efgh'])).not.toContain('efgh');
    });

    it('ignores secrets too short to match safely', () => {
        expect(clean('the cat sat', ['at'])).toBe('the cat sat');
    });

    it('treats regex characters in a secret literally', () => {
        expect(clean('pw is a.b*c(d)', ['a.b*c(d)'])).toBe(`pw is ${REDACTED}`);
    });
});

describe('redact: patterns', () => {
    const cases: [string, string, string][] = [
        [
            'private key block',
            '-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXk\n-----END OPENSSH PRIVATE KEY-----',
            'b3BlbnNzaC1rZXk',
        ],
        [
            'truncated private key',
            'cat id_rsa\n-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA',
            'MIIEowIBAAKCAQEA',
        ],
        ['URL credentials', 'postgres://app:S3cr3tPw@db:5432/app', 'S3cr3tPw'],
        ['bearer header', 'Authorization: Bearer abcdef0123456789xyz', 'abcdef0123456789xyz'],
        ['--password flag', 'pg_dump --password=hunter22 db', 'hunter22'],
        ['--token flag', 'gh auth login --token tok_998877665544', 'tok_998877665544'],
        ['mysql -p', 'mysql -u root -pRootPw99 app', 'RootPw99'],
        ['sshpass', "sshpass -p 'pw-1234' ssh host", 'pw-1234'],
        ['env assignment', 'DB_PASSWORD=supersecret42', 'supersecret42'],
        ['JSON secret', '{"api_key": "abc123def456"}', 'abc123def456'],
        ['YAML secret', 'client_secret: very-secret-value', 'very-secret-value'],
        ['shadow hash', 'root:$6$saltsalt$hashhashhash:19000:0:99999:7:::', 'hashhashhash'],
        ['AWS key id', 'AKIAIOSFODNN7EXAMPLE', 'AKIAIOSFODNN7EXAMPLE'],
        ['GitHub token', 'ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'ghp_aaaa'],
        ['Slack token', 'xoxb-1234567890-abcdefghij', 'xoxb-1234567890'],
        ['Anthropic key', 'sk-ant-api03-aaaaaaaaaaaaaaaaaaaaaaaa', 'sk-ant-api03'],
        ['OpenAI key', 'sk-proj-aaaaaaaaaaaaaaaaaaaaaaaa', 'sk-proj-aaaa'],
        ['Stripe key', 'sk_live_aaaaaaaaaaaaaaaaaaaa', 'sk_live_aaaa'],
        ['Google API key', 'AIzaSyAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'AIzaSy'],
        ['JWT', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.c2lnbmF0dXJlLXZhbHVl', 'c2lnbmF0dXJl'],
    ];
    it.each(cases)('%s', (_name, input, secret) => {
        const r = redact(input);
        expect(r.text).not.toContain(secret);
        expect(r.count).toBeGreaterThan(0);
    });

    it('keeps ordinary terminal output intact', () => {
        const out = [
            'Filesystem  Size  Used Avail Use% Mounted on',
            '/dev/sda1    80G   31G   46G  41% /',
            'commit 3f2a9c1d8e7b6a5f4e3d2c1b0a9f8e7d6c5b4a39',
            'ssh -p 2222 deploy@10.0.0.5',
            'Author: Alex Rivera <alex@example.com>',
            'nginx.service - A high performance web server',
        ].join('\n');
        expect(redact(out)).toEqual({ text: out, count: 0 });
    });

    it('does not count a value that is already redacted', () => {
        expect(redact(`PASSWORD=${REDACTED}`).count).toBe(0);
    });
});
