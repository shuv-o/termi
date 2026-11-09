'use client';

import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Search, X } from 'lucide-react';

import { FEATURE_GROUPS, type Feature } from './features';

/**
 * Every feature, by category, with a search across all of them. All panels are
 * in the HTML (hidden when not selected), so the whole list is readable
 * without JavaScript and by search engines.
 */
export default function FeatureExplorer() {
    const [active, setActive] = useState(FEATURE_GROUPS[0].id);
    const [query, setQuery] = useState('');
    const tabs = useRef<(HTMLButtonElement | null)[]>([]);
    const searchId = useId();

    const q = query.trim().toLowerCase();
    const matches = useMemo(() => {
        if (!q) return null;
        return FEATURE_GROUPS.map((g) => ({
            group: g,
            features: g.features.filter((f) =>
                [f.name, f.body, f.keywords ?? '', ...(f.details ?? [])]
                    .join(' ')
                    .toLowerCase()
                    .includes(q),
            ),
        })).filter((r) => r.features.length > 0);
    }, [q]);

    const onKey = (e: KeyboardEvent, i: number) => {
        const step =
            e.key === 'ArrowDown' || e.key === 'ArrowRight'
                ? 1
                : e.key === 'ArrowUp' || e.key === 'ArrowLeft'
                  ? -1
                  : 0;
        if (!step) return;
        e.preventDefault();
        const next = (i + step + FEATURE_GROUPS.length) % FEATURE_GROUPS.length;
        setActive(FEATURE_GROUPS[next].id);
        tabs.current[next]?.focus();
    };

    return (
        <div>
            <div className="relative max-w-md">
                <label htmlFor={searchId} className="sr-only">
                    Find a feature
                </label>
                <Search
                    aria-hidden
                    className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                />
                <input
                    id={searchId}
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Find a feature, like sftp, yubikey or slack"
                    className="h-11 w-full rounded-lg border border-border bg-background pl-10 pr-10 text-[15px] placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-search-cancel-button]:hidden"
                />
                {query && (
                    <button
                        type="button"
                        onClick={() => setQuery('')}
                        aria-label="Clear search"
                        className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        <X className="h-4 w-4" />
                    </button>
                )}
            </div>

            {matches ? (
                <div className="mt-10" aria-live="polite">
                    {matches.length === 0 ? (
                        <p className="text-muted-foreground">
                            Nothing matches “{query.trim()}”. Try a protocol, like ssh or rdp, or a
                            word like team or alert.
                        </p>
                    ) : (
                        <div className="space-y-12">
                            {matches.map(({ group, features }) => (
                                <section key={group.id} aria-label={group.name}>
                                    <GroupHeading name={group.name} bar={group.bar} />
                                    <FeatureList features={features} />
                                </section>
                            ))}
                        </div>
                    )}
                </div>
            ) : null}

            <div hidden={!!matches} className="mt-10 grid gap-8 lg:grid-cols-[230px_1fr] lg:gap-14">
                <div
                    role="tablist"
                    aria-label="Feature categories"
                    aria-orientation="vertical"
                    className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0"
                >
                    {FEATURE_GROUPS.map((g, i) => {
                        const selected = g.id === active;
                        return (
                            <button
                                key={g.id}
                                ref={(el) => {
                                    tabs.current[i] = el;
                                }}
                                role="tab"
                                id={`feature-tab-${g.id}`}
                                aria-selected={selected}
                                aria-controls={`feature-panel-${g.id}`}
                                tabIndex={selected ? 0 : -1}
                                onClick={() => setActive(g.id)}
                                onKeyDown={(e) => onKey(e, i)}
                                className={`flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:py-2.5 ${
                                    selected
                                        ? 'bg-accent font-medium text-foreground'
                                        : 'text-muted-foreground hover:text-foreground'
                                }`}
                            >
                                <span className={`h-3.5 w-1 shrink-0 rounded-full ${g.bar}`} />
                                <span className="whitespace-nowrap lg:flex-1">{g.name}</span>
                                <span className="tabular-nums text-xs text-muted-foreground">
                                    {g.features.length}
                                </span>
                            </button>
                        );
                    })}
                </div>

                <div className="min-w-0">
                    {FEATURE_GROUPS.map((g) => (
                        <section
                            key={g.id}
                            id={`feature-panel-${g.id}`}
                            role="tabpanel"
                            aria-labelledby={`feature-tab-${g.id}`}
                            hidden={g.id !== active}
                            className="hero-pane"
                        >
                            <h3 className="text-xl font-semibold tracking-[-0.01em]">{g.name}</h3>
                            <p className="mt-1.5 text-muted-foreground">{g.summary}</p>
                            <FeatureList features={g.features} />
                        </section>
                    ))}
                </div>
            </div>
        </div>
    );
}

function GroupHeading({ name, bar }: { name: string; bar: string }) {
    return (
        <h3 className="flex items-center gap-2.5 text-base font-semibold">
            <span className={`h-3.5 w-1 rounded-full ${bar}`} />
            {name}
        </h3>
    );
}

function FeatureList({ features }: { features: Feature[] }) {
    return (
        <dl className="mt-6 grid gap-x-10 gap-y-7 border-t border-border pt-7 md:grid-cols-2">
            {features.map((f) => (
                <div key={f.name}>
                    <dt className="font-medium">{f.name}</dt>
                    <dd className="mt-1 text-sm leading-relaxed text-muted-foreground">
                        {f.body}
                        {f.details && (
                            <ul className="mt-2.5 space-y-1">
                                {f.details.map((d) => (
                                    <li key={d} className="flex gap-2.5">
                                        <span
                                            aria-hidden
                                            className="mt-[0.6em] h-1 w-1 shrink-0 rounded-full bg-muted-foreground/60"
                                        />
                                        <span>{d}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </dd>
                </div>
            ))}
        </dl>
    );
}
