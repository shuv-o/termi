import { describe, it, expect } from 'vitest';
import { FIND_SHORTCUT_LABEL, isFindShortcut } from './find-shortcut';

const key = (over: Partial<KeyboardEvent> = {}) => ({
    type: 'keydown',
    key: 'f',
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    ...over,
});

describe('isFindShortcut', () => {
    it('uses ⌘F on macOS', () => {
        expect(isFindShortcut(key({ metaKey: true }), 'MacIntel')).toBe(true);
        expect(isFindShortcut(key({ metaKey: true, key: 'F' }), 'MacIntel')).toBe(true);
    });

    it('leaves plain Ctrl+F to the shell (readline forward-char)', () => {
        expect(isFindShortcut(key({ ctrlKey: true }), 'MacIntel')).toBe(false);
        expect(isFindShortcut(key({ ctrlKey: true }), 'Win32')).toBe(false);
        expect(isFindShortcut(key({ ctrlKey: true }), 'Linux x86_64')).toBe(false);
    });

    it('uses Ctrl+Shift+F elsewhere', () => {
        expect(isFindShortcut(key({ ctrlKey: true, shiftKey: true }), 'Win32')).toBe(true);
        expect(isFindShortcut(key({ ctrlKey: true, shiftKey: true }), 'Linux x86_64')).toBe(true);
    });

    it('ignores keyup, Alt chords and other keys', () => {
        expect(isFindShortcut(key({ type: 'keyup', metaKey: true }), 'MacIntel')).toBe(false);
        expect(isFindShortcut(key({ metaKey: true, altKey: true }), 'MacIntel')).toBe(false);
        expect(isFindShortcut(key({ metaKey: true, key: 'g' }), 'MacIntel')).toBe(false);
    });

    it('labels the chord per platform', () => {
        expect(FIND_SHORTCUT_LABEL('MacIntel')).toBe('⌘F');
        expect(FIND_SHORTCUT_LABEL('Win32')).toBe('Ctrl+Shift+F');
    });
});
