/**
 * Canonical icon and color per connection protocol.
 *
 * Servers render in several places (dashboard cards/rows, groups, server
 * detail, shared-with-me) — this is the single source of truth so the same
 * protocol never gets a different color or icon depending on which page
 * happens to render it.
 */
import { FolderOpen, Monitor, Terminal } from 'lucide-react';

export type Protocol = 'SSH' | 'SCP' | 'RDP' | 'VNC' | 'TELNET';

export const protocolIcons: Record<string, typeof Terminal> = {
    SSH: Terminal,
    SCP: FolderOpen,
    RDP: Monitor,
    VNC: Monitor,
    TELNET: Terminal,
};

export const protocolColors: Record<string, string> = {
    SSH: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    SCP: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    RDP: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
    VNC: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
    TELNET: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
};
