# PWA install & Android TWA

Termi is a fully installable PWA. This doc covers the two distribution paths:

1. **PWA install** — works today on Android, desktop Chromium, and iOS Safari.
2. **TWA (Trusted Web Activity)** — wraps the PWA into a signed Android app for the Google Play Store.

> iOS has no TWA/PWA-store path. For the App Store you need a Capacitor/native wrapper.
> iOS users install via Safari → **Share → Add to Home Screen** (the in-app banner prompts this).

---

## What's already wired

| Piece | Location |
|-------|----------|
| Web App Manifest | `public/manifest.json` (maskable icons, shortcuts, `handle_links`, `launch_handler`) |
| Service worker | `public/sw.js` (offline cache + web push) |
| SW registration | `src/app/layout.tsx` (inline, nonce'd) |
| iOS meta tags | `src/app/layout.tsx` → `appleWebApp` metadata |
| In-app install prompt | `src/components/pwa/InstallPrompt.tsx` (Android button + iOS hint) |
| **Digital Asset Links** | `public/.well-known/assetlinks.json` ← **must be edited, see below** |

---

## Building the Android TWA

### 1. Install Bubblewrap

```bash
npm i -g @bubblewrap/cli
# Requires a JDK 17+ and the Android SDK (Bubblewrap can install them on first run).
```

### 2. Initialize from the live manifest

```bash
bubblewrap init --manifest https://termi.shuvoo.com/manifest.json
```

Answer the prompts (package id `com.shuvoo.termi`, app name `Termi`, etc.). Keep the
package id consistent with `assetlinks.json`.

### 3. Build the signed app

```bash
bubblewrap build
```

This produces `app-release-signed.apk` (for testing) and `app-release-bundle.aab`
(for Play upload), plus a signing keystore. **Back up the keystore** — losing it
means you can never update the app.

### 4. Wire up Digital Asset Links (removes the URL bar)

Get the SHA-256 fingerprint of the signing key:

```bash
keytool -list -v -keystore android.keystore -alias android | grep SHA256
```

> If you use **Google Play App Signing** (recommended), the fingerprint that matters
> is the one Play shows under **Release → Setup → App signing**, not your local key.
> You can list both there.

Paste the fingerprint(s) into `public/.well-known/assetlinks.json`, replacing
`REPLACE_WITH_YOUR_APP_SIGNING_SHA256_FINGERPRINT`. Multiple fingerprints are allowed:

```json
"sha256_cert_fingerprints": [
    "AA:BB:CC:...local-key...",
    "11:22:33:...play-app-signing-key..."
]
```

Deploy the web app so `https://termi.shuvoo.com/.well-known/assetlinks.json` returns
HTTP 200 with `Content-Type: application/json`. Verify:

```bash
curl -i https://termi.shuvoo.com/.well-known/assetlinks.json
```

Verification can also be checked at:
`https://developers.google.com/digital-asset-links/tools/generator`

### 5. Upload to Play

Upload the `.aab` in the Play Console. Enable Play App Signing (default), then make
sure that key's fingerprint is in `assetlinks.json` (step 4). If the URL bar still
shows in the installed app, the asset links don't match the signing key.

---

## No-CLI alternative: PWABuilder

https://www.pwabuilder.com/ — paste the deployed URL, download a ready-to-upload
Android package, and it generates `assetlinks.json` content for you. Same fingerprint
rule applies.
