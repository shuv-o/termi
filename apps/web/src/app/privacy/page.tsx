import type { Metadata } from 'next';
import Link from 'next/link';
import LegalShell, { Section, type TocItem } from '@/components/legal/LegalShell';

export const metadata: Metadata = {
    title: 'Privacy Policy',
    description:
        'How Termi handles your data. As an open-source, self-hosted platform, your data stays on infrastructure you control.',
    alternates: { canonical: '/privacy' },
    openGraph: {
        title: 'Privacy Policy | Termi',
        description:
            'How Termi handles your data. As an open-source, self-hosted platform, your data stays on infrastructure you control.',
        url: '/privacy',
        type: 'website',
    },
};

const toc: TocItem[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'data-we-store', label: 'Data we store' },
    { id: 'how-we-protect-it', label: 'How we protect it' },
    { id: 'data-we-dont-collect', label: "Data we don't collect" },
    { id: 'third-parties', label: 'Third-party services' },
    { id: 'cookies', label: 'Cookies & sessions' },
    { id: 'your-rights', label: 'Your rights' },
    { id: 'changes', label: 'Changes' },
    { id: 'contact', label: 'Contact' },
];

export default function PrivacyPage() {
    return (
        <LegalShell
            title="Privacy Policy"
            description="Termi is open-source and self-hosted. You run it, you own the data, and you control where it lives."
            lastUpdated="June 6, 2026"
            toc={toc}
        >
            <Section id="overview" title="Overview">
                <p>
                    Termi is an <strong>open-source, self-hosted</strong> server management
                    platform. There is no central Termi service that collects your data. When you
                    deploy Termi, it runs on infrastructure that <strong>you</strong> own and
                    operate, and all data it processes is stored in <strong>your</strong> database.
                </p>
                <p>
                    This policy describes what data a Termi instance handles so that you — as the
                    operator and as a user — understand exactly where your information goes. If you
                    are using someone else&apos;s Termi deployment, the operator of that instance
                    is the data controller, not the Termi project.
                </p>
            </Section>

            <Section id="data-we-store" title="Data we store">
                <p>
                    A Termi instance stores the following in the database you configure via{' '}
                    <code>DATABASE_URL</code>:
                </p>
                <ul>
                    <li>
                        <strong>Account data</strong> — your email address and an Argon2id hash of
                        your password (never the plaintext password).
                    </li>
                    <li>
                        <strong>Two-factor secrets</strong> — your TOTP secret and recovery codes,
                        used to verify 2FA.
                    </li>
                    <li>
                        <strong>Server connection details</strong> — hostnames, usernames,
                        passwords, private keys, passphrases, and notes for the servers you add.
                        These credential fields are <strong>AES-256-GCM encrypted</strong> before
                        they ever touch the database.
                    </li>
                    <li>
                        <strong>Organizational data</strong> — server groups, sharing invitations,
                        and share records you create.
                    </li>
                    <li>
                        <strong>Session records</strong> — encrypted session cookies (iron-session)
                        with a 7-day lifetime.
                    </li>
                    <li>
                        <strong>Push subscriptions</strong> — if you opt in to monitoring
                        notifications, the browser push endpoint required to deliver them.
                    </li>
                </ul>
            </Section>

            <Section id="how-we-protect-it" title="How we protect it">
                <ul>
                    <li>
                        All sensitive credential fields are encrypted at rest with{' '}
                        <strong>AES-256-GCM</strong>. An optional user master key adds a second
                        encryption layer derived with PBKDF2.
                    </li>
                    <li>
                        Passwords are hashed with <strong>Argon2id</strong>, never stored or logged
                        in plaintext.
                    </li>
                    <li>
                        Connections to your servers are brokered through short-lived{' '}
                        <strong>5-minute JWE tokens</strong> — credentials are decrypted only at
                        connection time and are never sent to the browser.
                    </li>
                    <li>
                        Server-Side Request Forgery (SSRF) protection validates every user-supplied
                        host before a connection is attempted.
                    </li>
                </ul>
                <p>
                    For the full technical breakdown, see the{' '}
                    <Link href="/security">Security page</Link>.
                </p>
            </Section>

            <Section id="data-we-dont-collect" title="Data we don't collect">
                <p>
                    The Termi project does not operate any analytics, tracking, or telemetry. There
                    is:
                </p>
                <ul>
                    <li>No analytics or behavioral tracking.</li>
                    <li>No advertising or third-party ad networks.</li>
                    <li>
                        No selling or sharing of personal data — there is no central party to do so.
                    </li>
                    <li>No phoning home — your instance does not transmit usage data to us.</li>
                </ul>
            </Section>

            <Section id="third-parties" title="Third-party services">
                <p>
                    A default Termi deployment talks only to the servers you choose to connect to
                    and the database you provide. Depending on the optional features you enable,
                    your instance may additionally communicate with:
                </p>
                <ul>
                    <li>
                        <strong>guacd</strong> (Apache Guacamole daemon) — required for RDP/VNC,
                        typically run alongside your instance on port 4822.
                    </li>
                    <li>
                        <strong>A web push service</strong> — your users&apos; browser vendor push
                        endpoints, used only if monitoring notifications are enabled.
                    </li>
                    <li>
                        <strong>An SMTP/email provider</strong> — if configured, used to send server
                        sharing invitations and password-reset emails.
                    </li>
                </ul>
                <p>
                    These integrations are configured by the instance operator. The Termi project
                    does not receive any data from them.
                </p>
            </Section>

            <Section id="cookies" title="Cookies & sessions">
                <p>
                    Termi uses a single <strong>encrypted, HTTP-only session cookie</strong>{' '}
                    (iron-session) to keep you signed in. It is strictly necessary for
                    authentication and is not used for tracking or advertising. The session expires
                    after 7 days, and signing out invalidates it.
                </p>
            </Section>

            <Section id="your-rights" title="Your rights">
                <p>
                    Because Termi is self-hosted, you and the instance operator have direct control
                    over all stored data:
                </p>
                <ul>
                    <li>
                        <strong>Access &amp; export</strong> — all data lives in your own database
                        and can be queried or exported directly.
                    </li>
                    <li>
                        <strong>Rectification</strong> — account details and server entries can be
                        edited at any time from the app.
                    </li>
                    <li>
                        <strong>Erasure</strong> — deleting your account or a server entry removes
                        the associated records from the database.
                    </li>
                </ul>
            </Section>

            <Section id="changes" title="Changes to this policy">
                <p>
                    We may update this policy as Termi evolves. Material changes are reflected in
                    the &ldquo;Last updated&rdquo; date above and tracked in the project&apos;s{' '}
                    <Link
                        href="https://github.com/shuv-o/termi"
                        rel="noopener noreferrer"
                        target="_blank"
                    >
                        public Git history
                    </Link>
                    .
                </p>
            </Section>

            <Section id="contact" title="Contact">
                <p>
                    Questions about this policy or about Termi&apos;s data handling? Open an issue
                    on{' '}
                    <Link
                        href="https://github.com/shuv-o/termi"
                        rel="noopener noreferrer"
                        target="_blank"
                    >
                        GitHub
                    </Link>{' '}
                    or email <a href="mailto:shuvo.punam@gmail.com">shuvo.punam@gmail.com</a>.
                </p>
            </Section>
        </LegalShell>
    );
}
