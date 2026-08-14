interface ElectronLocalTerminalAPI {
    create: (
        id: string,
        opts: { cols: number; rows: number; cwd?: string },
    ) => Promise<{ success: boolean; error?: string }>;
    write: (id: string, data: string) => void;
    resize: (id: string, cols: number, rows: number) => void;
    kill: (id: string) => void;
    onData: (id: string, cb: (data: string) => void) => () => void;
    onExit: (id: string, cb: (code: number) => void) => () => void;
}

/** Result of a native passkey ceremony bridged from the main process. */
type ElectronPasskeyResult<T> =
    | { success: true; data: T }
    | { success: false; error: string; message?: string };

/**
 * Native passkey bridge — only wired on macOS, where Chromium's WebAuthn is
 * broken inside Electron. On Windows/Linux the renderer uses the browser's own
 * WebAuthn instead and this object may be absent.
 */
interface ElectronPasskeyAPI {
    /** Whether native passkeys are usable (macOS + native module + entitlements). */
    isAvailable: () => Promise<boolean>;
    create: (
        optionsJSON: import('@simplewebauthn/browser').PublicKeyCredentialCreationOptionsJSON,
    ) => Promise<ElectronPasskeyResult<import('@simplewebauthn/browser').RegistrationResponseJSON>>;
    get: (
        optionsJSON: import('@simplewebauthn/browser').PublicKeyCredentialRequestOptionsJSON,
    ) => Promise<
        ElectronPasskeyResult<import('@simplewebauthn/browser').AuthenticationResponseJSON>
    >;
}

/** Background state of the shell auto-updater, pushed from the main process. */
type ElectronUpdaterStatus =
    | { state: 'checking' }
    | { state: 'available'; version: string }
    | { state: 'none' }
    | { state: 'downloaded'; version: string }
    | { state: 'error'; message: string };

interface ElectronUpdaterProgress {
    percent: number;
    transferred: number;
    total: number;
    bytesPerSecond: number;
}

/** Auto-update bridge (GitHub Releases). Present in packaged desktop builds. */
interface ElectronUpdaterAPI {
    /** Trigger an immediate update check. */
    check: () => Promise<{ success: boolean; version?: string; error?: string }>;
    /** Apply a downloaded update now (quits and relaunches). Resolves false if none is ready. */
    install: () => Promise<boolean>;
    /** The running app version. */
    getVersion: () => Promise<string>;
    /** Subscribe to updater status changes. Returns an unsubscribe fn. */
    onStatus: (cb: (status: ElectronUpdaterStatus) => void) => () => void;
    /** Subscribe to download progress. Returns an unsubscribe fn. */
    onProgress: (cb: (progress: ElectronUpdaterProgress) => void) => () => void;
}

/** Commands dispatched by the native "Shell" menu (see apps/electron/main.js). */
type AppCommand = 'shell:new' | 'shell:close' | 'shell:next' | 'shell:prev' | 'palette:open';

/**
 * Local port-forward bridge — the desktop shell can bind a real local TCP
 * port (a browser tab can't), bridging it to the gateway's tunnel WebSocket.
 */
interface ElectronTunnelAPI {
    open: (opts: {
        gatewayUrl: string;
        serverId: string;
        token: string;
        localPort?: number;
    }) => Promise<{ success: true; id: string; localPort: number } | { success: false; error: string }>;
    close: (id: string) => void;
}

interface ElectronAPI {
    isElectron: true;
    /** The host OS platform, e.g. 'darwin' | 'win32' | 'linux' (from process.platform). */
    platform?: NodeJS.Platform;
    /** Auto-update bridge (packaged builds only). */
    updater?: ElectronUpdaterAPI;
    /** Subscribe to navigation requests from the native app menu. Returns an unsubscribe fn. */
    onNavigate?: (cb: (routePath: string) => void) => () => void;
    /** Subscribe to app commands from the native "Shell" menu. Returns an unsubscribe fn. */
    onCommand?: (cb: (command: AppCommand) => void) => () => void;
    localTerminal: ElectronLocalTerminalAPI;
    /** Native passkey bridge (macOS only). */
    passkey?: ElectronPasskeyAPI;
    /** Local port-forward bridge (desktop shell only). */
    tunnel?: ElectronTunnelAPI;
}

interface Window {
    electronAPI?: ElectronAPI;
}
