/**
 * Canonical icon and colour per connection protocol.
 *
 * Servers render in several places (dashboard cards/rows, the dashboard filter
 * chips, groups, server detail, shared-with-me, the add/edit form) — this is
 * the single source of truth so the same protocol never gets a different
 * colour or icon depending on which page happens to render it. Three copies of
 * this table used to exist, and they had already drifted apart on opacity.
 *
 * These colours are deliberately *categorical*, not status: they distinguish
 * SSH from RDP, they do not say anything is healthy. State colours live in
 * `status-style.ts` and come from the `--success/--warning/--danger/--info`
 * tokens. Keeping the two scales separate is what makes a green SSH chip next
 * to a green "online" pill read as intentional rather than accidental.
 *
 * Tailwind only sees class names it can find as literal strings, so each
 * variant is spelled out in full rather than composed from a colour name.
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

/** Tinted badge/pill — the default way to mark a server with its protocol. */
export const protocolColors: Record<string, string> = {
    SSH: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    SCP: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    RDP: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
    VNC: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
    TELNET: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
};

/** Selected filter chip (dashboard toolbar) — same hues, one step stronger. */
export const protocolChipActive: Record<string, string> = {
    SSH: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
    SCP: 'bg-blue-500/20 text-blue-400 border-blue-500/40',
    RDP: 'bg-purple-500/20 text-purple-400 border-purple-500/40',
    VNC: 'bg-orange-500/20 text-orange-400 border-orange-500/40',
    TELNET: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40',
};

/** Unselected filter chip — neutral until hovered, then it previews its hue. */
export const protocolChipIdle: Record<string, string> = {
    SSH: 'text-muted-foreground border-border hover:border-emerald-500/30 hover:text-emerald-400',
    SCP: 'text-muted-foreground border-border hover:border-blue-500/30 hover:text-blue-400',
    RDP: 'text-muted-foreground border-border hover:border-purple-500/30 hover:text-purple-400',
    VNC: 'text-muted-foreground border-border hover:border-orange-500/30 hover:text-orange-400',
    TELNET: 'text-muted-foreground border-border hover:border-cyan-500/30 hover:text-cyan-400',
};

/** Selected-card ring, used by the protocol picker in the server form. */
export const protocolRings: Record<string, string> = {
    SSH: 'ring-emerald-500/40 border-emerald-500/60',
    SCP: 'ring-blue-500/40 border-blue-500/60',
    RDP: 'ring-purple-500/40 border-purple-500/60',
    VNC: 'ring-orange-500/40 border-orange-500/60',
    TELNET: 'ring-cyan-500/40 border-cyan-500/60',
};
