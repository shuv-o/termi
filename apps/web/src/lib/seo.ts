/**
 * What search engines and link previews are told about Termi. One place for
 * the name, descriptions and keywords, and for which paths may be indexed.
 *
 * Self-hosted instances are usually private: `SEARCH_INDEXING=off` asks
 * search engines to skip the whole site (robots.txt, meta tags and an
 * X-Robots-Tag header on every response).
 */

export const SITE_NAME = 'Termi';

export const SITE_TITLE = 'Termi: self-hosted SSH, RDP and VNC in your browser';

export const SITE_DESCRIPTION =
    'Open-source, self-hosted remote access: SSH terminals, SFTP files, RDP and VNC desktops, Telnet and serial consoles from your browser, phone or desktop app. Encrypted credentials, host key pinning, teams, single sign-on and an AI assistant that never sees your secrets.';

export const SITE_KEYWORDS = [
    'self-hosted SSH client',
    'web SSH client',
    'browser SSH terminal',
    'SSH client',
    'SFTP client',
    'web-based file manager',
    'RDP client',
    'browser remote desktop',
    'VNC viewer',
    'Telnet client',
    'serial console',
    'SSH port forwarding',
    'jump host',
    'bastion',
    'server management',
    'server monitoring',
    'SSH key management',
    'FIDO2 SSH',
    'single sign-on SSH',
    'open source',
    'Docker',
    'homelab',
    'DevOps tools',
    'AI terminal assistant',
    'AI SSH assistant',
];

export const AUTHOR = {
    name: 'Shuvo',
    url: 'https://github.com/shuv-o',
    sameAs: ['https://github.com/shuv-o', 'https://www.linkedin.com/in/shuv-o/'],
};

export const REPO_URL = 'https://github.com/shuv-o/termi';

export function searchIndexingAllowed(): boolean {
    return process.env.SEARCH_INDEXING?.trim().toLowerCase() !== 'off';
}

/**
 * Paths that must never be indexed, whatever the setting: the signed-in app,
 * one-time links, the API and tunnels. Their pages render in the browser, so
 * the proxy marks them with an X-Robots-Tag header.
 */
export const PRIVATE_PATH_PREFIXES = [
    '/panel',
    '/api',
    '/tunnel',
    '/invitations',
    '/teams',
    '/reset-password',
    '/forgot-password',
    '/login',
    '/register',
];

export function isPrivatePath(pathname: string): boolean {
    return PRIVATE_PATH_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
