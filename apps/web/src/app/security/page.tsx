import type { Metadata } from 'next';
import Link from 'next/link';
import LegalShell, { Section, type TocItem } from '@/components/legal/LegalShell';

export const metadata: Metadata = {
    title: 'Security Policy',
    description:
        "Termix's security model and how to responsibly report a vulnerability. Built with AES-256-GCM encryption, Argon2id hashing, TOTP 2FA, and short-lived JWE tokens.",
    alternates: { canonical: '/security' },
    openGraph: {
        title: 'Security Policy | Termix',
        description: "Termix's security model and how to responsibly report a vulnerability.",
        url: '/security',
        type: 'website',
    },
};

const toc: TocItem[] = [
    { id: 'reporting', label: 'Reporting a vulnerability' },
    { id: 'supported-versions', label: 'Supported versions' },
    { id: 'scope', label: 'Scope' },
    { id: 'architecture', label: 'Security architecture' },
    { id: 'encryption', label: 'Encryption' },
    { id: 'authentication', label: 'Authentication' },
    { id: 'connection-security', label: 'Connection security' },
    { id: 'hardening', label: 'Application hardening' },
    { id: 'operator', label: 'Operator responsibilities' },
    { id: 'disclosure', label: 'Disclosure policy' },
];

export default function SecurityPage() {
    return (
        <LegalShell
            title="Security Policy"
            description="How Termix protects your data, and how to report a vulnerability responsibly."
            lastUpdated="June 6, 2026"
            toc={toc}
        >
            <Section id="reporting" title="Reporting a vulnerability">
                <p>
                    We take the security of Termix seriously. If you believe you have found a
                    security vulnerability, please report it to us <strong>privately</strong> — do
                    not open a public GitHub issue, discussion, or pull request for it.
                </p>
                <ul>
                    <li>
                        <strong>Preferred:</strong> use GitHub&apos;s{' '}
                        <Link
                            href="https://github.com/shuv-o/termix/security/advisories/new"
                            rel="noopener noreferrer"
                            target="_blank"
                        >
                            private vulnerability reporting
                        </Link>{' '}
                        to open a security advisory.
                    </li>
                    <li>
                        <strong>Alternatively:</strong> email{' '}
                        <a href="mailto:shuvo.punam@gmail.com">shuvo.punam@gmail.com</a> with the
                        details.
                    </li>
                </ul>
                <p>To help us triage quickly, please include:</p>
                <ul>
                    <li>A description of the vulnerability and its potential impact.</li>
                    <li>Steps to reproduce, including a proof of concept where possible.</li>
                    <li>The affected version, commit, or deployment configuration.</li>
                    <li>Any suggested remediation, if you have one.</li>
                </ul>
                <p>
                    We aim to acknowledge reports within <strong>72 hours</strong> and to provide a
                    remediation timeline after triage. Please give us a reasonable opportunity to
                    address the issue before any public disclosure.
                </p>
            </Section>

            <Section id="supported-versions" title="Supported versions">
                <p>
                    Termix is distributed as source. Security fixes are applied to the{' '}
                    <code>main</code> branch, and we recommend running the latest released version.
                    Older versions do not receive backported security patches.
                </p>
            </Section>

            <Section id="scope" title="Scope">
                <p>The following are in scope for a vulnerability report:</p>
                <ul>
                    <li>Authentication and session management flaws.</li>
                    <li>Credential encryption or key-handling weaknesses.</li>
                    <li>Server-Side Request Forgery (SSRF) and injection vulnerabilities.</li>
                    <li>Privilege escalation or broken access control between users.</li>
                    <li>Flaws in the WebSocket gateway or JWE token handling.</li>
                </ul>
                <p>
                    Issues that are generally <strong>out of scope</strong> include findings that
                    require a compromised host, missing best-practice headers without a demonstrable
                    impact, vulnerabilities in your own self-hosted misconfiguration, and reports
                    from automated scanners without a working proof of concept.
                </p>
            </Section>

            <Section id="architecture" title="Security architecture">
                <p>
                    Termix runs as two independently deployable services plus a remote-desktop
                    daemon:
                </p>
                <ul>
                    <li>
                        <strong>Web app</strong> — the Next.js application, REST API, and credential
                        store. It is the only component that can decrypt stored credentials.
                    </li>
                    <li>
                        <strong>Gateway</strong> — a WebSocket service that proxies SSH, SCP, RDP,
                        and VNC traffic. It never has standing access to plaintext credentials; it
                        receives them only inside a short-lived signed token at connection time.
                    </li>
                    <li>
                        <strong>guacd</strong> — the Apache Guacamole daemon used for RDP/VNC,
                        reachable only from the gateway.
                    </li>
                </ul>
                <p>
                    This separation means the internet-facing gateway holds no long-lived secrets,
                    limiting the blast radius if it is compromised.
                </p>
            </Section>

            <Section id="encryption" title="Encryption">
                <ul>
                    <li>
                        <strong>Credentials at rest</strong> — every <code>host</code>,{' '}
                        <code>username</code>, <code>password</code>, <code>privateKey</code>,{' '}
                        <code>passphrase</code>, and <code>notes</code> field is encrypted with{' '}
                        <strong>AES-256-GCM</strong> before storage. Plaintext is never written to
                        these fields.
                    </li>
                    <li>
                        <strong>Optional master key</strong> — users can add a second encryption
                        layer derived from a personal master key via <strong>PBKDF2</strong>, so
                        credentials cannot be decrypted without it even with full database access.
                    </li>
                    <li>
                        <strong>Key management</strong> — encryption keys are supplied through
                        environment variables (<code>ENCRYPTION_KEY</code>) and are never stored in
                        the database alongside the data they protect.
                    </li>
                </ul>
            </Section>

            <Section id="authentication" title="Authentication">
                <ul>
                    <li>
                        <strong>Password hashing</strong> — account passwords are hashed with{' '}
                        <strong>Argon2id</strong> using secure parameters.
                    </li>
                    <li>
                        <strong>Two-factor authentication</strong> — TOTP-based 2FA is supported
                        (Google Authenticator, Authy, and compatible apps), with recovery codes.
                    </li>
                    <li>
                        <strong>Sessions</strong> — managed with encrypted, HTTP-only iron-session
                        cookies on a 7-day lifetime.
                    </li>
                </ul>
            </Section>

            <Section id="connection-security" title="Connection security">
                <p>
                    Credentials are decrypted only at the moment of connection and are never exposed
                    to the browser:
                </p>
                <ul>
                    <li>
                        The web server issues a <strong>5-minute JWE token</strong> (A256GCM)
                        containing the decrypted connection details.
                    </li>
                    <li>
                        The browser opens a WebSocket to the gateway using that token; the gateway
                        validates it and brokers the SSH/SCP/RDP/VNC session.
                    </li>
                    <li>
                        Tokens are single-purpose and short-lived, minimizing the window in which a
                        leaked token is useful.
                    </li>
                </ul>
            </Section>

            <Section id="hardening" title="Application hardening">
                <ul>
                    <li>
                        <strong>SSRF protection</strong> — every user-supplied host is validated
                        before a connection is attempted, blocking access to internal and link-local
                        address ranges.
                    </li>
                    <li>
                        <strong>Content Security Policy</strong> — a strict, per-request nonce-based
                        CSP and a full set of security headers are applied to every response.
                    </li>
                    <li>
                        <strong>Input validation</strong> — all API routes validate request bodies
                        with schema validation before processing.
                    </li>
                </ul>
            </Section>

            <Section id="operator" title="Operator responsibilities">
                <p>
                    Because Termix is self-hosted, a secure deployment is a shared responsibility. As
                    an operator you should:
                </p>
                <ul>
                    <li>
                        Generate strong, unique secrets for <code>SESSION_SECRET</code>,{' '}
                        <code>ENCRYPTION_KEY</code>, and <code>GATEWAY_JWT_SECRET</code> (for
                        example, with <code>openssl rand -base64 32</code>).
                    </li>
                    <li>Serve the application strictly over HTTPS/TLS.</li>
                    <li>Keep your database, guacd, and host operating system patched.</li>
                    <li>Restrict network access to the gateway and guacd to trusted sources.</li>
                    <li>Back up your database and store secrets outside of version control.</li>
                </ul>
            </Section>

            <Section id="disclosure" title="Disclosure policy">
                <p>
                    We follow a coordinated disclosure model. After a fix is released, we will
                    publish a security advisory crediting the reporter (unless anonymity is
                    requested). We do not currently operate a paid bug-bounty program, but we deeply
                    appreciate responsible disclosure and will gladly acknowledge your contribution.
                </p>
            </Section>
        </LegalShell>
    );
}
