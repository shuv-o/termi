/**
 * Shared geometry for Dialog and AlertDialog.
 *
 * On a phone a centred modal leaves its buttons at the top of the screen, out
 * of thumb reach, and a tall form scrolls behind the notch. Below `sm` every
 * dialog is therefore a bottom sheet (docked, safe-area padded, scrollable);
 * from `sm` up it becomes the usual centred panel. Call sites keep passing
 * `max-w-*` / `sm:max-w-*` as before — `mx-auto` centres a capped sheet.
 */
export const DIALOG_PANEL =
    'termi-dialog fixed inset-x-0 bottom-0 z-50 mx-auto grid max-h-[92dvh] w-full max-w-lg gap-4 overflow-y-auto rounded-t-2xl border border-b-0 border-border bg-card p-5 pt-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-card-foreground shadow-xl sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:max-h-[85dvh] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border-b sm:p-6';

/** Grab handle — a visual cue that the sheet came up from the bottom. Phones only. */
export function SheetHandle() {
    return (
        <span
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-2 h-1 w-9 -translate-x-1/2 rounded-full bg-border sm:hidden"
        />
    );
}
