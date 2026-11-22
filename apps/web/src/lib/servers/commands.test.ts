import { describe, it, expect } from 'vitest';
import {
    hostPort,
    sftpCommand,
    shellQuote,
    sshAlias,
    sshCommand,
    sshConfigEntry,
} from './commands';

const base = { host: 'web.example.com', port: 22, username: 'deploy' };

describe('sshCommand', () => {
    it('leaves the default port out', () => {
        expect(sshCommand(base)).toBe('ssh deploy@web.example.com');
        expect(sshCommand({ ...base, port: 2222 })).toBe('ssh -p 2222 deploy@web.example.com');
        expect(sshCommand({ ...base, username: null })).toBe('ssh web.example.com');
    });

    it('adds the jump host', () => {
        expect(
            sshCommand({
                ...base,
                jump: { host: 'bastion.example.com', port: 22, username: 'jump' },
            }),
        ).toBe('ssh -J jump@bastion.example.com deploy@web.example.com');
        expect(
            sshCommand({ ...base, jump: { host: '2001:db8::1', port: 2200, username: 'j' } }),
        ).toBe(
            // Brackets are glob characters, so the value is quoted.
            "ssh -J 'j@[2001:db8::1]:2200' deploy@web.example.com",
        );
    });

    it('quotes hostile values so the pasted command only runs ssh', () => {
        const cmd = sshCommand({ ...base, username: "x'; rm -rf ~; echo '" });
        expect(cmd).toBe(`ssh 'x'\\''; rm -rf ~; echo '\\''@web.example.com'`);
        expect(sshCommand({ ...base, host: '$(reboot)' })).toBe(`ssh 'deploy@$(reboot)'`);
    });
});

describe('sftpCommand', () => {
    it('uses -P and brackets IPv6', () => {
        expect(sftpCommand({ ...base, port: 2222 })).toBe('sftp -P 2222 deploy@web.example.com');
        expect(sftpCommand({ ...base, host: '2001:db8::5' })).toBe("sftp 'deploy@[2001:db8::5]'");
    });
});

describe('sshConfigEntry', () => {
    it('writes a Host block with ProxyJump', () => {
        expect(
            sshConfigEntry('Web 1 (prod)', {
                ...base,
                port: 2222,
                jump: { host: 'bastion.example.com', port: 22, username: 'jump' },
            }),
        ).toBe(
            [
                'Host web-1-prod',
                '    HostName web.example.com',
                '    User deploy',
                '    Port 2222',
                '    ProxyJump jump@bastion.example.com',
                '',
            ].join('\n'),
        );
    });

    it('drops values ssh_config cannot hold safely', () => {
        const entry = sshConfigEntry('x', { ...base, username: 'a b\nProxyCommand evil' });
        expect(entry).not.toContain('ProxyCommand');
        expect(entry).not.toContain('User');
    });
});

describe('helpers', () => {
    it('sshAlias never comes out empty', () => {
        expect(sshAlias('!!!')).toBe('server');
    });
    it('shellQuote leaves plain values alone', () => {
        expect(shellQuote('deploy@host')).toBe('deploy@host');
    });
    it('hostPort brackets IPv6', () => {
        expect(hostPort('::1', 3389)).toBe('[::1]:3389');
    });
});
