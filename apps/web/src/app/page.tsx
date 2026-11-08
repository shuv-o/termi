import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Activity, FolderOpen, Mail, Monitor, Smartphone, Terminal } from 'lucide-react';
import { Github, Linkedin } from '@/components/icons/brand';
import { Button } from '@/components/ui/button';
import DownloadDesktopButton from '@/components/landing/DownloadButton';
import StarOnGitHub from '@/components/landing/StarOnGitHub';
import { getSession } from '@/lib/auth/session';
import TerminalLogo from '@/components/common/Logo';

export const metadata: Metadata = {
    title: 'Termi - Secure Server Management',
    description:
        'Termi is an open-source, self-hosted server management platform. Access your Linux and Windows servers via SSH, SCP, RDP, and VNC directly from your browser with enterprise-grade security.',
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
        <div className="min-h-dvh bg-background">
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
                            ['What it does', '#features'],
                            ['Security', '#security'],
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

            {/* Hero: the headline on the left, and on the right the thing
                itself — a session pane with a real-looking shell in it. */}
            <section className="px-4 pb-16 pt-28 sm:px-6 sm:pt-32 lg:pb-24">
                <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1fr_1.05fr]">
                    <div>
                        <p className="mb-5 text-sm text-muted-foreground">
                            Open source, MIT licensed, self-hosted
                        </p>
                        <h1 className="text-[40px] font-semibold leading-[1.04] tracking-[-0.03em] sm:text-[56px]">
                            Every server you run, in one browser tab
                            <span aria-hidden className="cursor-block" />
                        </h1>
                        <p className="mt-6 max-w-[52ch] text-base leading-relaxed text-muted-foreground sm:text-lg">
                            Open SSH shells, move files over SCP, and drive Windows or Linux
                            desktops over RDP and VNC — from a laptop or a phone. Credentials are
                            encrypted with AES-256-GCM before they touch the database.
                        </p>
                        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                            <Button size="lg" asChild>
                                <Link href="/register">Create account</Link>
                            </Button>
                            <Button variant="outline" size="lg" asChild>
                                <Link href="https://github.com/shuv-o/termi">
                                    <Github />
                                    Self-host it
                                </Link>
                            </Button>
                        </div>
                        <div className="mt-10">
                            <p className="mb-3 text-[13px] text-muted-foreground">
                                Prefer a native window? Get the desktop app.
                            </p>
                            <DownloadDesktopButton />
                        </div>
                    </div>

                    <HeroConsole />
                </div>
            </section>

            {/* What it does: a spec sheet, not a grid of identical cards. */}
            <section id="features" className="border-t border-border px-4 py-16 sm:px-6 lg:py-24">
                <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[1fr_2fr]">
                    <div>
                        <h2 className="text-[28px] font-semibold leading-tight tracking-[-0.02em] sm:text-[32px]">
                            One place for every way in
                        </h2>
                        <p className="mt-3 max-w-[40ch] text-muted-foreground">
                            Linux, Windows and anything that speaks Telnet, from whichever device is
                            in your hand.
                        </p>
                    </div>
                    <dl className="divide-y divide-border border-y border-border">
                        {FEATURES.map((f) => (
                            <div
                                key={f.name}
                                className="grid gap-1 py-5 sm:grid-cols-[180px_1fr] sm:gap-6"
                            >
                                <dt className="flex items-center gap-2.5 font-medium">
                                    <f.icon className={`h-4 w-4 shrink-0 ${f.tone}`} />
                                    {f.name}
                                </dt>
                                <dd className="text-muted-foreground">{f.body}</dd>
                            </div>
                        ))}
                    </dl>
                </div>
            </section>

            <section
                id="security"
                className="border-t border-border bg-card px-4 py-16 sm:px-6 lg:py-24"
            >
                <div className="mx-auto max-w-6xl">
                    <h2 className="max-w-[24ch] text-[28px] font-semibold leading-tight tracking-[-0.02em] sm:text-[32px]">
                        Your keys stay yours
                    </h2>
                    <p className="mt-3 max-w-[60ch] text-muted-foreground">
                        Passwords, private keys and notes are encrypted before they are stored, and
                        each one is bound to the record it belongs to. The encryption key never
                        touches the database.
                    </p>
                    <div className="mt-10 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3">
                        {SECURITY.map((item) => (
                            <div key={item.title} className="bg-card p-5">
                                <p className="data text-lg font-medium text-primary">
                                    {item.title}
                                </p>
                                <p className="mt-1 text-sm text-muted-foreground">{item.body}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            <StarOnGitHub />

            <section className="border-t border-border px-4 py-16 sm:px-6 lg:py-24">
                <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 sm:flex-row sm:items-end">
                    <div>
                        <h2 className="text-[28px] font-semibold leading-tight tracking-[-0.02em] sm:text-[32px]">
                            Run your own in a few minutes
                        </h2>
                        <p className="mt-3 text-muted-foreground">
                            One Docker Compose file: the web app, the gateway and guacd.
                        </p>
                    </div>
                    <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                        <Button size="lg" asChild>
                            <Link href="/register">Create account</Link>
                        </Button>
                        <Button variant="outline" size="lg" asChild>
                            <Link href="https://github.com/shuv-o/termi">Read the setup guide</Link>
                        </Button>
                    </div>
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

const FEATURES = [
    {
        name: 'SSH',
        icon: Terminal,
        tone: 'text-proto-ssh',
        body: 'A full xterm terminal with colour, Unicode and every shortcut. Sessions survive a closed tab and reattach when you come back.',
    },
    {
        name: 'File transfer',
        icon: FolderOpen,
        tone: 'text-proto-scp',
        body: 'Browse, upload, download and edit files over SFTP, with a transfer queue that shows progress per file.',
    },
    {
        name: 'Remote desktop',
        icon: Monitor,
        tone: 'text-proto-rdp',
        body: 'Windows over RDP and Linux over VNC, rendered in the browser with clipboard sync.',
    },
    {
        name: 'On your phone',
        icon: Smartphone,
        tone: 'text-proto-vnc',
        body: 'An installable app with a terminal keyboard row for Ctrl, Esc, Tab and arrows, so a phone is enough in an emergency.',
    },
    {
        name: 'Monitoring',
        icon: Activity,
        tone: 'text-proto-telnet',
        body: 'CPU, memory and disk for every SSH server, with push, email and webhook alerts when one goes down.',
    },
];

const SECURITY = [
    { title: 'AES-256-GCM', body: 'Encryption for every stored credential.' },
    { title: 'scrypt', body: 'Memory-hard hashing for account passwords.' },
    { title: 'TOTP + passkeys', body: 'Two-factor sign-in with an app or a passkey.' },
];

/** The hero visual: a Termi session pane, drawn in the product's own chrome. */
function HeroConsole() {
    return (
        <div
            aria-hidden
            className="overflow-hidden rounded-xl border border-border bg-card shadow-xl"
        >
            <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
                {[
                    { name: 'web-01', proto: 'bg-proto-ssh', active: true },
                    { name: 'db-primary', proto: 'bg-proto-ssh', active: false },
                    { name: 'win-desktop', proto: 'bg-proto-rdp', active: false },
                ].map((t) => (
                    <span
                        key={t.name}
                        className={`data flex items-center gap-2 rounded-md px-2.5 py-1 text-xs ${
                            t.active ? 'bg-accent text-foreground' : 'text-muted-foreground'
                        } ${t.name === 'win-desktop' ? 'hidden sm:flex' : ''}`}
                    >
                        <span className={`h-1.5 w-1.5 rounded-full ${t.proto}`} />
                        {t.name}
                    </span>
                ))}
            </div>
            <div className="data bg-[var(--terminal-bg)] p-4 text-[12.5px] leading-[1.7] sm:p-5 sm:text-[13px]">
                <p>
                    <span className="text-proto-ssh">deploy@web-01</span>
                    <span className="text-muted-foreground">:~$ </span>
                    <span className="text-foreground">systemctl status nginx</span>
                </p>
                <p className="text-foreground/80">
                    <span className="text-success">●</span> nginx.service — A high performance web
                    server
                </p>
                <p className="text-muted-foreground">
                    {'   '}Active: <span className="text-success">active (running)</span> since Mon
                    09:12; 3 days ago
                </p>
                <p className="text-muted-foreground">{'   '}Memory: 18.4M</p>
                <p className="mt-2">
                    <span className="text-proto-ssh">deploy@web-01</span>
                    <span className="text-muted-foreground">:~$ </span>
                    <span className="inline-block h-[1.1em] w-[0.55em] translate-y-[0.2em] bg-primary" />
                </p>
            </div>
            <div className="grid grid-cols-3 divide-x divide-border border-t border-border text-xs">
                {[
                    ['CPU', '12%'],
                    ['Memory', '41%'],
                    ['Latency', '14 ms'],
                ].map(([k, v]) => (
                    <div key={k} className="px-4 py-2.5">
                        <p className="text-muted-foreground">{k}</p>
                        <p className="mt-0.5 font-medium tabular-nums text-foreground">{v}</p>
                    </div>
                ))}
            </div>
        </div>
    );
}
