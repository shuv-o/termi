import type { Metadata } from 'next';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Globe, Laptop, Mail, Plus, Smartphone } from 'lucide-react';
import { Github, Linkedin } from '@/components/icons/brand';
import { Button } from '@/components/ui/button';
import DownloadDesktopButton from '@/components/landing/DownloadButton';
import FeatureExplorer from '@/components/landing/FeatureExplorer';
import { FEATURE_COUNT, FEATURE_GROUPS } from '@/components/landing/features';
import HowItWorks from '@/components/landing/HowItWorks';
import HeroWorkspace from '@/components/landing/HeroWorkspace';
import StarOnGitHub from '@/components/landing/StarOnGitHub';
import { getSession } from '@/lib/auth/session';
import { AUTHOR, REPO_URL, SITE_DESCRIPTION, SITE_NAME, SITE_TITLE } from '@/lib/seo';
import { getSiteUrl } from '@/lib/site';
import TerminalLogo from '@/components/common/Logo';

export const metadata: Metadata = {
    title: { absolute: SITE_TITLE },
    description: SITE_DESCRIPTION,
    alternates: { canonical: '/' },
    openGraph: {
        title: SITE_TITLE,
        description: SITE_DESCRIPTION,
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

    const nonce = (await headers()).get('x-nonce') ?? '';

    return (
        // The marketing page keeps its own look, whatever theme the visitor chose in the app.
        <div
            data-theme="night"
            data-accent="blue"
            className="min-h-dvh bg-background text-foreground"
        >
            <script
                type="application/ld+json"
                nonce={nonce}
                // JSON-LD for search engines: the app, its FAQ and the site.
                dangerouslySetInnerHTML={{ __html: structuredData() }}
            />
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
                            ['Features', '#features'],
                            ['Security', '#security'],
                            ['How it works', '#how-it-works'],
                            ['Download', '#download'],
                            ['Self-host', '#self-host'],
                            ['Questions', '#questions'],
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
                        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                            <Button size="lg" asChild>
                                <Link href="/register">Create account</Link>
                            </Button>
                            <DownloadDesktopButton compact />
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
                className="scroll-mt-14 border-t border-border bg-card px-4 py-20 sm:px-6 lg:py-28"
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

            <section
                id="how-it-works"
                className="scroll-mt-14 border-t border-border px-4 py-20 sm:px-6 lg:py-28"
            >
                <div className="mx-auto max-w-6xl">
                    <h2 className="text-[30px] font-semibold leading-tight tracking-[-0.02em] sm:text-[38px]">
                        How a connection is made
                    </h2>
                    <p className="mt-4 max-w-[56ch] text-muted-foreground">
                        Three steps, every time you open a terminal, a file browser or a desktop.
                    </p>
                    <div className="mt-12">
                        <HowItWorks />
                    </div>
                </div>
            </section>

            {/* Second highlight: working with other people. */}
            <section
                id="teams"
                className="scroll-mt-14 border-t border-border px-4 py-20 sm:px-6 lg:py-28"
            >
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
            <section
                id="features"
                className="scroll-mt-14 border-t border-border px-4 py-20 sm:px-6 lg:py-28"
            >
                <div className="mx-auto max-w-6xl">
                    <h2 className="text-[30px] font-semibold leading-tight tracking-[-0.02em] sm:text-[38px]">
                        Everything in Termi
                    </h2>
                    <p className="mt-4 max-w-[60ch] text-muted-foreground">
                        {FEATURE_COUNT} features, all free and open source, whether you use this
                        site or run Termi on your own server.
                    </p>
                    <div className="mt-12">
                        <FeatureExplorer />
                    </div>
                </div>
            </section>

            <section
                id="download"
                className="scroll-mt-14 border-t border-border bg-card px-4 py-20 sm:px-6 lg:py-24"
            >
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

            <section
                id="self-host"
                className="scroll-mt-14 border-t border-border px-4 py-20 sm:px-6 lg:py-28"
            >
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

            <section
                id="questions"
                className="scroll-mt-14 border-t border-border px-4 py-20 sm:px-6 lg:py-28"
            >
                <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[1fr_2fr] lg:gap-16">
                    <h2 className="text-[30px] font-semibold leading-tight tracking-[-0.02em] sm:text-[38px]">
                        Questions
                    </h2>
                    <div className="divide-y divide-border border-y border-border">
                        {QUESTIONS.map(([q, a]) => (
                            <details key={q} className="group py-1">
                                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 rounded-md py-4 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                                    {q}
                                    <Plus
                                        aria-hidden
                                        className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-45"
                                    />
                                </summary>
                                <p className="max-w-[64ch] pb-5 text-muted-foreground">{a}</p>
                            </details>
                        ))}
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
                            href="https://shuvoo.com"
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

const QUESTIONS: [string, string][] = [
    [
        'Is Termi free?',
        'Yes. Termi is open source under the MIT licence, and every feature is included, on this site or on your own server.',
    ],
    [
        'Where are my passwords and keys stored?',
        'In the database of the Termi you use, encrypted with AES-256-GCM. The encryption key is kept apart from the database, and each value is locked to its field and its owner, so a copy of the database alone reveals nothing.',
    ],
    [
        'Do my servers need anything installed?',
        'No. Termi connects with standard SSH, RDP, VNC and Telnet, and reads monitoring figures over SSH. Only SSH logins with a FIDO2 security key need one extra line in sshd_config.',
    ],
    [
        'What do I need to run my own?',
        'A machine with Docker and Docker Compose. The Compose file includes the database, the remote-desktop service and a reverse proxy, and the setup guide walks through the few settings to fill in.',
    ],
    [
        'Can I bring my servers from another SSH client?',
        'Yes. Import an OpenSSH config file, PuTTY or KiTTY sessions, MobaXterm sessions or a CSV, and preview exactly what will be added before anything is saved.',
    ],
    [
        'Can my team share servers without sharing passwords?',
        'Yes. Servers in a team vault can be opened by every member, but their credentials stay sealed to whoever added them. Removing someone ends their access and closes their open connections.',
    ],
    [
        'Does it work on a phone?',
        'Yes. Install it from the browser on iOS or Android. Terminals get a key row for Ctrl, Alt, Esc, Tab and arrows, and remote desktops turn touches into mouse clicks.',
    ],
    [
        'What happens if I lose my phone with my authenticator app?',
        'Sign in with one of the recovery codes you saved when turning on two-factor, or with a passkey, then set up two-factor again.',
    ],
];

/** Schema.org data: what Termi is, its questions and answers, and the site. */
function structuredData(): string {
    const site = getSiteUrl();
    const author = { '@type': 'Person', name: AUTHOR.name, url: AUTHOR.url, sameAs: AUTHOR.sameAs };
    const graph = [
        {
            '@type': 'WebSite',
            '@id': `${site}/#website`,
            url: site,
            name: SITE_NAME,
            description: SITE_DESCRIPTION,
            inLanguage: 'en',
            publisher: author,
        },
        {
            '@type': 'SoftwareApplication',
            '@id': `${site}/#software`,
            name: SITE_NAME,
            alternateName: SITE_TITLE,
            description: SITE_DESCRIPTION,
            url: site,
            applicationCategory: 'DeveloperApplication',
            applicationSubCategory: 'Remote access',
            operatingSystem: 'Web browser, macOS, Windows, Linux, iOS, Android',
            offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
            isAccessibleForFree: true,
            license: 'https://opensource.org/licenses/MIT',
            codeRepository: REPO_URL,
            downloadUrl: `${REPO_URL}/releases/latest`,
            installUrl: `${REPO_URL}#-quick-start`,
            softwareHelp: { '@type': 'CreativeWork', url: `${REPO_URL}/wiki` },
            screenshot: [
                `${site}/screenshots/dashboard.png`,
                `${site}/screenshots/split-panes.png`,
                `${site}/screenshots/mobile-dashboard.png`,
            ],
            featureList: FEATURE_GROUPS.flatMap((g) => g.features.map((f) => f.name)),
            author,
        },
        {
            '@type': 'FAQPage',
            '@id': `${site}/#questions`,
            mainEntity: QUESTIONS.map(([q, a]) => ({
                '@type': 'Question',
                name: q,
                acceptedAnswer: { '@type': 'Answer', text: a },
            })),
        },
    ];
    // `<` escaped so a string can never close the script element.
    return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(
        /</g,
        '\\u003c',
    );
}
