import { describe, expect, it } from 'vitest';
import { detectFormat, parseMobaXterm, parsePuttyReg, parseSshConfig } from './foreign';
import { InvalidFileError, parseCsvExport } from './import';

const byName = <T extends { name: string }>(list: T[], name: string) =>
    list.find((s) => s.name === name)!;

describe('OpenSSH config', () => {
    const config = `
# global defaults come first in many files
ServerAliveInterval 30

Host bastion
    HostName bastion.example.com
    User ops
    Port 2222
    IdentityFile ~/.ssh/ops_ed25519

Host web-* !web-legacy
    User deploy

Host web-1
    HostName 10.0.1.11
    ProxyJump bastion

Host web-legacy
    HostName 10.0.1.99
    ProxyJump admin@jump.example.net:2200

Host db "db primary"
    HostName=db.internal
    ProxyCommand ssh -W %h:%p bastion

Host *.lab
    User lab

Host box.lab

Host chain
    HostName 10.9.9.9
    ProxyJump a,b

Host *
    User fallback
    Port 22

Match host foo
    User nobody
Include ~/.ssh/config.d/*
`;
    const { payload, notes, defaultedUsername } = parseSshConfig(config);
    const s = payload.servers;

    it('creates one server per concrete Host and applies first-match options', () => {
        expect(byName(s, 'bastion')).toMatchObject({
            host: 'bastion.example.com',
            username: 'ops',
            port: 2222,
            protocol: 'SSH',
        });
        // "Host web-*" matches web-1 before "Host *" does.
        expect(byName(s, 'web-1')).toMatchObject({
            host: '10.0.1.11',
            username: 'deploy',
            port: 22,
        });
        // …but the negation excludes web-legacy, which falls through to "Host *".
        expect(byName(s, 'web-legacy').username).toBe('fallback');
        expect(byName(s, 'box.lab')).toMatchObject({ host: 'box.lab', username: 'lab' });
        expect(byName(s, 'db').host).toBe('db.internal');
        expect(s.find((x) => x.name === 'db primary')).toBeUndefined();
    });

    it('turns ProxyJump into jump hosts, reusing an alias or adding the bastion', () => {
        expect(byName(s, 'web-1').jumpServerName).toBe('bastion');
        expect(byName(s, 'web-legacy').jumpServerName).toBe('jump.example.net');
        expect(byName(s, 'jump.example.net')).toMatchObject({
            host: 'jump.example.net',
            port: 2200,
            username: 'admin',
        });
        expect(byName(s, 'chain').jumpServerName).toBeFalsy();
    });

    it('explains what was not imported', () => {
        const all = notes.join('\n');
        expect(all).toContain('~/.ssh/ops_ed25519');
        expect(all).toMatch(/ProxyCommand/);
        expect(all).toMatch(/multi-hop/);
        expect(all).toMatch(/"Match" blocks were ignored/);
        expect(all).toMatch(/"Include"/);
        expect(defaultedUsername).toEqual([]);
    });

    it('fills a missing user with root and says so', () => {
        const r = parseSshConfig('Host solo\n  HostName 1.2.3.4\n');
        expect(r.payload.servers[0].username).toBe('root');
        expect(r.defaultedUsername).toEqual(['solo']);
        expect(r.notes.join()).toMatch(/no username/);
    });

    it('rejects a file with no hosts', () => {
        expect(() => parseSshConfig('Host *\n  User x\n')).toThrow(InvalidFileError);
    });
});

describe('PuTTY .reg', () => {
    const reg = `Windows Registry Editor Version 5.00

[HKEY_CURRENT_USER\\Software\\SimonTatham\\PuTTY\\Sessions]

[HKEY_CURRENT_USER\\Software\\SimonTatham\\PuTTY\\Sessions\\Default%20Settings]
"HostName"=""

[HKEY_CURRENT_USER\\Software\\SimonTatham\\PuTTY\\Sessions\\My%20Web%20Server]
"HostName"="deploy@web.example.com"
"PortNumber"=dword:00000016
"Protocol"="ssh"
"UserName"=""
"PublicKeyFile"="C:\\\\Users\\\\me\\\\web.ppk"

[HKEY_CURRENT_USER\\Software\\SimonTatham\\PuTTY\\Sessions\\router]
"HostName"="192.0.2.1"
"PortNumber"=dword:00000017
"Protocol"="telnet"
"UserName"="admin"

[HKEY_CURRENT_USER\\Software\\SimonTatham\\PuTTY\\Sessions\\console]
"HostName"=""
"Protocol"="serial"
`;

    it('reads sessions, names, ports and users', () => {
        const { payload, notes } = parsePuttyReg(reg);
        expect(payload.servers.map((x) => x.name)).toEqual(['My Web Server', 'router']);
        expect(byName(payload.servers, 'My Web Server')).toMatchObject({
            host: 'web.example.com',
            port: 22,
            username: 'deploy',
            protocol: 'SSH',
        });
        expect(byName(payload.servers, 'router')).toMatchObject({
            port: 23,
            protocol: 'TELNET',
            username: 'admin',
        });
        expect(notes.join()).toMatch(/console \(serial\)/);
        expect(notes.join()).toMatch(/\.ppk/);
    });

    it('works on the UTF-16 text reg export writes (decoded by the browser)', () => {
        const utf16 = Buffer.from('\uFEFF' + reg.replace(/\n/g, '\r\n'), 'utf16le');
        const decoded = new TextDecoder('utf-16le').decode(utf16);
        expect(parsePuttyReg(decoded).payload.servers).toHaveLength(2);
    });

    it('explains how to export when there are no sessions', () => {
        expect(() => parsePuttyReg('Windows Registry Editor Version 5.00\r\n')).toThrow(
            /reg export/,
        );
    });
});

