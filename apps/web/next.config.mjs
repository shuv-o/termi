/** @type {import('next').NextConfig} */
const nextConfig = {
    // reactStrictMode intentionally disabled: React 18 StrictMode double-mounts
    // effects in development, which causes WebSocket connections to be immediately
    // closed and re-opened. For persistent connections (WebSocket/RDP/SSH) this
    // produces the ready→closed pattern. Use the React DevTools Profiler instead.
    reactStrictMode: false,
    poweredByHeader: false,

    // Standalone output for Docker
    output: 'standalone',

    // Allow the Next.js dev server to accept HMR WebSocket connections from
    // 127.0.0.1 (used by Electron) and localhost.  Without this, the dev server
    // rejects the WebSocket upgrade with an invalid HTTP response when the page
    // is loaded inside Electron.
    allowedDevOrigins: ['127.0.0.1', 'localhost'],

    // Environment variables exposed to client
    env: {
        NEXT_PUBLIC_APP_NAME: 'Termi',
        NEXT_PUBLIC_APP_VERSION: '1.0.0',
        NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL ?? 'https://github.com/shuvoooo/termi',
    },

    // Prevent Next.js/Turbopack from bundling packages that use native Node.js
    // addons (ssh2 → cpu-features, sshcrypto). They must be required at runtime
    // via the normal Node.js module resolution, not inlined into the bundle.
    serverExternalPackages: ['ssh2', 'cpu-features', 'sshcrypto', 'web-push', 'node-cron'],
};

export default nextConfig;
