/** Minimal server shape the sessions workspace needs from `/api/servers`. */
export interface ServerItem {
    id: string;
    name: string;
    protocol: string;
    description?: string;
    host?: string;
    hasPassword?: boolean;
}

/** Which half of the workspace is on screen. */
export type WorkspaceMode = 'terminal' | 'transfer';

/** Session list presentation: left rail or browser-style tab strip. */
export type LayoutMode = 'sidebar' | 'tabbar';
