# Passkeys in the Termix desktop app

WebAuthn/passkey behaviour differs by platform inside Electron, so Termix routes
each platform to whatever actually works:

| Platform            | Mechanism                                                                                                                                         | Extra setup                                |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| **Windows** (10/11) | Chromium's built-in WebAuthn (Windows Hello / security keys)                                                                                      | None                                       |
| **Linux**           | Chromium's built-in WebAuthn (USB security keys)                                                                                                  | None                                       |
| **macOS**           | Native bridge → [`electron-webauthn`](https://github.com/iamEvanYT/electron-webauthn) → Apple AuthenticationServices (Touch ID / iCloud Keychain) | Code signing + entitlements + AASA (below) |

If the macOS native bridge is unavailable (module not built, or app not signed
with the right entitlements), the reveal flow automatically falls back to the
account-password prompt — nothing breaks.

## How it fits together

- `../apps/web/src/lib/webauthn/client.ts` — `webauthnRegister` / `webauthnAuthenticate` /
  `isPasskeySupported`. Chooses browser WebAuthn (web, Windows, Linux) or the
  Electron macOS bridge. Returns the same server-ready JSON either way.
- `../apps/electron/main.js` — optional `require('electron-webauthn')` (macOS only) and
  the `passkey:isAvailable` / `passkey:create` / `passkey:get` IPC handlers. Converts
  the server's base64url options to W3C options and maps the native result back to
  `RegistrationResponseJSON` / `AuthenticationResponseJSON`.
- `../apps/electron/preload.js` — exposes `window.electronAPI.platform` and `.passkey`.

The server (`../apps/web/src/lib/auth/passkey.ts`, `@simplewebauthn/server`) is
**unchanged** — every platform sends it the standard response shape, verified
against the server-issued challenge.

## macOS build requirements

The native path only works in a **code-signed** build with the correct
entitlements and a matching Apple App Site Association file.

1. **Install prerequisites (build machine):** Xcode Command Line Tools
   (`xcode-select --install`) and `pkg-config` (`brew install pkgconf`).
   `@electron-webauthn/macos` is an `os: darwin` optional dependency — it only
   builds on macOS and is skipped on Windows/Linux/CI.

2. **Apple Developer setup:** create an App ID with the **Associated Domains**
   capability and a Developer ID provisioning profile (see
   [electron-webauthn docs](https://github.com/iamEvanYT/electron-webauthn/blob/main/docs/entitlements-and-provisioning.md)).

3. **Entitlements:** edit `../apps/electron/entitlements.mac.plist` — replace
   `TEAM_ID` with your Apple Team ID. The bundle id must equal `build.appId`
   (`com.shuvoo.termi`) in the root `../package.json`. `webcredentials:` must equal
   the server's WebAuthn `rpID` (default `termix.run`).

4. **Apple App Site Association:** set `APPLE_TEAM_ID` (and optionally
   `APPLE_APP_BUNDLE_ID`) in the web deployment env. Then
   `https://<domain>/.well-known/apple-app-site-association` serves:

    ```json
    { "webcredentials": { "apps": ["TEAMID.com.shuvoo.termix"] } }
    ```

5. **Build:** `TERMIX_REMOTE_URL=https://termix.run npm run build:electron`
   with signing configured (`CSC_LINK` / `CSC_KEY_PASSWORD` or an installed
   Developer ID cert). The `mac.entitlements` wiring is already in the root
   `../package.json` `build` block.

> The desktop app's served origin (`TERMIX_REMOTE_URL`) must match the server's
> `rpID` / `NEXT_PUBLIC_APP_URL` domain, or WebAuthn verification will reject the
> ceremony on every platform.
