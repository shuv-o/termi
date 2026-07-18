import { Skeleton } from '@/components/ui/skeleton';

/**
 * Loading UI for panel pages.
 *
 * This replaces only the page body ({children}) — the sidebar, header and the
 * always-mounted SessionsWorkspace live in the layout and stay put, so live
 * terminals are never disturbed by a navigation. Showing the dashboard's rough
 * shape keeps the layout stable instead of collapsing to blank while the next
 * page's data loads.
 */
export default function PanelLoading() {
    return (
        <div className="route-loader mx-auto max-w-screen-2xl space-y-5" aria-busy="true">
            {/* Header row */}
            <div className="flex items-center justify-between gap-4">
                <div className="space-y-2">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-7 w-40" />
                    <Skeleton className="h-4 w-56" />
                </div>
                <Skeleton className="h-10 w-32 rounded-lg" />
            </div>

            {/* Stat strip */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-20 rounded-xl" />
                ))}
            </div>

            {/* Server cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-36 rounded-xl" />
                ))}
            </div>
        </div>
    );
}
