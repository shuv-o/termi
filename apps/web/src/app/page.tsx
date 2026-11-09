import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Globe, Laptop, Mail, Smartphone } from 'lucide-react';
import { Github, Linkedin } from '@/components/icons/brand';
import { Button } from '@/components/ui/button';
import DownloadDesktopButton from '@/components/landing/DownloadButton';
import HeroWorkspace from '@/components/landing/HeroWorkspace';
import StarOnGitHub from '@/components/landing/StarOnGitHub';
import { getSession } from '@/lib/auth/session';
import TerminalLogo from '@/components/common/Logo';

export const metadata: Metadata = {
    title: 'Termi - Secure Server Management',
    description:
        'Termi is an open-source, self-hosted platform for SSH, SFTP, RDP, VNC, Telnet and serial access from your browser, phone or desktop, with encrypted credentials, host key pinning, teams and single sign-on.',
    alternates: {
        canonical: '/',
    },
    openGraph: {
        title: 'Termi - Secure Server Management',
        description:
            'Open-source self-hosted platform to manage servers via SSH, SCP, RDP, and VNC from your browser. Built with AES-256-GCM encryption and TOTP 2FA.',
        url: '/',
        type: 'website',
    },
};

// Only ever redirect back into our own /panel routes — guards against the
// cookie somehow holding an absolute or protocol-relative URL.
const LAST_PATH_PATTERN = /^\/panel(\/[\w.~-]+)*\/?$/;

