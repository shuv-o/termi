'use client';

import { Suspense, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/ui/page-header';
import { useActiveRect } from '@/lib/hooks/useActiveRect';
import { ActivityList } from './_components/ActivityList';
import { ConnectionsList } from './_components/ConnectionsList';
import { RecordingsList } from './_components/RecordingsList';

const TABS = [
    { id: 'connections', label: 'Connections' },
    { id: 'recordings', label: 'Recordings' },
    { id: 'activity', label: 'Account activity' },
] as const;
type TabId = (typeof TABS)[number]['id'];

function HistoryTabs() {
    const router = useRouter();
    const pathname = usePathname();
    const params = useSearchParams();
    const requested = params.get('tab');
    const tab: TabId = TABS.some((t) => t.id === requested) ? (requested as TabId) : 'connections';

    const listRef = useRef<HTMLDivElement>(null);
    const rect = useActiveRect(listRef, '[aria-selected="true"]', tab);

    const select = (id: TabId) =>
        router.replace(id === 'connections' ? pathname : `${pathname}?tab=${id}`, {
            scroll: false,
        });

    const onKeyDown = (e: React.KeyboardEvent) => {
        const i = TABS.findIndex((t) => t.id === tab);
        const next = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : null;
        if (next === null) return;
        e.preventDefault();
        const t = TABS[(next + TABS.length) % TABS.length];
        select(t.id);
        listRef.current?.querySelector<HTMLElement>(`#history-tab-${t.id}`)?.focus();
    };

    return (
        <>
            <div
                ref={listRef}
                role="tablist"
                aria-label="History"
                onKeyDown={onKeyDown}
                className="relative flex gap-1 overflow-x-auto border-b border-border"
            >
                {TABS.map((t) => (
                    <button
                        key={t.id}
                        id={`history-tab-${t.id}`}
                        role="tab"
                        aria-selected={tab === t.id}
                        aria-controls="history-panel"
                        tabIndex={tab === t.id ? 0 : -1}
                        onClick={() => select(t.id)}
                        className={`shrink-0 px-3 pb-2.5 pt-1 text-sm font-medium transition-colors ${
                            tab === t.id
                                ? 'text-foreground'
                                : 'text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        {t.label}
                    </button>
                ))}
                {rect && (
                    <span
                        aria-hidden
                        className={`absolute bottom-0 h-0.5 rounded-full bg-primary ${rect.moved ? 'termi-glide' : ''}`}
                        style={{ left: rect.left + 8, width: rect.width - 16 }}
                    />
                )}
            </div>

            <div
                id="history-panel"
                role="tabpanel"
                aria-labelledby={`history-tab-${tab}`}
                key={tab}
                className="animate-fade-in pt-6"
            >
                {tab === 'connections' && <ConnectionsList />}
                {tab === 'recordings' && <RecordingsList />}
                {tab === 'activity' && <ActivityList />}
            </div>
        </>
    );
}

export default function HistoryPage() {
    return (
        <div className="mx-auto w-full max-w-4xl pb-16">
            <PageHeader
                className="mb-6"
                title="History"
                description="Where you connected, what you recorded, and what changed on your account."
            />
            <Suspense fallback={null}>
                <HistoryTabs />
            </Suspense>
        </div>
    );
}
