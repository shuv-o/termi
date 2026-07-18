// Right-click context menu.
//
// A web page in a frame has no context menu at all, which is immediately
// noticeable in an app built around terminals: selecting output and
// right-clicking to copy is muscle memory. This builds a menu whose items
// depend on what was actually clicked — selected text, an editable field, or a
// link — instead of showing a fixed list of mostly-disabled entries.
//
// Deliberately minimal and native: no "Inspect Element" outside dev, and no
// entries that would let the shell navigate somewhere unexpected.

const { Menu, MenuItem, clipboard, shell } = require('electron');

/**
 * Attach a context menu to a window's web contents.
 *
 * @param {import('electron').BrowserWindow} win
 * @param {{ isDev?: boolean }} [options]
 */
function attachContextMenu(win, { isDev } = {}) {
    win.webContents.on('context-menu', (_event, params) => {
        const menu = new Menu();
        const { editFlags } = params;

        const hasSelection = params.selectionText.trim().length > 0;
        const isEditable = params.isEditable;

        // Links — copy the address, or open it in the real browser. Never open
        // it inside the shell window.
        if (params.linkURL) {
            menu.append(
                new MenuItem({
                    label: 'Open Link in Browser',
                    click: () => shell.openExternal(params.linkURL),
                }),
            );
            menu.append(
                new MenuItem({
                    label: 'Copy Link Address',
                    click: () => clipboard.writeText(params.linkURL),
                }),
            );
            menu.append(new MenuItem({ type: 'separator' }));
        }

        if (isEditable) {
            menu.append(new MenuItem({ role: 'undo', enabled: editFlags.canUndo }));
            menu.append(new MenuItem({ role: 'redo', enabled: editFlags.canRedo }));
            menu.append(new MenuItem({ type: 'separator' }));
            menu.append(new MenuItem({ role: 'cut', enabled: editFlags.canCut }));
        }

        menu.append(
            new MenuItem({
                role: 'copy',
                // xterm renders into a canvas, so Chromium may not report a
                // selection even when the terminal has one; keep Copy usable
                // whenever the page says it can copy.
                enabled: editFlags.canCopy || hasSelection,
            }),
        );

        if (isEditable) {
            menu.append(new MenuItem({ role: 'paste', enabled: editFlags.canPaste }));
            menu.append(
                new MenuItem({
                    // Pasting into a terminal must not carry styling with it.
                    label: 'Paste as Plain Text',
                    enabled: editFlags.canPaste,
                    click: () => win.webContents.insertText(clipboard.readText()),
                }),
            );
        }

        menu.append(new MenuItem({ type: 'separator' }));
        menu.append(new MenuItem({ role: 'selectAll', enabled: editFlags.canSelectAll }));

        // Spelling suggestions for a misspelled word in a text field.
        if (isEditable && params.misspelledWord && params.dictionarySuggestions.length > 0) {
            menu.append(new MenuItem({ type: 'separator' }));
            for (const suggestion of params.dictionarySuggestions.slice(0, 5)) {
                menu.append(
                    new MenuItem({
                        label: suggestion,
                        click: () => win.webContents.replaceMisspelling(suggestion),
                    }),
                );
            }
        }

        if (isDev) {
            menu.append(new MenuItem({ type: 'separator' }));
            menu.append(
                new MenuItem({
                    label: 'Inspect Element',
                    click: () => win.webContents.inspectElement(params.x, params.y),
                }),
            );
        }

        menu.popup({ window: win });
    });
}

module.exports = { attachContextMenu };
