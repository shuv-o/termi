/**
 * Root route-segment loading UI.
 *
 * Next renders this as the Suspense fallback while a server segment streams, so
 * a navigation shows a branded, dark placeholder instead of a blank (white)
 * frame. It fades in after a short delay via CSS so a fast load never flashes a
 * spinner — see `.route-loader` in globals.css.
 */
export default function Loading() {
    return (
        <div className="route-loader fixed inset-0 z-50 flex items-center justify-center bg-background">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
    );
}
