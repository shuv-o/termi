import Link from 'next/link';
import { Terminal, ArrowLeft } from 'lucide-react';
import TerminalLogo from '@/components/common/Logo';

export interface TocItem {
    id: string;
    label: string;
}

interface LegalShellProps {
    title: string;
    description: string;
    lastUpdated: string;
    toc: TocItem[];
    children: React.ReactNode;
}

/**
 * Document chrome for legal/policy pages (privacy, security).
 * Mirrors the layout of GitHub's policy pages: a sticky in-page table of
 * contents alongside a readable single-column document.
 */
export default function LegalShell({
    title,
    description,
    lastUpdated,
    toc,
    children,
}: LegalShellProps) {
    return (
        <div className="min-h-screen bg-background">
            {/* Header */}
            <header className="sticky top-0 z-50 border-b border-border bg-background/85 backdrop-blur-lg">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex h-14 items-center justify-between">
                        <Link href="/" className="flex items-center gap-2.5">
                            <TerminalLogo width={26} height={26} className="rounded-md" />
                            <span className="text-[15px] font-semibold">Termi</span>
                        </Link>

                        <Link
                            href="/"
                            className="inline-flex items-center gap-2 text-sm text-foreground/85 hover:text-foreground transition-colors"
                        >
                            <ArrowLeft className="w-4 h-4" />
                            Back to home
                        </Link>
                    </div>
                </div>
            </header>

            {/* Title block */}
            <div className="border-b border-border bg-card/40">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
                    <h1 className="text-3xl sm:text-4xl font-bold mb-3">{title}</h1>
                    <p className="text-lg text-muted-foreground max-w-2xl">{description}</p>
                    <p className="text-sm text-muted-foreground mt-6">
                        Last updated: <time className="text-foreground/85">{lastUpdated}</time>
                    </p>
                </div>
            </div>

            {/* Body */}
            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
                <div className="lg:grid lg:grid-cols-[220px_1fr] lg:gap-12">
                    {/* Table of contents */}
                    <aside className="hidden lg:block">
                        <nav className="sticky top-24" aria-label="Table of contents">
                            <p className="text-xs font-semibold text-muted-foreground mb-4">
                                On this page
                            </p>
                            <ul className="space-y-2 border-l border-border">
                                {toc.map((item) => (
                                    <li key={item.id}>
                                        <a
                                            href={`#${item.id}`}
                                            className="block -ml-px border-l border-transparent pl-4 text-sm text-muted-foreground hover:text-foreground hover:border-primary transition-colors"
                                        >
                                            {item.label}
                                        </a>
                                    </li>
                                ))}
                            </ul>
                        </nav>
                    </aside>

                    {/* Content */}
                    <article className="legal-prose min-w-0">{children}</article>
                </div>
            </div>

            {/* Footer */}
            <footer className="py-10 px-4 sm:px-6 lg:px-8 border-t border-border">
                <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                        <Terminal className="w-5 h-5 text-primary" />
                        <span className="font-semibold text-foreground/85">Termi</span>
                        <span className="text-muted-foreground/70">•</span>
                        <span className="text-muted-foreground">MIT License</span>
                    </div>
                    <div className="flex items-center gap-6">
                        <Link href="/privacy" className="hover:text-foreground transition-colors">
                            Privacy
                        </Link>
                        <Link href="/security" className="hover:text-foreground transition-colors">
                            Security
                        </Link>
                        <Link
                            href="https://github.com/shuv-o/termi"
                            className="hover:text-foreground transition-colors"
                            rel="noopener noreferrer"
                            target="_blank"
                        >
                            GitHub
                        </Link>
                    </div>
                </div>
            </footer>
        </div>
    );
}

/** Section heading with an anchor target, matching the ToC ids. */
export function Section({
    id,
    title,
    children,
}: {
    id: string;
    title: string;
    children: React.ReactNode;
}) {
    return (
        <section id={id} className="scroll-mt-24 mb-12">
            <h2 className="group text-2xl font-bold mb-4 flex items-center gap-2">
                <a href={`#${id}`} className="hover:text-primary transition-colors">
                    {title}
                </a>
            </h2>
            <div className="space-y-4 text-foreground/85 leading-relaxed">{children}</div>
        </section>
    );
}
