// Remembers the main window's size, position and maximised state between runs.
//
// A desktop app that reopens at a default size in the middle of the screen,
// forgetting where you left it, is one of the clearest tells that it is really
// a web page in a frame. State is written to a small JSON file in userData
// (alongside the HTTP cache), debounced so dragging a window does not thrash
// the disk.
//
// Restoring blindly is unsafe: the saved bounds may name a monitor that is no
// longer attached (undocked laptop, unplugged external display), which would
// place the window off-screen where the user cannot reach it. Every restore is
// therefore validated against the currently connected displays.

const { app, screen } = require('electron');
const path = require('path');
const fs = require('fs');

const FILE = 'window-state.json';
const SAVE_DEBOUNCE_MS = 400;

const DEFAULTS = { width: 1400, height: 900 };

/** Smallest window we will ever restore to, so it can't come back unusably tiny. */
const MIN_WIDTH = 800;
const MIN_HEIGHT = 600;

function statePath() {
    return path.join(app.getPath('userData'), FILE);
}

function readState() {
    try {
        const raw = fs.readFileSync(statePath(), 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') return parsed;
    } catch {
        // No state yet, or it's unreadable — fall back to defaults.
    }
    return null;
}

/**
 * True when the saved rectangle still lies (mostly) inside a connected display.
 *
 * Requiring the *whole* window to be visible would discard perfectly good state
 * for a window hanging slightly off an edge, so this only insists that the
 * window's top-left region overlaps some display's work area.
 */
function isVisibleOnSomeDisplay(bounds) {
    return screen.getAllDisplays().some((display) => {
        const wa = display.workArea;
        return (
            bounds.x < wa.x + wa.width &&
            bounds.x + bounds.width > wa.x &&
            bounds.y < wa.y + wa.height &&
            bounds.y + bounds.height > wa.y
        );
    });
}

/**
 * Options to pass to `new BrowserWindow(...)`.
 *
 * Returns only a size when there is no usable saved position, letting Electron
 * centre the window as it would on a first run.
 */
function getWindowState() {
    const saved = readState();

    if (!saved || typeof saved.width !== 'number' || typeof saved.height !== 'number') {
        return { ...DEFAULTS, isMaximized: false };
    }

    const width = Math.max(MIN_WIDTH, Math.round(saved.width));
    const height = Math.max(MIN_HEIGHT, Math.round(saved.height));
    const isMaximized = Boolean(saved.isMaximized);

    const hasPosition = typeof saved.x === 'number' && typeof saved.y === 'number';
    if (!hasPosition) return { width, height, isMaximized };

    const bounds = { x: Math.round(saved.x), y: Math.round(saved.y), width, height };

    // A display that no longer exists — drop the position, keep the size.
    if (!isVisibleOnSomeDisplay(bounds)) return { width, height, isMaximized };

    return { ...bounds, isMaximized };
}

/**
 * Persist `win`'s geometry whenever it changes, and once more on close.
 *
 * While maximised or full-screen, `getBounds()` reports the expanded frame; we
 * keep the last *restored* size instead, so un-maximising later returns the
 * window to the size the user actually chose.
 */
function trackWindowState(win) {
    let timer = null;
    let lastNormalBounds = win.getNormalBounds ? win.getNormalBounds() : win.getBounds();

    const capture = () => {
        if (win.isDestroyed()) return;
        if (!win.isMaximized() && !win.isMinimized() && !win.isFullScreen()) {
            lastNormalBounds = win.getBounds();
        }
    };

    const write = () => {
        if (win.isDestroyed()) return;
        const state = {
            ...lastNormalBounds,
            isMaximized: win.isMaximized(),
        };
        try {
            fs.writeFileSync(statePath(), JSON.stringify(state, null, 2));
        } catch (err) {
            // Losing window position is not worth surfacing to the user.
            console.warn('[window-state] could not save:', err.message);
        }
    };

    const schedule = () => {
        capture();
        if (timer) clearTimeout(timer);
        timer = setTimeout(write, SAVE_DEBOUNCE_MS);
    };

    win.on('resize', schedule);
    win.on('move', schedule);
    win.on('maximize', schedule);
    win.on('unmaximize', schedule);

    // 'close' fires before teardown, so the final state is still readable here.
    win.on('close', () => {
        if (timer) clearTimeout(timer);
        capture();
        write();
    });
}

module.exports = { getWindowState, trackWindowState };
