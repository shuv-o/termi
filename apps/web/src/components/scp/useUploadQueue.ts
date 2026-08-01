'use client';

import { useCallback, useRef, useState } from 'react';
import type { UploadItem } from './types';

/**
 * Multi-file SFTP upload queue plus the drag-and-drop handlers for the panel.
 *
 * Uses `XMLHttpRequest` rather than `fetch` because it's the only way to get
 * upload progress events for the per-file progress bars.
 */
export function useUploadQueue(serverId: string, currentPath: string, onUploaded: () => void) {
    const [uploads, setUploads] = useState<UploadItem[]>([]);
    const [expanded, setExpanded] = useState(true);
    const [dragging, setDragging] = useState(false);
    const dragCounterRef = useRef(0);

    const uploadFiles = useCallback(
        (files: FileList | File[]) => {
            setExpanded(true);
            Array.from(files).forEach((file) => {
                // Collision-free id for tracking this upload's progress row.
                const uid = crypto.randomUUID();
                setUploads((p) => [
                    ...p,
                    {
                        id: uid,
                        name: file.name,
                        size: file.size,
                        progress: 0,
                        status: 'uploading',
                    },
                ]);

                const xhr = new XMLHttpRequest();
                const fd = new FormData();
                fd.append('file', file);
                fd.append('path', currentPath);

                xhr.upload.onprogress = (ev) => {
                    if (ev.lengthComputable)
                        setUploads((p) =>
                            p.map((u) =>
                                u.id === uid
                                    ? { ...u, progress: Math.round((ev.loaded / ev.total) * 100) }
                                    : u,
                            ),
                        );
                };
                xhr.onload = () => {
                    const ok = xhr.status >= 200 && xhr.status < 300;
                    setUploads((p) =>
                        p.map((u) =>
                            u.id === uid
                                ? {
                                      ...u,
                                      status: ok ? 'done' : 'error',
                                      progress: 100,
                                      error: ok ? undefined : 'Failed',
                                  }
                                : u,
                        ),
                    );
                    if (ok) onUploaded();
                };
                xhr.onerror = () =>
                    setUploads((p) =>
                        p.map((u) =>
                            u.id === uid ? { ...u, status: 'error', error: 'Network error' } : u,
                        ),
                    );

                xhr.open('POST', `/api/servers/${serverId}/sftp/upload`);
                xhr.send(fd);
            });
        },
        [serverId, currentPath, onUploaded],
    );

    const dismiss = useCallback(
        (id: string) => setUploads((p) => p.filter((u) => u.id !== id)),
        [],
    );

    // Enter/leave fire per nested element, so track depth with a counter.
    const dragHandlers = {
        onDragEnter: (e: React.DragEvent) => {
            e.preventDefault();
            dragCounterRef.current++;
            if (e.dataTransfer.types.includes('Files')) setDragging(true);
        },
        onDragLeave: (e: React.DragEvent) => {
            e.preventDefault();
            dragCounterRef.current--;
            if (dragCounterRef.current === 0) setDragging(false);
        },
        onDragOver: (e: React.DragEvent) => {
            e.preventDefault();
        },
        onDrop: (e: React.DragEvent) => {
            e.preventDefault();
            setDragging(false);
            dragCounterRef.current = 0;
            if (e.dataTransfer.files.length > 0) uploadFiles(e.dataTransfer.files);
        },
    };

    const pendingCount = uploads.filter((u) => u.status === 'uploading').length;
    const doneCount = uploads.filter((u) => u.status === 'done').length;

    return {
        uploads,
        uploadFiles,
        dismiss,
        expanded,
        setExpanded,
        dragging,
        dragHandlers,
        pendingCount,
        doneCount,
    };
}
