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
        NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? 'https://github.com/shuv-o/termi',
    },

    // Prevent Next.js/Turbopack from bundling packages that use native Node.js
    // addons (ssh2 → cpu-features, sshcrypto). They must be required at runtime
    // via the normal Node.js module resolution, not inlined into the bundle.
    serverExternalPackages: ['ssh2', 'cpu-features', 'sshcrypto', 'web-push', 'node-cron'],

    // Defense-in-depth: every path below can carry per-session/per-user data.
    // The relevant route/response helpers already set Cache-Control
    // themselves (lib/api/utils.ts for /api/*, the tunnel proxy route for
    // /tunnel/*), but this is a backstop for anything that builds a response
    // without going through those — otherwise a shared cache in front of the
    // deployment (CDN, reverse proxy) could store one user's authenticated
    // response and replay it to the next visitor.
    //   /api/*              — JSON endpoints, most already covered by lib/api/utils.ts
    //   /tunnel/*            — same-origin reverse proxy into a user's own tunneled server
    //   /panel/*             — the authenticated dashboard (servers, keychain, settings, sessions)
    //   /invitations/*       — single-use server-share invitation tokens
    //   /setup-encryption    — master-key setup flow
    //   /unlock-encryption   — master-key unlock flow
    //   /reset-password      — single-use password-reset token flow
    async headers() {
        const noStore = [{ key: 'Cache-Control', value: 'private, no-store' }];
        return [
            { source: '/api/:path*', headers: noStore },
            { source: '/tunnel/:path*', headers: noStore },
            { source: '/panel/:path*', headers: noStore },
            { source: '/invitations/:path*', headers: noStore },
            { source: '/setup-encryption', headers: noStore },
            { source: '/unlock-encryption', headers: noStore },
            { source: '/reset-password', headers: noStore },
        ];
    },
};

export default nextConfig;
