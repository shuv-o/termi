import { useEffect, useState } from 'react';

/**
 * The terminal "find in output" chord.
 *
 * Plain Ctrl+F is deliberately *not* it: in a shell that is readline's
 * forward-char, and stealing it would break muscle memory. So: ⌘F on macOS,
 * Ctrl+Shift+F everywhere else.
 */

const isMacPlatform = (platform: string) => /Mac|iPhone|iPad/.test(platform);

const currentPlatform = () => (typeof navigator !== 'undefined' ? navigator.platform : '');

export function isFindShortcut(
    e: Pick<KeyboardEvent, 'type' | 'key' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>,
    platform: string = currentPlatform(),
): boolean {
    if (e.type !== 'keydown' || e.altKey || e.key.toLowerCase() !== 'f') return false;
    return isMacPlatform(platform)
        ? e.metaKey && !e.ctrlKey
        : e.ctrlKey && e.shiftKey && !e.metaKey;
}

export const FIND_SHORTCUT_LABEL = (platform: string = currentPlatform()) =>
    isMacPlatform(platform) ? '⌘F' : 'Ctrl+Shift+F';

/**
 * The chord's label for rendering in markup. Starts as the non-Mac label (what
 * the server renders) and switches after mount, so a Mac never hydrates with a
 * mismatched `title`.
 */
export function useFindShortcutLabel(): string {
    const [label, setLabel] = useState(() => FIND_SHORTCUT_LABEL(''));
    useEffect(() => setLabel(FIND_SHORTCUT_LABEL()), []);
    return label;
}
