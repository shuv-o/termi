'use client';

import { useState } from 'react';
import { AlertCircle, Check, FolderPlus, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from './Overlays';
import type { RemoteEntry } from './types';

function DialogFooter({ children }: { children: React.ReactNode }) {
    return <div className="flex gap-2 justify-end">{children}</div>;
}

export function NewFolderDialog({
    onCreate,
    onClose,
}: {
    onCreate: (name: string) => Promise<boolean>;
    onClose: () => void;
}) {
    const [name, setName] = useState('');
    const [loading, setLoading] = useState(false);

    const submit = async () => {
        if (!name.trim()) return;
        setLoading(true);
        try {
            if (await onCreate(name.trim())) onClose();
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal title="New Folder" onClose={onClose}>
            <div className="space-y-3">
                <Input
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && submit()}
                    placeholder="folder-name"
                    className="bg-secondary border-border text-sm"
                />
                <DialogFooter>
                    <Button variant="secondary" size="sm" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button size="sm" onClick={submit} disabled={!name.trim() || loading}>
                        {loading ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                            <FolderPlus className="w-3.5 h-3.5" />
                        )}
                        Create
                    </Button>
                </DialogFooter>
            </div>
        </Modal>
    );
}

export function RenameDialog({
    entry,
    onRename,
    onClose,
}: {
    entry: RemoteEntry;
    onRename: (entry: RemoteEntry, newName: string) => Promise<boolean>;
    onClose: () => void;
}) {
    const [value, setValue] = useState(entry.name);
    const [loading, setLoading] = useState(false);

    const unchanged = !value.trim() || value === entry.name;

    const submit = async () => {
        if (unchanged) return;
        setLoading(true);
        try {
            if (await onRename(entry, value.trim())) onClose();
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal title="Rename" onClose={onClose}>
            <div className="space-y-3">
                <Input
                    autoFocus
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && submit()}
                    className="bg-secondary border-border text-sm"
                />
                <DialogFooter>
                    <Button variant="secondary" size="sm" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button size="sm" onClick={submit} disabled={unchanged || loading}>
                        {loading ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                            <Check className="w-3.5 h-3.5" />
                        )}
                        Rename
                    </Button>
                </DialogFooter>
            </div>
        </Modal>
    );
}

export function DeleteDialog({
    targets,
    onDelete,
    onClose,
}: {
    targets: RemoteEntry[];
    onDelete: (targets: RemoteEntry[]) => Promise<void>;
    onClose: () => void;
}) {
    const [loading, setLoading] = useState(false);

    const submit = async () => {
        setLoading(true);
        try {
            await onDelete(targets);
            onClose();
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal title="Confirm Delete" onClose={onClose}>
            <div className="space-y-3">
                <div className="flex gap-2.5 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                    <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                    <p className="text-xs text-slate-300">
                        Delete{' '}
                        {targets.length === 1 ? `"${targets[0].name}"` : `${targets.length} items`}?
                        {targets.some((e) => e.type === 'dir') &&
                            ' Directories will be removed recursively.'}{' '}
                        This cannot be undone.
                    </p>
                </div>
                <DialogFooter>
                    <Button variant="secondary" size="sm" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button variant="destructive" size="sm" onClick={submit} disabled={loading}>
                        {loading ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                        )}
                        Delete
                    </Button>
                </DialogFooter>
            </div>
        </Modal>
    );
}
