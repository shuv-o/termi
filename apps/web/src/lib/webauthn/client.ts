/**
 * Unified WebAuthn (passkey) client wrapper.
 *
 * WebAuthn behaves differently depending on where the app runs:
 *
 *  - **Web browser / PWA**          → Chromium/Safari/Firefox native WebAuthn.
 *  - **Electron on Windows/Linux**  → Chromium's built-in WebAuthn works
 *                                     (Windows Hello / USB security keys), so we
 *                                     use the standard `@simplewebauthn/browser`.
 *  - **Electron on macOS**          → `navigator.credentials` is broken inside
 *                                     Electron, so we route through a native
 *                                     bridge (main process → `electron-webauthn`
 *                                     → Apple AuthenticationServices) over IPC.
 *
 * Every path returns the SAME shape (`RegistrationResponseJSON` /
 * `AuthenticationResponseJSON`) so callers and the server are platform-agnostic.
 */

import { startRegistration, startAuthentication } from '@simplewebauthn/browser';
import type {
    PublicKeyCredentialCreationOptionsJSON,
    PublicKeyCredentialRequestOptionsJSON,
    RegistrationResponseJSON,
    AuthenticationResponseJSON,
} from '@simplewebauthn/browser';

function electronAPI() {
    return typeof window !== 'undefined' ? window.electronAPI : undefined;
}

/** True when running inside the Electron desktop app on macOS. */
function isMacElectron() {
    const api = electronAPI();
    return Boolean(api?.isElectron && api.platform === 'darwin');
}

function browserSupportsWebAuthn() {
    return typeof window !== 'undefined' && typeof window.PublicKeyCredential !== 'undefined';
}

/** Turn a bridge error result into an Error whose `name` matches the WebAuthn
 * error codes the UI already handles (NotAllowedError, InvalidStateError, …). */
function webauthnError(code?: string, message?: string): Error {
    const err = new Error(message || code || 'Passkey operation failed');
    err.name = code || 'UnknownError';
    return err;
}

/**
 * Whether passkeys can actually be used in the current environment. The UI uses
 * this to decide between attempting a passkey ceremony and falling straight back
 * to a password prompt.
 */
export async function isPasskeySupported(): Promise<boolean> {
    if (isMacElectron()) {
        // macOS desktop: only if the native bridge loaded (module installed and
        // the app is code-signed with the required entitlements).
        const api = electronAPI();
        try {
            return api?.passkey ? await api.passkey.isAvailable() : false;
        } catch {
            return false;
        }
    }
    // Web, or Electron on Windows/Linux → rely on Chromium/browser WebAuthn.
    return browserSupportsWebAuthn();
}

/**
 * Perform a passkey REGISTRATION ceremony and return the server-ready response.
 * `optionsJSON` is the value from the server's register-options endpoint.
 */
export async function webauthnRegister(
    optionsJSON: PublicKeyCredentialCreationOptionsJSON,
): Promise<RegistrationResponseJSON> {
    if (isMacElectron()) {
        const api = electronAPI();
        if (!api?.passkey) throw webauthnError('NotSupportedError', 'Native passkeys unavailable');
        const res = await api.passkey.create(optionsJSON);
        if (!res.success) throw webauthnError(res.error, res.message);
        return res.data;
    }
    return startRegistration({ optionsJSON });
}

/**
 * Perform a passkey AUTHENTICATION ceremony and return the server-ready response.
 * `optionsJSON` is the value from the server's authenticate-options endpoint.
 */
export async function webauthnAuthenticate(
    optionsJSON: PublicKeyCredentialRequestOptionsJSON,
): Promise<AuthenticationResponseJSON> {
    if (isMacElectron()) {
        const api = electronAPI();
        if (!api?.passkey) throw webauthnError('NotSupportedError', 'Native passkeys unavailable');
        const res = await api.passkey.get(optionsJSON);
        if (!res.success) throw webauthnError(res.error, res.message);
        return res.data;
    }
    return startAuthentication({ optionsJSON });
}
