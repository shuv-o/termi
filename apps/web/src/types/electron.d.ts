interface ElectronLocalTerminalAPI {
    create: (
        id: string,
        opts: { cols: number; rows: number; cwd?: string }
    ) => Promise<{ success: boolean; error?: string }>;
    write: (id: string, data: string) => void;
    resize: (id: string, cols: number, rows: number) => void;
    kill: (id: string) => void;
    onData: (id: string, cb: (data: string) => void) => () => void;
    onExit: (id: string, cb: (code: number) => void) => () => void;
}

interface ElectronAPI {
    isElectron: true;
    /** Subscribe to navigation requests from the native app menu. Returns an unsubscribe fn. */
    onNavigate?: (cb: (routePath: string) => void) => () => void;
    localTerminal: ElectronLocalTerminalAPI;
}

interface Window {
    electronAPI?: ElectronAPI;
}