export default async function HomePage() {
    const session = await getSession();
    const isLoggedIn = session.isLoggedIn;

    if (isLoggedIn) {
        const cookieStore = await cookies();
        const lastPath = cookieStore.get('termi_last_path')?.value;
        redirect(lastPath && LAST_PATH_PATTERN.test(lastPath) ? lastPath : '/panel');
    }

    return (
        // The marketing page keeps its own look, whatever theme the visitor chose in the app.
        <div
            data-theme="night"
            data-accent="blue"
            className="min-h-dvh bg-background text-foreground"
        >
            <header
                className="fixed inset-x-0 top-0 z-50 border-b border-border bg-background/85 backdrop-blur-lg"
                style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
            >
                <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
                    <Link href="/" className="flex items-center gap-2.5">
                        <TerminalLogo width={26} height={26} className="rounded-md" />
                        <span className="text-[15px] font-semibold">Termi</span>
                    </Link>
                    <nav aria-label="Page" className="hidden items-center gap-6 text-sm md:flex">
                        {[
                            ['Security', '#security'],
                            ['Teams', '#teams'],
                            ['Features', '#features'],
                            ['Self-host', '#self-host'],
                            ['GitHub', 'https://github.com/shuv-o/termi'],
                        ].map(([label, href]) => (
                            <Link
                                key={href}
                                href={href}
                                className="text-muted-foreground transition-colors hover:text-foreground"
                            >
                                {label}
                            </Link>
                        ))}
                    </nav>
                    <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" asChild>
                            <Link href="/login">Sign in</Link>
                        </Button>
                        <Button size="sm" asChild>
                            <Link href="/register">Create account</Link>
                        </Button>
                    </div>
                </div>
            </header>

            <section className="px-4 pb-20 pt-28 sm:px-6 sm:pt-32 lg:pb-28">
                <div className="mx-auto grid max-w-6xl items-start gap-12 lg:grid-cols-[1fr_1.1fr] lg:gap-14">
                    <div className="lg:pt-6">
                        <p className="mb-5 text-sm text-muted-foreground">
                            Open source and self-hosted
                        </p>
                        <h1 className="text-[40px] font-semibold leading-[1.04] tracking-[-0.03em] sm:text-[56px]">
                            Every server you run, in one browser tab
                            <span aria-hidden className="cursor-block" />
                        </h1>
                        <p className="mt-6 max-w-[50ch] text-base leading-relaxed text-muted-foreground sm:text-lg">
                            Terminals, files and remote desktops for Linux and Windows, from a
                            laptop, a phone or the desktop app. Your passwords and keys stay
                            encrypted on your own server.
                        </p>
                        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                            <Button size="lg" asChild>
                                <Link href="/register">Create account</Link>
                            </Button>
                            <Button variant="outline" size="lg" asChild>
                                <Link href="#self-host">
                                    <Github />
                                    Self-host it
                                </Link>
                            </Button>
                        </div>
                        <ul
                            aria-label="Supported connections"
                            className="mt-10 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground"
                        >
                            {PROTOCOLS.map((p) => (
                                <li key={p.name} className="flex items-center gap-2">
                                    <span className={`h-2 w-2 rounded-full ${p.dot}`} />
                                    {p.name}
                                </li>
                            ))}
                        </ul>
                    </div>

                    <HeroWorkspace />
                </div>
            </section>

            {/* The most important part: what happens to a password, in order. */}
            <section
                id="security"
                className="border-t border-border bg-card px-4 py-20 sm:px-6 lg:py-28"
            >
                <div className="mx-auto max-w-6xl">
                    <div className="grid gap-10 lg:grid-cols-[1fr_1.4fr] lg:gap-14">
                        <div>
                            <h2 className="text-[30px] font-semibold leading-tight tracking-[-0.02em] sm:text-[38px]">
                                Built for the keys to your infrastructure
                            </h2>
                            <p className="mt-4 max-w-[46ch] text-muted-foreground">
                                What happens to a server password from the moment you save it. The
                                same holds for private keys, saved logins and recordings.
                            </p>
                        </div>
                        <ol className="ml-3.5 space-y-8 border-l border-border pl-8">
                            {PASSWORD_LIFE.map((step, i) => (
                                <li key={step.title} className="relative">
                                    <span className="data absolute -left-[46.5px] top-0 flex h-7 w-7 items-center justify-center rounded-full border border-border bg-card text-xs text-primary">
                                        {i + 1}
                                    </span>
                                    <h3 className="text-lg font-medium leading-7">{step.title}</h3>
                                    <p className="mt-1.5 max-w-[60ch] text-muted-foreground">
                                        {step.body}
                                    </p>
                                </li>
                            ))}
                        </ol>
                    </div>
                    <dl className="mt-16 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
                        {SIGN_IN.map((item) => (
                            <div key={item.title} className="bg-card p-5">
                                <dt className="font-medium">{item.title}</dt>
                                <dd className="mt-1 text-sm text-muted-foreground">{item.body}</dd>
                            </div>
                        ))}
                    </dl>
                </div>
            </section>

            {/* Second highlight: working with other people. */}
            <section id="teams" className="border-t border-border px-4 py-20 sm:px-6 lg:py-28">
                <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2 lg:gap-16">
                    <div>
                        <h2 className="text-[30px] font-semibold leading-tight tracking-[-0.02em] sm:text-[38px]">
                            Give your team access, not the passwords
                        </h2>
                        <p className="mt-4 max-w-[48ch] text-muted-foreground">
                            Put servers in a team vault and members connect with one click. The
                            credentials stay sealed to whoever added them, so nobody can read or
                            copy them, and removing someone closes their open connections too.
                        </p>
                        <table className="mt-8 w-full max-w-md text-sm">
                            <caption className="sr-only">What each team role can do</caption>
                            <tbody className="divide-y divide-border border-y border-border">
                                {ROLES.map(([role, can]) => (
                                    <tr key={role}>
                                        <th
                                            scope="row"
                                            className="w-24 py-3 pr-4 text-left align-top font-medium"
                                        >
                                            {role}
                                        </th>
                                        <td className="py-3 text-muted-foreground">{can}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <JoinPrompt />
                </div>
            </section>

            {/* Every capability, grouped, so nothing has to be hunted for. */}
            <section id="features" className="border-t border-border px-4 py-20 sm:px-6 lg:py-28">
                <div className="mx-auto max-w-6xl">
                    <h2 className="text-[30px] font-semibold leading-tight tracking-[-0.02em] sm:text-[38px]">
                        Everything in Termi
                    </h2>
                    <p className="mt-4 max-w-[56ch] text-muted-foreground">
                        Free and open source. Every feature is included, whether you use this site
                        or run Termi on your own server.
                    </p>
                    <div className="mt-14 grid gap-x-12 gap-y-14 md:grid-cols-2 lg:grid-cols-3">
                        {CAPABILITIES.map((group) => (
                            <section key={group.id} aria-labelledby={`cap-${group.id}`}>
                                <h3
                                    id={`cap-${group.id}`}
                                    className="flex items-center gap-2.5 border-b border-border pb-3 text-base font-semibold"
                                >
                                    <span className={`h-3.5 w-1 rounded-full ${group.bar}`} />
                                    {group.name}
                                </h3>
                                <dl className="mt-4 space-y-3.5">
                                    {group.items.map(([name, body]) => (
                                        <div key={name}>
                                            <dt className="text-[15px] font-medium">{name}</dt>
                                            <dd className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
                                                {body}
                                            </dd>
                                        </div>
                                    ))}
                                </dl>
                            </section>
                        ))}
                    </div>
                </div>
            </section>

            <section className="border-t border-border bg-card px-4 py-20 sm:px-6 lg:py-24">
                <div className="mx-auto max-w-6xl">
                    <h2 className="text-[30px] font-semibold leading-tight tracking-[-0.02em] sm:text-[38px]">
                        On whatever is in your hand
                    </h2>
                    <div className="mt-10 grid gap-10 md:grid-cols-3">
                        {DEVICES.map((d) => (
                            <div key={d.name} className="min-w-0">
                                <d.icon className="h-5 w-5 text-primary" />
                                <h3 className="mt-4 text-lg font-medium">{d.name}</h3>
                                <p className="mt-1.5 text-muted-foreground">{d.body}</p>
                                {d.download && (
                                    <div className="mt-6">
                                        <DownloadDesktopButton />
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            <StarOnGitHub />

            <section id="self-host" className="border-t border-border px-4 py-20 sm:px-6 lg:py-28">
                <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[1fr_1.3fr] lg:gap-16">
                    <div>
                        <h2 className="text-[30px] font-semibold leading-tight tracking-[-0.02em] sm:text-[38px]">
                            Run your own in a few minutes
                        </h2>
                        <p className="mt-4 max-w-[44ch] text-muted-foreground">
                            One Docker Compose file starts the web app, the gateway, the database
                            and the remote-desktop service. Nothing leaves your server, and there is
                            no telemetry.
                        </p>
                        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                            <Button size="lg" asChild>
                                <Link href="https://github.com/shuv-o/termi#-quick-start">
                                    Read the setup guide
                                </Link>
                            </Button>
                            <Button variant="outline" size="lg" asChild>
                                <Link href="/register">Use this site instead</Link>
                            </Button>
                        </div>
                    </div>
                    <ol className="min-w-0 overflow-hidden rounded-xl border border-border bg-[var(--terminal-bg)]">
                        {SETUP.map((step, i) => (
                            <li
                                key={step.cmd}
                                className="grid grid-cols-[1.5rem_1fr] gap-x-3 border-b border-border px-5 py-4 last:border-b-0"
                            >
                                <span className="data pt-px text-sm text-muted-foreground">
                                    {i + 1}
                                </span>
                                <div className="min-w-0">
                                    <p className="text-sm text-muted-foreground">{step.what}</p>
                                    <code className="data mt-1.5 block overflow-x-auto whitespace-pre text-[13px] text-foreground">
                                        {step.cmd}
                                    </code>
                                </div>
                            </li>
                        ))}
                    </ol>
                </div>
            </section>

            <footer
                className="border-t border-border px-4 py-8 sm:px-6"
                style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom, 0px))' }}
            >
                <div className="mx-auto flex max-w-6xl flex-col gap-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                    <p>
                        Termi is MIT licensed. Built by{' '}
                        <Link
                            href="https://github.com/shuv-o"
                            className="text-foreground underline-offset-4 hover:underline"
                            rel="noopener noreferrer"
                            target="_blank"
                        >
                            Shuvo
                        </Link>
                        .
                    </p>
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                        <Link href="/privacy" className="transition-colors hover:text-foreground">
                            Privacy
                        </Link>
                        <Link href="/security" className="transition-colors hover:text-foreground">
                            Security
                        </Link>
                        <Link
                            href="https://github.com/shuv-o"
                            aria-label="GitHub profile of Shuvo"
                            className="transition-colors hover:text-foreground"
                            rel="noopener noreferrer"
                            target="_blank"
                        >
                            <Github className="h-[18px] w-[18px]" />
                        </Link>
                        <Link
                            href="https://www.linkedin.com/in/shuv-o/"
                            aria-label="LinkedIn profile of Shuvo"
                            className="transition-colors hover:text-foreground"
                            rel="noopener noreferrer"
                            target="_blank"
                        >
                            <Linkedin className="h-[18px] w-[18px]" />
                        </Link>
                        <Link
                            href="mailto:shuvo.punam@gmail.com"
                            aria-label="Email Shuvo"
                            className="transition-colors hover:text-foreground"
                        >
                            <Mail className="h-[18px] w-[18px]" />
                        </Link>
                    </div>
                </div>
            </footer>
        </div>
    );
}

const PROTOCOLS = [
    { name: 'SSH', dot: 'bg-proto-ssh' },
    { name: 'SFTP', dot: 'bg-proto-scp' },
    { name: 'RDP', dot: 'bg-proto-rdp' },
    { name: 'VNC', dot: 'bg-proto-vnc' },
    { name: 'Telnet', dot: 'bg-proto-telnet' },
    { name: 'Serial', dot: 'bg-muted-foreground' },
];

const PASSWORD_LIFE = [
    {
        title: 'You save it',
        body: 'It is encrypted with AES-256-GCM and locked to its field and to your account, so even someone with write access to the database cannot move it somewhere readable. The key lives outside the database.',
    },
    {
        title: 'You connect',
        body: 'Termi decrypts it only to hand the gateway a five-minute, encrypted connection token. Your browser never receives the password, and showing a saved one again asks you to sign in again.',
    },
    {
        title: 'Termi checks the server',
        body: "The server's SSH host key is pinned on the first connection. If it ever changes, Termi refuses to connect, tells you, and lets you review the new key.",
    },
    {
        title: 'Access ends, the connection ends',
        body: 'Sign out a device, change your password, remove a share or a team member, and every terminal, desktop and tunnel that relied on it closes within seconds.',
    },
];

const SIGN_IN = [
    {
        title: 'Passkeys',
        body: 'Sign in with Touch ID, Windows Hello or a security key, or go passkey-only.',
    },
    { title: 'Two-factor', body: 'An authenticator app or emailed codes, with recovery codes.' },
    {
        title: 'Single sign-on',
        body: 'Okta, Entra ID, Google Workspace, Keycloak or any OpenID Connect provider.',
    },
    {
        title: 'App lock',
        body: 'Locks after you step away. Open terminals pause until you unlock.',
    },
];

const ROLES: [string, string][] = [
    ['Owner', 'Manages roles and the team, and everything an admin can do.'],
    ['Admin', 'Invites and removes members, and manages the vault.'],
    ['Member', 'Connects to team servers and adds their own.'],
];

/** The in-terminal prompt a session owner sees when someone opens their share link. */
function JoinPrompt() {
    return (
        <figure className="min-w-0">
            <div
                aria-hidden
                className="overflow-hidden rounded-xl border border-border bg-[var(--terminal-bg)] shadow-[var(--shadow-float)]"
            >
                <div className="data p-5 text-[13px] leading-[1.75]">
                    <p>
                        <span className="text-proto-ssh">deploy@db-primary</span>
                        <span className="text-muted-foreground">:~$ </span>
                        <span className="text-foreground">tail -f /var/log/postgresql.log</span>
                    </p>
                    <p className="text-muted-foreground">
                        LOG: checkpoint complete: wrote 412 buffers
                    </p>
                    <p className="text-muted-foreground">LOG: connection authorized: user=app</p>
                </div>
                <div className="border-t border-border bg-card p-5">
                    <p className="font-medium">maria@acme.dev wants to join this terminal</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                        She asked to watch and type. She will see the screen, never the password.
                    </p>
                    <div className="mt-4 flex gap-2">
                        <span className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">
                            Let in
                        </span>
                        <span className="rounded-md border border-border px-3 py-1.5 text-sm">
                            Refuse
                        </span>
                    </div>
                </div>
            </div>
            <figcaption className="mt-3 text-sm text-muted-foreground">
                Shared terminals: send a link, then let each person in yourself.
            </figcaption>
        </figure>
    );
}

const CAPABILITIES: {
    id: string;
    name: string;
    bar: string;
    items: [string, string][];
}[] = [
    {
        id: 'connect',
        name: 'Connect',
        bar: 'bg-proto-ssh',
        items: [
            [
                'SSH terminal',
                'Full xterm with colour, Unicode and search. Keeps running after you close the tab.',
            ],
            [
                'Files over SFTP',
                'Browse, upload, download, rename and delete, beside the terminal.',
            ],
            [
                'Remote desktop',
                'Windows over RDP and Linux over VNC, with clipboard sync and touch controls.',
            ],
            [
                'Telnet and serial',
                'Older network gear over Telnet, or a USB console cable straight from the browser.',
            ],
            ['Jump hosts', 'Reach servers behind a bastion, like ssh -J, for every protocol.'],
            [
                'Port forwarding',
                'Local, SOCKS and remote forwards, with a one-click link for web apps.',
            ],
        ],
    },
    {
        id: 'work',
        name: 'Work faster',
        bar: 'bg-proto-scp',
        items: [
            [
                'Split panes and workspaces',
                'Up to four sessions at once, saved as named layouts you reopen in a click.',
            ],
            ['Type in all panes', 'Send the same keystrokes to every visible terminal.'],
            ['Snippets', 'Saved commands with variables you fill in each time, safely quoted.'],
            [
                'Command suggestions',
                'Completions from your own history on that server, kept in your browser.',
            ],
            [
                'Run on many servers',
                'One command across a group or a selection, with each server’s output.',
            ],
            ['Command palette', 'Jump to any server, page or setting with ⌘K.'],
        ],
    },
    {
        id: 'security',
        name: 'Server security',
        bar: 'bg-primary',
        items: [
            [
                'Known hosts',
                'Every server’s pinned host key in one list, checked on each connection.',
            ],
            [
                'Certificates and agent forwarding',
                'OpenSSH certificates, and key forwarding you can approve use by use.',
            ],
            [
                'Security keys for SSH',
                'A YubiKey or other FIDO2 key as an SSH key: one touch per login.',
            ],
            [
                'One-click hardening',
                'Scan a server, get a score, and fix SSH and the firewall with automatic rollback.',
            ],
            ['Recordings', 'Record a terminal and replay it later, encrypted at rest.'],
            ['History', 'Every connection you opened and every sign-in, visible only to you.'],
        ],
    },
    {
        id: 'people',
        name: 'Teams and sharing',
        bar: 'bg-proto-vnc',
        items: [
            [
                'Team vaults',
                'Shared servers with owner, admin and member roles, and email invitations.',
            ],
            [
                'Share a server',
                'Give one person connect access by email, and take it back any time.',
            ],
            [
                'Shared terminals',
                'Invite someone to watch or type in your session, after you let them in.',
            ],
            ['Signed-in devices', 'See every device on your account and sign any of them out.'],
        ],
    },
    {
        id: 'monitor',
        name: 'Monitoring',
        bar: 'bg-proto-telnet',
        items: [
            ['Live metrics', 'CPU, memory and disk for every SSH server, beside the terminal.'],
            [
                'Alerts',
                'Email, push notifications or a webhook to Slack or Discord when a server goes down.',
            ],
            ['Health history', 'Charts of each server over time.'],
            ['Benchmarks', 'Score a server’s CPU, disk and network, and track it over time.'],
        ],
    },
    {
        id: 'yours',
        name: 'Make it yours',
        bar: 'bg-proto-rdp',
        items: [
            [
                'Themes and layout',
                'Night, Black or Day, accent colours, and the menu as a sidebar, rail or top bar.',
            ],
            ['Terminal look', 'Colour schemes, fonts, size and cursor, synced to every device.'],
            [
                'Import your servers',
                'From ~/.ssh/config, PuTTY, MobaXterm or a CSV, with a preview first.',
            ],
            ['Export', 'Your servers as a passphrase-encrypted file or a spreadsheet.'],
        ],
    },
];

const DEVICES = [
    {
        name: 'Browser',
        icon: Globe,
        body: 'Nothing to install. Every feature works in any modern browser.',
    },
    {
        name: 'Phone',
        icon: Smartphone,
        body: 'Install it from the browser. A key row adds Ctrl, Esc, Tab and arrows, so a phone is enough in an emergency.',
    },
    {
        name: 'Desktop app',
        icon: Laptop,
        body: 'macOS, Windows and Linux, on Intel and ARM. Adds a local terminal and keeps port forwards running in the background.',
        download: true,
    },
];

const SETUP = [
    { what: 'Get the code', cmd: 'git clone https://github.com/shuv-o/termi.git && cd termi' },
    { what: 'Set your secrets', cmd: 'cp .env.example .env' },
    { what: 'Start everything', cmd: 'docker compose up -d' },
];
