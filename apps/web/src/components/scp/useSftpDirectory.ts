'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RemoteEntry } from './types';

/**
 * Remote directory listing plus the mutations that act on it (mkdir, rename,
 * delete, download). Every mutation reloads the current directory on success.
 *
 * @param onLoadStart runs at the top of every listing fetch — the panel uses it
 *   to drop any selection, which would otherwise point at stale paths.
 */
export function useSftpDirectory(serverId: string, onLoadStart?: () => void) {
    const [currentPath, setCurrentPath] = useState('/');
    const [entries, setEntries] = useState<RemoteEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Kept in a ref so changing the callback doesn't re-trigger the initial load.
    const onLoadStartRef = useRef(onLoadStart);
    onLoadStartRef.current = onLoadStart;

    const loadDir = useCallback(
        async (path: string) => {
            setLoading(true);
            setError(null);
            onLoadStartRef.current?.();
            try {
                const res = await fetch(
                    `/api/servers/${serverId}/sftp/list?path=${encodeURIComponent(path)}`,
                );
                const data = await res.json();
                if (data.success) {
                    setEntries(data.data.entries);
                    setCurrentPath(path);
                } else {
                    setError(data.error ?? 'Cannot read directory');
                }
            } catch {
                setError('Network error');
            } finally {
                setLoading(false);
            }
        },
        [serverId],
    );

    useEffect(() => {
        loadDir('/');
    }, [loadDir]);

    const reload = useCallback(() => loadDir(currentPath), [loadDir, currentPath]);

    /** Browser-native download via a synthetic anchor click. */
    const download = useCallback(
        (entry: RemoteEntry) => {
            const a = document.createElement('a');
            a.href = `/api/servers/${serverId}/sftp/download?path=${encodeURIComponent(entry.path)}`;
            a.download = entry.name;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        },
        [serverId],
    );

    const createFolder = useCallback(
        async (name: string): Promise<boolean> => {
            const path = currentPath.replace(/\/+$/, '') + '/' + name;
            const res = await fetch(`/api/servers/${serverId}/sftp/mkdir`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path }),
            });
            const ok = (await res.json()).success;
            if (ok) await loadDir(currentPath);
            return ok;
        },
        [serverId, currentPath, loadDir],
    );

    const rename = useCallback(
        async (entry: RemoteEntry, newName: string): Promise<boolean> => {
            const newPath = entry.path.replace(/\/[^/]+$/, '') + '/' + newName;
            const res = await fetch(`/api/servers/${serverId}/sftp/rename`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ oldPath: entry.path, newPath }),
            });
            const ok = (await res.json()).success;
            if (ok) await loadDir(currentPath);
            return ok;
        },
        [serverId, currentPath, loadDir],
    );

    const remove = useCallback(
        async (targets: RemoteEntry[]) => {
            await Promise.all(
                targets.map((e) =>
                    fetch(`/api/servers/${serverId}/sftp/delete`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ path: e.path, isDirectory: e.type === 'dir' }),
                    }),
                ),
            );
            await loadDir(currentPath);
        },
        [serverId, currentPath, loadDir],
    );

    return {
        currentPath,
        entries,
        loading,
        error,
        loadDir,
        reload,
        download,
        createFolder,
        rename,
        remove,
    };
}
