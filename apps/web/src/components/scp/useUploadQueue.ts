'use client';

import { useCallback, useRef, useState } from 'react';
import type { FileTransport } from './transport';
import type { UploadItem } from './types';

/** Multi-file SFTP upload queue plus the drag-and-drop handlers for the panel. */
export function useUploadQueue(
    transport: FileTransport | null,
    currentPath: string,
    onUploaded: () => void,
) {
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

                if (!transport) {
                    setUploads((p) =>
                        p.map((u) =>
                            u.id === uid ? { ...u, status: 'error', error: 'Not connected' } : u,
                        ),
                    );
                    return;
                }
                transport
                    .upload(file, currentPath, (progress) =>
                        setUploads((p) => p.map((u) => (u.id === uid ? { ...u, progress } : u))),
                    )
                    .then(
                        () => {
                            setUploads((p) =>
                                p.map((u) =>
                                    u.id === uid ? { ...u, status: 'done', progress: 100 } : u,
                                ),
                            );
                            onUploaded();
                        },
                        (err: Error) =>
                            setUploads((p) =>
                                p.map((u) =>
                                    u.id === uid
                                        ? { ...u, status: 'error', error: err.message || 'Failed' }
                                        : u,
                                ),
                            ),
                    );
            });
        },
        [transport, currentPath, onUploaded],
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
