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

interface ElectronAPI {
    isElectron: true;
    /** The host OS platform, e.g. 'darwin' | 'win32' | 'linux' (from process.platform). */
    platform?: NodeJS.Platform;
    /** Subscribe to navigation requests from the native app menu. Returns an unsubscribe fn. */
    onNavigate?: (cb: (routePath: string) => void) => () => void;
    localTerminal: ElectronLocalTerminalAPI;
    /** Native passkey bridge (macOS only). */
    passkey?: ElectronPasskeyAPI;
}

interface Window {
    electronAPI?: ElectronAPI;
}
