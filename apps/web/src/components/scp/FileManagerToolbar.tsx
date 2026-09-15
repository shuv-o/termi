'use client';

import { useEffect, useRef } from 'react';
import {
    CheckSquare,
    ChevronRight,
    Eye,
    EyeOff,
    FolderPlus,
    Home,
    RefreshCw,
    Upload,
    X,
} from 'lucide-react';
import { segments } from './types';

function ToolbarButton({
    icon: Icon,
    title,
    onClick,
    active,
    disabled,
    className = 'text-muted-foreground hover:text-white hover:bg-secondary',
    padding = 'p-1.5',
    spin,
}: {
    icon: React.ElementType;
    title: string;
    onClick: () => void;
    active?: boolean;
    disabled?: boolean;
    className?: string;
    padding?: string;
    spin?: boolean;
}) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            title={title}
            className={`${padding} rounded-sm transition-colors ${
                active ? 'text-info bg-info/10' : className
            }`}
        >
            <Icon className={`w-4 h-4 ${spin ? 'animate-spin' : ''}`} />
        </button>
    );
}

/** Scrollable breadcrumb trail plus the panel's action buttons. */
export function FileManagerToolbar({
    currentPath,
    loading,
    isMobile,
    selectMode,
    onToggleSelectMode,
    showHidden,
    onToggleHidden,
    onNavigate,
    onNewFolder,
    onUpload,
    onRefresh,
    onClose,
}: {
    currentPath: string;
    loading: boolean;
    isMobile: boolean;
    selectMode: boolean;
    onToggleSelectMode: () => void;
    showHidden: boolean;
    onToggleHidden: () => void;
    onNavigate: (path: string) => void;
    onNewFolder: () => void;
    onUpload: () => void;
    onRefresh: () => void;
    onClose?: () => void;
}) {
    const breadcrumbRef = useRef<HTMLDivElement>(null);
    const segs = segments(currentPath);

    // Keep the deepest crumb in view as the user descends.
    useEffect(() => {
        if (breadcrumbRef.current) {
            breadcrumbRef.current.scrollLeft = breadcrumbRef.current.scrollWidth;
        }
    }, [currentPath]);

    return (
        <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-border bg-background">
            <div
                ref={breadcrumbRef}
                className="flex items-center gap-0.5 flex-1 min-w-0 overflow-x-auto"
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
                <button
                    onClick={() => onNavigate('/')}
                    className="p-1.5 rounded-sm hover:bg-secondary text-muted-foreground hover:text-white transition-colors shrink-0"
                    title="Root"
                >
                    <Home className="w-4 h-4" />
                </button>
                {segs.slice(1).map((seg, i) => (
                    <span key={seg.path} className="flex items-center gap-0.5 shrink-0">
                        <ChevronRight className="w-3 h-3 text-muted-foreground/60 shrink-0" />
                        {i === segs.length - 2 ? (
                            <span className="text-xs text-white font-medium px-1 whitespace-nowrap">
                                {seg.label}
                            </span>
                        ) : (
                            <button
                                onClick={() => onNavigate(seg.path)}
                                className="text-xs text-muted-foreground hover:text-white px-1 hover:underline whitespace-nowrap"
                            >
                                {seg.label}
                            </button>
                        )}
                    </span>
                ))}
            </div>

            <div className="flex items-center gap-0.5 shrink-0">
                {isMobile && (
                    <ToolbarButton
                        icon={CheckSquare}
                        title="Select files"
                        onClick={onToggleSelectMode}
                        active={selectMode}
                        padding="p-2"
                        className="text-muted-foreground/80 hover:text-white hover:bg-secondary"
                    />
                )}
                <ToolbarButton
                    icon={showHidden ? Eye : EyeOff}
                    title={showHidden ? 'Hide hidden files' : 'Show hidden files'}
                    onClick={onToggleHidden}
                    active={showHidden}
                    className="text-muted-foreground/80 hover:text-white hover:bg-secondary"
                />
                <ToolbarButton icon={FolderPlus} title="New folder" onClick={onNewFolder} />
                <ToolbarButton
                    icon={Upload}
                    title="Upload files"
                    onClick={onUpload}
                    className="text-muted-foreground hover:text-info hover:bg-info/10"
                />
                <ToolbarButton
                    icon={RefreshCw}
                    title="Refresh"
                    onClick={onRefresh}
                    disabled={loading}
                    spin={loading}
                />
                {onClose && (
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-sm text-muted-foreground/80 hover:text-white hover:bg-secondary transition-colors ml-0.5"
                        title="Close file manager"
                    >
                        <X className="w-4 h-4" />
                    </button>
                )}
            </div>
        </div>
    );
}
