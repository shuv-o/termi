'use client';

import Link from 'next/link';
import { Activity, KeyRound, MoreVertical, Pencil, Share2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ServerItem } from './types';

/** The "…" overflow menu shared by the grid card and the list row. */
export function ServerActionsMenu({
    server,
    onEdit,
    onShare,
    onCopyPassword,
    onDelete,
    triggerClassName,
    triggerVariant = 'secondary',
    iconClassName = 'h-4 w-4',
}: {
    server: ServerItem;
    onEdit: () => void;
    onShare: () => void;
    onCopyPassword: () => void;
    onDelete: () => void;
    triggerClassName?: string;
    triggerVariant?: 'secondary' | 'ghost';
    iconClassName?: string;
}) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant={triggerVariant} size="icon" className={triggerClassName}>
                    <MoreVertical className={iconClassName} />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 bg-card border-border">
                <DropdownMenuItem asChild>
                    <Link href={`/panel/servers/${server.id}`} className="flex items-center gap-2">
                        <Activity className="w-3.5 h-3.5 text-muted-foreground" /> Details
                    </Link>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onEdit} className="gap-2">
                    <Pencil className="w-3.5 h-3.5 text-muted-foreground" /> Edit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onShare} className="gap-2">
                    <Share2 className="w-3.5 h-3.5 text-muted-foreground" /> Share
                </DropdownMenuItem>
                {server.hasPassword && (
                    <DropdownMenuItem onClick={onCopyPassword} className="gap-2">
                        <KeyRound className="w-3.5 h-3.5 text-muted-foreground" /> Copy Password
                    </DropdownMenuItem>
                )}
                <DropdownMenuSeparator className="bg-border" />
                <DropdownMenuItem
                    onClick={onDelete}
                    className="gap-2 text-destructive focus:text-destructive"
                >
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
