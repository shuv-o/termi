/**
 * Where "connect to this server" goes, for one protocol.
 *
 * SSH opens as a session in the workspace: sessions persist across navigation
 * and across devices, carry multiple shells, and are the only place the full
 * toolset (file manager, live metrics, port forwarding, recording) lives. The
 * graphical and file-transfer protocols still have dedicated full-screen pages,
 * because a Guacamole canvas or a two-pane transfer view is not a terminal tab.
 *
 * Every entry point — dashboard cards and rows, shared servers, groups, the
 * server detail page, QR connect codes — routes through here, so there is one
 * answer to "what happens when I click Connect".
 */
export function connectHref(serverId: string, protocol: string): string {
    if (protocol.toUpperCase() === 'SSH') {
        return `/panel/sessions?add=${encodeURIComponent(serverId)}`;
    }
    return `/panel/connect/${serverId}/${protocol.toLowerCase()}`;
}

/** True when `connectHref` will open a workspace session rather than a page. */
export function opensAsSession(protocol: string): boolean {
    return protocol.toUpperCase() === 'SSH';
}
