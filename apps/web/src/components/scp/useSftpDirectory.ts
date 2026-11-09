'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FileTransport } from './transport';
import type { RemoteEntry } from './types';

/**
 * Remote directory listing plus the mutations that act on it (mkdir, rename,
 * delete, download). Every mutation reloads the current directory on success.
 *
 * @param onLoadStart runs at the top of every listing fetch — the panel uses it
 *   to drop any selection, which would otherwise point at stale paths.
 */
export function useSftpDirectory(transport: FileTransport | null, onLoadStart?: () => void) {
    const [currentPath, setCurrentPath] = useState('/');
    const [entries, setEntries] = useState<RemoteEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Kept in a ref so changing the callback doesn't re-trigger the initial load.
    const onLoadStartRef = useRef(onLoadStart);
    onLoadStartRef.current = onLoadStart;

    const loadDir = useCallback(
        async (path: string) => {
            if (!transport) return;
            setLoading(true);
            setError(null);
            onLoadStartRef.current?.();
            try {
                setEntries(await transport.list(path));
                setCurrentPath(path);
            } catch (err) {
                setError((err as Error).message || 'Cannot read directory');
            } finally {
                setLoading(false);
            }
        },
        [transport],
    );

    useEffect(() => {
        loadDir('/');
    }, [loadDir]);

    const reload = useCallback(() => loadDir(currentPath), [loadDir, currentPath]);

    const download = useCallback(
        (entry: RemoteEntry) => {
            transport?.download(entry).catch((err: Error) => setError(err.message));
        },
        [transport],
    );

    /** Run a mutation, then reload; false (with the error shown) if it failed. */
    const mutate = useCallback(
        async (op: (t: FileTransport) => Promise<unknown>): Promise<boolean> => {
            if (!transport) return false;
            try {
                await op(transport);
                await loadDir(currentPath);
                return true;
            } catch (err) {
                setError((err as Error).message);
                return false;
            }
        },
        [transport, currentPath, loadDir],
    );

    const createFolder = useCallback(
        (name: string) => mutate((t) => t.mkdir(currentPath.replace(/\/+$/, '') + '/' + name)),
        [mutate, currentPath],
    );

    const rename = useCallback(
        (entry: RemoteEntry, newName: string) =>
            mutate((t) => t.rename(entry.path, entry.path.replace(/\/[^/]+$/, '') + '/' + newName)),
        [mutate],
    );

    const remove = useCallback(
        async (targets: RemoteEntry[]) => {
            if (!transport) return;
            const failed: string[] = [];
            for (const e of targets) await transport.remove(e).catch(() => failed.push(e.name));
            await loadDir(currentPath);
            if (failed.length) setError(`Could not delete ${failed.join(', ')}`);
        },
        [transport, currentPath, loadDir],
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
