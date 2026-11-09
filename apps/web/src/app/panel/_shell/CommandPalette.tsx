'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    BookKey,
    FolderOpen,
    Key,
    Keyboard,
    Laptop,
    Monitor,
    Play,
    Plus,
    Server,
    Shield,
    Sparkles,
    SquareTerminal,
    UserCog,
    Lock,
    Cable,
    LayoutPanelLeft,
    Palette,
} from 'lucide-react';
import {
    CommandDialog,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandSeparator,
    CommandShortcut,
} from '@/components/ui/command';
import { DialogTitle } from '@/components/ui/dialog';
import { mutateCache, useCachedFetch } from '@/lib/hooks/useCachedFetch';
import { protocolIcons } from '@/lib/style/protocol';
import { connectHref } from '@/lib/servers/connect-route';
import type { Snippet } from '@/lib/snippets/types';
import { NewSnippetDialog } from '@/components/snippets/NewSnippetDialog';
import { useSnippetRunner } from '@/components/snippets/SnippetRunner';
import { RunOnServersDialog } from '@/components/servers/RunOnServersDialog';
import { LOCK_NOW_EVENT } from './AppLock';
import { NAV_ITEMS, itemAvailable } from '@/lib/navigation';
import type { MenuItemId } from '@/lib/appearance/prefs';

/** Older and everyday words that should still find each page. */
const PAGE_SYNONYMS: Record<MenuItemId, string> = {
    servers: 'fleet dashboard hosts',
    connections: 'sessions terminals tabs open',
    workspaces: 'layouts saved split panes sets',
    local: 'local shell this computer',
    serial: 'usb console cable router switch',
    keys: 'keychain credentials passwords ssh keys security keys',
    snippets: 'commands scripts macros saved commands',
    assistant: 'ai chat ask help explain claude gpt llm',
    forwarding: 'tunnels port forward ssh -L socks proxy',
    'known-hosts': 'host keys fingerprints known_hosts trust',
    groups: 'folders',
    teams: 'team vault members',
    history: 'logs recent connections recordings activity audit',
    settings: 'account preferences',
};
import { useSessionsContext } from '@/app/panel/_sessions/sessions-context';
import type { ServerItem } from '@/lib/servers/types';
import type { Group } from '@/lib/groups/types';
import type { KeychainEntry } from '@/lib/keychain/types';

/** Fired by any button (e.g. the sidebar search field) that wants to open the palette. */
export const OPEN_COMMAND_PALETTE_EVENT = 'termi:open-command-palette';

const SETTINGS_SECTIONS = [
    { id: 'profile', label: 'Profile', icon: UserCog },
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'passkeys', label: 'Passkeys', icon: Key },
    { id: 'notifications', label: 'Notifications', icon: BookKey },
    { id: 'sessions', label: 'Signed-in devices', icon: Monitor },
    { id: 'terminal', label: 'Terminal', icon: SquareTerminal },
];

/**
 * Global ⌘K / Ctrl+K palette — jump to any server, group, keychain entry,
 * settings section, or common action without leaving the keyboard.
 *
 * Mounted once in the panel layout. Data for each section is fetched lazily
 * (only once the palette is first opened) through the same cache the rest of
 * the app uses, so opening it is usually an instant cache hit.
 */
