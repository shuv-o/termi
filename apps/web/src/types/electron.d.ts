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
    { success: true; data: T } | { success: false; error: string; message?: string };

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
 * Port forwarding from the desktop shell, which can bind real local ports (a
 * browser tab can't). Shells without `modes` only support local forwarding.
 */
type ForwardMode = 'local' | 'dynamic' | 'remote';

interface ElectronTunnelAPI {
    modes?: ForwardMode[];
    open: (opts: {
        gatewayUrl: string;
        serverId: string;
        token: string;
        mode?: ForwardMode;
        /** local / dynamic: the port to listen on here (0 = any). */
        localPort?: number;
        /** remote: the service on this computer the server reaches. */
        target?: { host: string; port: number };
    }) => Promise<
        | { success: true; id: string; localPort?: number; bindPort?: number }
        | { success: false; error: string }
    >;
    close: (id: string) => void;
    /** Ids of the tunnels running now. */
    list?: () => Promise<string[]>;
    onClosed?: (cb: (info: { id: string; reason: string }) => void) => () => void;
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
    /** The app's own gateway: connect to your own servers from this computer. */
    localGateway?: ElectronLocalGatewayAPI;
}

/** A public P-256 JWK. */
interface DevicePublicKey {
    kty: 'EC';
    crv: 'P-256';
    x: string;
    y: string;
}

type LocalGatewayEvent =
    | { id: string; type: 'open' }
    | { id: string; type: 'message'; data: string | ArrayBuffer }
    | { id: string; type: 'close'; code: number; reason: string }
    | { id: string; type: 'error' };

interface ElectronLocalGatewayAPI {
    /** This computer's public keys and name, to register it with Termi. */
    device: () => Promise<
        { name: string; encKey: DevicePublicKey; sigKey: DevicePublicKey } | { error: string }
    >;
    /** Open a connection on the app's gateway; `query` is the /connect query string. */
    open: (id: string, query: string) => Promise<{ ok: true } | { error: string }>;
    send: (id: string, data: string | ArrayBuffer) => void;
    close: (id: string, code?: number, reason?: string) => void;
    onEvent: (cb: (e: LocalGatewayEvent) => void) => () => void;
}

interface Window {
    electronAPI?: ElectronAPI;
}
