'use client';

import Link from 'next/link';
import { Plus, Search, Server } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ServerListHeader } from './ServerListRow';
import type { ViewMode } from './types';

/** Loading placeholder matching whichever view is active. */
export function DashboardSkeleton({ viewMode }: { viewMode: ViewMode }) {
    if (viewMode === 'grid') {
        return (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                    <Card key={i} className="min-h-[320px] border-border p-4">
                        <div className="flex items-center gap-3">
                            <Skeleton className="h-10 w-10 rounded-xl" />
                            <div className="flex-1 space-y-2">
                                <Skeleton className="h-4 w-28" />
                                <Skeleton className="h-3 w-20" />
                            </div>
                        </div>
                        <div className="mt-4 space-y-3">
                            <Skeleton className="h-16 w-full rounded-xl" />
                            <Skeleton className="h-5 w-2/3" />
                            <Skeleton className="h-20 w-full rounded-xl" />
                        </div>
                    </Card>
                ))}
            </div>
        );
    }

    return (
        <Card className="overflow-hidden border-border">
            <ServerListHeader />
            {[1, 2, 3, 4, 5].map((i) => (
                <div
                    key={i}
                    className="flex h-14 items-center gap-4 border-b border-border/50 px-4 last:border-0"
                >
                    <Skeleton className="h-9 w-9 rounded-lg" />
                    <Skeleton className="h-4 flex-[1.3]" />
                    <Skeleton className="hidden h-4 flex-1 md:block" />
                    <Skeleton className="hidden h-4 w-20 lg:block" />
                    <Skeleton className="hidden h-4 w-16 xl:block" />
                    <Skeleton className="hidden h-4 w-16 2xl:block" />
                    <Skeleton className="hidden h-4 flex-1 2xl:block" />
                    <Skeleton className="ml-auto h-8 w-24" />
                </div>
            ))}
        </Card>
    );
}

/**
 * Shown when nothing is listed — either the fleet is genuinely empty, or the
 * active filters exclude everything.
 */
export function DashboardEmptyState({
    fleetIsEmpty,
    onClearFilters,
}: {
    fleetIsEmpty: boolean;
    onClearFilters: () => void;
}) {
    return (
        <Card className="flex min-h-[420px] items-center justify-center border-border">
            <div className="mx-auto max-w-md px-6 text-center">
                {fleetIsEmpty ? (
                    <>
                        <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-2xl border border-border bg-secondary/30">
                            <Server className="h-10 w-10 text-muted-foreground/35" />
                        </div>
                        <h3 className="text-xl font-semibold">Build your fleet</h3>
                        <p className="mt-2 text-sm text-muted-foreground">
                            Add your first server to create a clean, searchable fleet view.
                        </p>
                        <Button asChild className="mt-6 h-10 px-4">
                            <Link href="/panel/servers/new">
                                <Plus className="w-4 h-4" /> Add your first server
                            </Link>
                        </Button>
                    </>
                ) : (
                    <>
                        <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-2xl border border-border bg-secondary/30">
                            <Search className="h-10 w-10 text-muted-foreground/35" />
                        </div>
                        <h3 className="text-xl font-semibold">No matching servers</h3>
                        <p className="mt-2 text-sm text-muted-foreground">
                            Broaden your search or reset the active filters to see more servers.
                        </p>
                        <Button
                            variant="secondary"
                            className="mt-6 h-10 px-4"
                            onClick={onClearFilters}
                        >
                            Clear filters
                        </Button>
                    </>
                )}
            </div>
        </Card>
    );
}
