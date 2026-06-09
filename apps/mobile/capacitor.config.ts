import type { CapacitorConfig } from '@capacitor/cli';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// The Capacitor CLI evaluates this file in Node. It usually runs as CJS
// (so __dirname exists); fall back to import.meta.url if ever loaded as ESM.
const here =
    typeof __dirname !== 'undefined' ? __dirname : dirname(fileURLToPath(import.meta.url));

// Server URL is baked at build time, mirroring the Electron shell.
// Resolution order:
//   1. TERMI_REMOTE_URL env var (dev / CI)
//   2. build-config.json written by `npm run config`
//   3. the hardcoded production default
function getRemoteUrl(): string {
    if (process.env.TERMI_REMOTE_URL) return process.env.TERMI_REMOTE_URL;
    try {
        const cfg = JSON.parse(readFileSync(join(here, 'build-config.json'), 'utf8'));
        if (cfg.remoteUrl) return cfg.remoteUrl;
    } catch {
        /* not generated yet — fall through to default */
    }
    return 'https://termi.shuvoo.com';
}

const remoteUrl = getRemoteUrl();
// Dev servers are reached over plain http (localhost / 10.0.2.2 on the Android
// emulator), so allow cleartext only when the baked URL is not https.
const isHttps = remoteUrl.startsWith('https://');

const config: CapacitorConfig = {
    appId: 'com.shuvoo.termi',
    appName: 'Termi',
    // Thin remote shell: the WebView loads the hosted Termi deployment directly,
    // so no local web build is bundled. `webDir` is only a fallback page.
    webDir: 'www',
    backgroundColor: '#0f172a',
    server: {
        url: remoteUrl,
        cleartext: !isHttps,
    },
    ios: {
        contentInset: 'always',
        backgroundColor: '#0f172a',
    },
    android: {
        allowMixedContent: false,
        backgroundColor: '#0f172a',
    },
};

export default config;