describe('MobaXterm sessions', () => {
    const moba = [
        '[Bookmarks]',
        'SubRep=',
        'ImgNum=42',
        'bastion= #109#0%gw.example.com%22%ops%%-1%-1%%%%%0%0%0%%%-1%0%0%0%%1080%%0%0%1#MobaFont%10%0%0%-1%15%236,236,236%30,30,30%180,180,192%0%-1%0%%xterm%-1%0%_Std_Colors_0_%80%24%0%0%-1%<none>%%0%0%-1%-1#0# #-1',
        '',
        '[Bookmarks_1]',
        'SubRep=Prod\\Web',
        'ImgNum=41',
        'web 1= #109#0%10.0.0.5%2222%<default>%%-1%-1%%gw.example.com%22%ops%0%0%0%%%-1%0%0%0%%1080%%0%0%1#MobaFont%10%0%0%-1%15%236,236,236%30,30,30%180,180,192%0%-1%0%%xterm%-1%0%_Std_Colors_0_%80%24%0%0%-1%<none>%%0%0%-1%-1#0#Front __DIEZE__1#-1',
        'win= #91#4%win.example.com%3389%Administrator%0%-1%-1%-1%-1%0%0%-1%%%%%0%0%%-1%%-1%-1%0%-1%0%-1#MobaFont%10%0%0%-1%15%236,236,236%30,30,30%180,180,192%0%-1%0%%xterm%-1%0%_Std_Colors_0_%80%24%0%0%-1%<none>%%0%0%-1%-1#0# #-1',
        'desk= #128#5%desk.example.com%5901%0%0#MobaFont%10%0%0%-1%15%236,236,236%30,30,30%180,180,192%0%-1%0%%xterm%-1%0%_Std_Colors_0_%80%24%0%0%-1%<none>%%0%0%-1%-1#0# #-1',
        'files= #140#7%files.example.com%22%sftpuser%0%-1%%#MobaFont%10%0%0%-1%15#0# #-1',
        'mosh box= #145#12%m.example.com#MobaFont#0# #-1',
        '',
        '[Misc]',
        'not= #109#0%evil.example.com%22%x#MobaFont#0# #-1',
    ].join('\r\n');

    it('reads SSH, RDP, VNC and SFTP sessions with their folders', () => {
        const { payload } = parseMobaXterm(moba);
        const s = payload.servers;
        expect(s.map((x) => x.name).sort()).toEqual(['bastion', 'desk', 'files', 'web 1', 'win']);
        expect(byName(s, 'web 1')).toMatchObject({
            host: '10.0.0.5',
            port: 2222,
            username: 'root', // "<default>" means no username
            groupName: 'Prod / Web',
            description: 'Front #1',
            jumpServerName: 'bastion',
        });
        expect(byName(s, 'win')).toMatchObject({
            protocol: 'RDP',
            port: 3389,
            username: 'Administrator',
        });
        expect(byName(s, 'desk')).toMatchObject({ protocol: 'VNC', port: 5901 });
        expect(byName(s, 'files')).toMatchObject({ protocol: 'SCP', username: 'sftpuser' });
        expect(payload.groups.map((g) => g.name)).toEqual(['Prod / Web']);
    });

    it('notes skipped kinds and the missing passwords', () => {
        const { notes } = parseMobaXterm(moba);
        expect(notes.join('\n')).toMatch(/1 Mosh/);
        expect(notes.join('\n')).toMatch(/passwords/);
    });

    it('reads a single-session .moba file without a section', () => {
        const one = 'solo= #109#0%solo.example.com%22%me#MobaFont#0# #-1';
        expect(parseMobaXterm(one).payload.servers[0]).toMatchObject({
            host: 'solo.example.com',
            username: 'me',
        });
    });
});

describe('format detection and other tools’ CSV columns', () => {
    it('detects formats from name and content', () => {
        expect(detectFormat('config', 'Host a\n  HostName b')).toBe('ssh-config');
        expect(detectFormat('anything.txt', '\n\nHost web\n')).toBe('ssh-config');
        expect(detectFormat('putty.reg', '')).toBe('putty');
        expect(detectFormat('x', 'Windows Registry Editor Version 5.00')).toBe('putty');
        expect(detectFormat('s.mxtsessions', '')).toBe('mobaxterm');
        expect(detectFormat('MobaXterm.ini', '[Bookmarks]')).toBe('mobaxterm');
        expect(detectFormat('t.json', '{}')).toBe('json');
        expect(detectFormat('t.csv', 'a,b')).toBe('csv');
        expect(detectFormat('readme.txt', 'hello')).toBeNull();
    });

    it('reads CSVs that use Label / Hostname / User / Groups', () => {
        const csv =
            'Groups,Label,Tags,Hostname/IP,Protocol,Port,Username\nProd,api,"a,b",api.example.com,ssh,2200,deploy\n,,,10.0.0.9,SFTP,,\n';
        const p = parseCsvExport(csv);
        expect(p.servers[0]).toMatchObject({
            name: 'api',
            host: 'api.example.com',
            port: 2200,
            username: 'deploy',
            groupName: 'Prod',
            tags: ['a', 'b'],
        });
        // No label: named after the host. SFTP maps to Termi's file browser.
        expect(p.servers[1]).toMatchObject({ name: '10.0.0.9', protocol: 'SCP', port: 22 });
    });
});
