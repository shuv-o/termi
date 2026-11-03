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
    SSH: 'bg-proto-ssh/10 text-proto-ssh border-proto-ssh/25',
    SCP: 'bg-proto-scp/10 text-proto-scp border-proto-scp/25',
    RDP: 'bg-proto-rdp/10 text-proto-rdp border-proto-rdp/25',
    VNC: 'bg-proto-vnc/10 text-proto-vnc border-proto-vnc/25',
    TELNET: 'bg-proto-telnet/10 text-proto-telnet border-proto-telnet/25',
};

/** Selected filter chip (dashboard toolbar) — same hues, one step stronger. */
export const protocolChipActive: Record<string, string> = {
    SSH: 'bg-proto-ssh/20 text-proto-ssh border-proto-ssh/40',
    SCP: 'bg-proto-scp/20 text-proto-scp border-proto-scp/40',
    RDP: 'bg-proto-rdp/20 text-proto-rdp border-proto-rdp/40',
    VNC: 'bg-proto-vnc/20 text-proto-vnc border-proto-vnc/40',
    TELNET: 'bg-proto-telnet/20 text-proto-telnet border-proto-telnet/40',
};

/** Unselected filter chip — neutral until hovered, then it previews its hue. */
export const protocolChipIdle: Record<string, string> = {
    SSH: 'text-muted-foreground border-border hover:border-proto-ssh/30 hover:text-proto-ssh',
    SCP: 'text-muted-foreground border-border hover:border-proto-scp/30 hover:text-proto-scp',
    RDP: 'text-muted-foreground border-border hover:border-proto-rdp/30 hover:text-proto-rdp',
    VNC: 'text-muted-foreground border-border hover:border-proto-vnc/30 hover:text-proto-vnc',
    TELNET: 'text-muted-foreground border-border hover:border-proto-telnet/30 hover:text-proto-telnet',
};

/** Selected-card ring, used by the protocol picker in the server form. */
export const protocolRings: Record<string, string> = {
    SSH: 'ring-proto-ssh/40 border-proto-ssh/60',
    SCP: 'ring-proto-scp/40 border-proto-scp/60',
    RDP: 'ring-proto-rdp/40 border-proto-rdp/60',
    VNC: 'ring-proto-vnc/40 border-proto-vnc/60',
    TELNET: 'ring-proto-telnet/40 border-proto-telnet/60',
};
