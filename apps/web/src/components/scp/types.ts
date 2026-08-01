export interface RemoteEntry {
    name: string;
    path: string;
    type: 'file' | 'dir' | 'symlink' | 'other';
    size: number;
    modifiedAt: number;
    permissions: string;
    mode: number;
}

export interface UploadItem {
    id: string;
    name: string;
    size: number;
    progress: number;
    status: 'uploading' | 'done' | 'error';
    error?: string;
}

export interface FileManagerPanelProps {
    serverId: string;
    /** Called when the user clicks the close / X button */
    onClose?: () => void;
    /** Called whenever selected entries or current path changes (for transfer mode) */
    onSelectionChange?: (selected: RemoteEntry[], currentPath: string) => void;
}

/** Breadcrumb trail for a path, starting at Root. */
export function segments(p: string) {
    if (p === '/') return [{ label: 'Root', path: '/' }];
    const parts = p.split('/').filter(Boolean);
    return [
        { label: 'Root', path: '/' },
        ...parts.map((s, i) => ({ label: s, path: '/' + parts.slice(0, i + 1).join('/') })),
    ];
}

/** Parent directory of a path; Root is its own parent. */
export function parent(p: string) {
    if (p === '/') return '/';
    const parts = p.split('/').filter(Boolean);
    parts.pop();
    return parts.length === 0 ? '/' : '/' + parts.join('/');
}

/** Directories first, then alphabetical — the order the listing renders in. */
export function sortEntries(entries: RemoteEntry[]): RemoteEntry[] {
    return [...entries].sort((a, b) => {
        if (a.type === 'dir' && b.type !== 'dir') return -1;
        if (a.type !== 'dir' && b.type === 'dir') return 1;
        return a.name.localeCompare(b.name);
    });
}
