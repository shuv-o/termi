import Link from 'next/link';
import { Terminal, ArrowLeft } from 'lucide-react';

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
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
            {/* Header */}
            <header className="sticky top-0 left-0 right-0 z-50 glass">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-16">
                        <Link href="/" className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-sky-700 flex items-center justify-center">
                                <Terminal className="w-6 h-6 text-white" />
                            </div>
                            <span className="text-xl font-bold gradient-text">Termi</span>
                        </Link>

                        <Link
                            href="/"
                            className="inline-flex items-center gap-2 text-sm text-slate-300 hover:text-white transition-colors"
                        >
                            <ArrowLeft className="w-4 h-4" />
                            Back to home
                        </Link>
                    </div>
                </div>
            </header>

            {/* Title block */}
            <div className="border-b border-slate-800 bg-slate-900/40">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
                    <h1 className="text-3xl sm:text-4xl font-bold mb-3">{title}</h1>
                    <p className="text-lg text-slate-400 max-w-2xl">{description}</p>
                    <p className="text-sm text-slate-500 mt-6">
                        Last updated:{' '}
                        <time className="text-slate-300">{lastUpdated}</time>
                    </p>
                </div>
            </div>

            {/* Body */}
            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
                <div className="lg:grid lg:grid-cols-[220px_1fr] lg:gap-12">
                    {/* Table of contents */}
                    <aside className="hidden lg:block">
                        <nav className="sticky top-24" aria-label="Table of contents">
                            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-4">
                                On this page
                            </p>
                            <ul className="space-y-2 border-l border-slate-800">
                                {toc.map((item) => (
                                    <li key={item.id}>
                                        <a
                                            href={`#${item.id}`}
                                            className="block -ml-px border-l border-transparent pl-4 text-sm text-slate-400 hover:text-white hover:border-primary transition-colors"
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
            <footer className="py-10 px-4 sm:px-6 lg:px-8 border-t border-slate-800">
                <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-slate-400">
                    <div className="flex items-center gap-2">
                        <Terminal className="w-5 h-5 text-primary" />
                        <span className="font-semibold text-slate-300">Termi</span>
                        <span className="text-slate-600">•</span>
                        <span className="text-slate-500">MIT License</span>
                    </div>
                    <div className="flex items-center gap-6">
                        <Link href="/privacy" className="hover:text-white transition-colors">
                            Privacy
                        </Link>
                        <Link href="/security" className="hover:text-white transition-colors">
                            Security
                        </Link>
                        <Link
                            href="https://github.com/shuvoooo/termi"
                            className="hover:text-white transition-colors"
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
            <div className="space-y-4 text-slate-300 leading-relaxed">{children}</div>
        </section>
    );
}
