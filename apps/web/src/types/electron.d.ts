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
    localTerminal: ElectronLocalTerminalAPI;
}

interface Window {
    electronAPI?: ElectronAPI;
}
