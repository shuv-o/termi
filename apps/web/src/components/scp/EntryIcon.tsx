'use client';

import { Archive, Code, File, FileText, Film, Folder, Image, Link2, Music } from 'lucide-react';
import type { RemoteEntry } from './types';

const EXT_ICONS: Record<string, React.ElementType> = {
    txt: FileText,
    md: FileText,
    log: FileText,
    csv: FileText,
    json: FileText,
    yaml: FileText,
    yml: FileText,
    xml: FileText,
    jpg: Image,
    jpeg: Image,
    png: Image,
    gif: Image,
    svg: Image,
    webp: Image,
    mp4: Film,
    mov: Film,
    avi: Film,
    mkv: Film,
    mp3: Music,
    wav: Music,
    flac: Music,
    ogg: Music,
    zip: Archive,
    tar: Archive,
    gz: Archive,
    bz2: Archive,
    xz: Archive,
    '7z': Archive,
    tgz: Archive,
    js: Code,
    ts: Code,
    jsx: Code,
    tsx: Code,
    py: Code,
    go: Code,
    rs: Code,
    java: Code,
    c: Code,
    cpp: Code,
    css: Code,
    html: Code,
    sh: Code,
};

/** File-type glyph, picked from the entry kind and then its extension. */
export function EntryIcon({ entry, size = 'sm' }: { entry: RemoteEntry; size?: 'sm' | 'md' }) {
    const cls = size === 'md' ? 'w-5 h-5' : 'w-4 h-4';
    if (entry.type === 'dir') return <Folder className={`${cls} text-amber-400 shrink-0`} />;
    if (entry.type === 'symlink') return <Link2 className={`${cls} text-sky-400 shrink-0`} />;
    const ext = entry.name.split('.').pop()?.toLowerCase() ?? '';
    const Icon = EXT_ICONS[ext] ?? File;
    return <Icon className={`${cls} text-slate-400 shrink-0`} />;
}