export function CommandPalette() {
    const router = useRouter();
    const { activeTabId, sendToSession, sessions } = useSessionsContext();
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const isElectron = typeof window !== 'undefined' && !!window.electronAPI?.isElectron;
    const [showNewSnippet, setShowNewSnippet] = useState(false);
    const [showRunOn, setShowRunOn] = useState(false);
    // cmdk's onSelect carries no event, so the modifier is tracked here:
    // Enter connects, Shift+Enter (or Shift+click) opens the server's page.
    const shiftHeld = useRef(false);

    useEffect(() => {
        if (!open) return;
        const track = (e: KeyboardEvent | MouseEvent) => {
            shiftHeld.current = e.shiftKey;
        };
        window.addEventListener('keydown', track, true);
        window.addEventListener('keyup', track, true);
        window.addEventListener('mousedown', track, true);
        return () => {
            window.removeEventListener('keydown', track, true);
            window.removeEventListener('keyup', track, true);
            window.removeEventListener('mousedown', track, true);
            shiftHeld.current = false;
        };
    }, [open]);

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                setOpen((o) => !o);
            }
        };
        const onOpenRequest = () => setOpen(true);
        document.addEventListener('keydown', onKeyDown);
        window.addEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpenRequest);
        return () => {
            document.removeEventListener('keydown', onKeyDown);
            window.removeEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpenRequest);
        };
    }, []);

    // Lazy: only hit these endpoints once the palette has actually been opened.
    const { data: serversData } = useCachedFetch<{ servers: ServerItem[] }>(
        open ? '/api/servers' : null,
    );
    const { data: groupsData } = useCachedFetch<{ groups: Group[] }>(open ? '/api/groups' : null);
    const { data: keychainData } = useCachedFetch<{ entries: KeychainEntry[] }>(
        open ? '/api/keychain' : null,
    );
    const { data: snippetsData } = useCachedFetch<{ snippets: Snippet[] }>(
        open ? '/api/snippets' : null,
    );

    // Most recently used first, so the box you were just on is one keystroke away.
    const servers = useMemo(
        () =>
            [...(serversData?.servers ?? [])].sort(
                (a, b) =>
                    (b.lastUsedAt ? Date.parse(b.lastUsedAt) : 0) -
                    (a.lastUsedAt ? Date.parse(a.lastUsedAt) : 0),
            ),
        [serversData],
    );
    const openServerIds = useMemo(() => new Set(sessions.map((t) => t.serverId)), [sessions]);
    const groups = groupsData?.groups ?? [];
    const entries = keychainData?.entries ?? [];
    const snippets = snippetsData?.snippets ?? [];

    useEffect(() => {
        if (!open) setQuery('');
    }, [open]);

    const go = useCallback(
        (href: string) => {
            setOpen(false);
            router.push(href);
        },
        [router],
    );

    // Types it into the active session's active shell if one exists; otherwise
    // falls back to the clipboard so the action never silently does nothing.
    const snippetRunner = useSnippetRunner();
    const runSnippet = useCallback(
        (snippet: Snippet) => {
            setOpen(false);
            snippetRunner.run(snippet, (command) => {
                const text = snippet.runImmediately ? `${command}\r` : command;
                if (!sendToSession(activeTabId, text)) {
                    navigator.clipboard.writeText(command).catch(() => {});
                }
            });
        },
        [activeTabId, sendToSession, snippetRunner],
    );

    return (
        <>
            {snippetRunner.dialog}
            <CommandDialog open={open} onOpenChange={setOpen}>
                <DialogTitle className="sr-only">Command palette</DialogTitle>
                <CommandInput
                    placeholder="Connect to a server, or search anything…"
                    value={query}
                    onValueChange={setQuery}
                />
                <CommandList>
                    {query.trim().length > 2 && (
                        <CommandGroup heading="Assistant">
                            <CommandItem
                                forceMount
                                value={`ask assistant ai ${query}`}
                                onSelect={() =>
                                    go(`/panel/assistant?q=${encodeURIComponent(query.trim())}`)
                                }
                            >
                                <Sparkles />
                                <span className="truncate">
                                    Ask the assistant: &ldquo;{query.trim()}&rdquo;
                                </span>
                            </CommandItem>
                        </CommandGroup>
                    )}
                    <CommandEmpty>No results found.</CommandEmpty>

                    {servers.length > 0 && (
                        <>
                            <CommandGroup heading="Connect">
                                {servers.map((s) => {
                                    const Icon = protocolIcons[s.protocol] ?? Server;
                                    return (
                                        <CommandItem
                                            key={s.id}
                                            value={`${s.name} ${s.host} ${s.username} ${s.protocol}`}
                                            onSelect={() =>
                                                go(
                                                    shiftHeld.current
                                                        ? `/panel/servers/${s.id}`
                                                        : connectHref(s.id, s.protocol),
                                                )
                                            }
                                        >
                                            <Icon />
                                            <span className="truncate">{s.name}</span>
                                            {openServerIds.has(s.id) && (
                                                <span className="shrink-0 rounded-full border border-primary/30 px-1.5 text-[11px] text-primary">
                                                    open
                                                </span>
                                            )}
                                            <CommandShortcut className="data truncate">
                                                {s.host}
                                            </CommandShortcut>
                                        </CommandItem>
                                    );
                                })}
                            </CommandGroup>
                            <CommandSeparator />
                        </>
                    )}

                    <CommandGroup heading="Quick actions">
                        <CommandItem
                            value="add server create"
                            onSelect={() => go('/panel/servers/new')}
                        >
                            <Plus />
                            Add server
                        </CommandItem>
                        <CommandItem
                            value="create group new"
                            onSelect={() => go('/panel/groups?new=1')}
                        >
                            <FolderOpen />
                            Create group
                        </CommandItem>
                        <CommandItem
                            value="new saved login keychain entry credential password"
                            onSelect={() => go('/panel/keychain?new=1')}
                        >
                            <BookKey />
                            New saved login
                        </CommandItem>
                        <CommandItem
                            value="open local terminal"
                            onSelect={() => go('/panel/local')}
                        >
                            <Laptop />
                            Open local terminal
                        </CommandItem>
                        <CommandItem
                            value="serial console usb cable com port switch router"
                            onSelect={() => go('/panel/serial')}
                        >
                            <Cable />
                            Serial console
                        </CommandItem>
                        <CommandItem
                            value="new snippet command create"
                            onSelect={() => {
                                setOpen(false);
                                setShowNewSnippet(true);
                            }}
                        >
                            <SquareTerminal />
                            New snippet
                        </CommandItem>
                        <CommandItem
                            value="run command on several servers broadcast multiple"
                            onSelect={() => {
                                setOpen(false);
                                setShowRunOn(true);
                            }}
                        >
                            <Play />
                            Run a command on several servers
                        </CommandItem>
                    </CommandGroup>

                    <CommandSeparator />

                    <CommandGroup heading="Pages">
                        {/* Every page, hidden from the menu or not; old names still match. */}
                        {Object.values(NAV_ITEMS)
                            .filter((item) => itemAvailable(item, { isElectron }))
                            .map((item) => (
                                <CommandItem
                                    key={item.id}
                                    value={`${item.name} ${PAGE_SYNONYMS[item.id]}`}
                                    onSelect={() => go(item.href)}
                                >
                                    <item.icon />
                                    {item.name}
                                </CommandItem>
                            ))}
                        <CommandItem
                            value="appearance theme dark light colours layout"
                            onSelect={() => go('/panel/settings?section=appearance')}
                        >
                            <Palette />
                            Appearance
                        </CommandItem>
                        <CommandItem
                            value="arrange menu sidebar customize navigation reorder hide"
                            onSelect={() => go('/panel/settings?section=appearance#menu')}
                        >
                            <LayoutPanelLeft />
                            Arrange menu
                        </CommandItem>
                        <CommandItem
                            value="lock termi now screen"
                            onSelect={() => {
                                setOpen(false);
                                window.dispatchEvent(new Event(LOCK_NOW_EVENT));
                            }}
                        >
                            <Lock />
                            Lock Termi now
                        </CommandItem>
                    </CommandGroup>

                    {groups.length > 0 && (
                        <>
                            <CommandSeparator />
                            <CommandGroup heading="Groups">
                                {groups.map((g) => (
                                    <CommandItem
                                        key={g.id}
                                        value={`${g.name} group`}
                                        onSelect={() => go(`/panel/groups?group=${g.id}`)}
                                    >
                                        <FolderOpen />
                                        <span className="truncate">{g.name}</span>
                                        <CommandShortcut>
                                            {g._count.servers} server
                                            {g._count.servers === 1 ? '' : 's'}
                                        </CommandShortcut>
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        </>
                    )}

                    {entries.length > 0 && (
                        <>
                            <CommandSeparator />
                            <CommandGroup heading="Saved logins">
                                {entries.map((entry) => (
                                    <CommandItem
                                        key={entry.id}
                                        value={`${entry.label} ${entry.username} credential`}
                                        onSelect={() => go(`/panel/keychain?entry=${entry.id}`)}
                                    >
                                        <BookKey />
                                        <span className="truncate">{entry.label}</span>
                                        <CommandShortcut className="font-mono">
                                            {entry.username}
                                        </CommandShortcut>
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        </>
                    )}

                    {snippets.length > 0 && (
                        <>
                            <CommandSeparator />
                            <CommandGroup heading="Snippets">
                                {snippets.map((snippet) => (
                                    <CommandItem
                                        key={snippet.id}
                                        value={`${snippet.label} ${snippet.command} snippet run`}
                                        onSelect={() => runSnippet(snippet)}
                                    >
                                        {snippet.runImmediately ? <Play /> : <Keyboard />}
                                        <span className="truncate">{snippet.label}</span>
                                        <CommandShortcut className="truncate max-w-[200px] font-mono">
                                            {snippet.command}
                                        </CommandShortcut>
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        </>
                    )}

                    <CommandSeparator />
                    <CommandGroup heading="Settings">
                        {SETTINGS_SECTIONS.map((section) => (
                            <CommandItem
                                key={section.id}
                                value={`settings ${section.label}`}
                                onSelect={() => go(`/panel/settings?section=${section.id}`)}
                            >
                                <section.icon />
                                {section.label}
                            </CommandItem>
                        ))}
                    </CommandGroup>
                </CommandList>
                <div className="hidden items-center gap-4 border-t border-border px-3 py-2 text-[11px] text-muted-foreground sm:flex">
                    <span>
                        <kbd className="data">↵</kbd> connect
                    </span>
                    <span>
                        <kbd className="data">⇧↵</kbd> server details
                    </span>
                    <span className="ml-auto">
                        <kbd className="data">esc</kbd> close
                    </span>
                </div>
            </CommandDialog>
            {showRunOn && <RunOnServersDialog onClose={() => setShowRunOn(false)} />}
            <NewSnippetDialog
                open={showNewSnippet}
                onClose={() => setShowNewSnippet(false)}
                onCreated={(snippet) =>
                    mutateCache<{ snippets: Snippet[] }>('/api/snippets', (prev) => ({
                        snippets: [...(prev?.snippets ?? []), snippet],
                    }))
                }
            />
        </>
    );
}
