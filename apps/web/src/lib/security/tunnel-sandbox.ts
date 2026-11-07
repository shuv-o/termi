/**
 * CSP sandbox for everything served under /tunnel/. Without `allow-same-origin`
 * a tunneled page gets an opaque origin: its scripts run, but Termi's session
 * cookie, APIs, storage, service workers and the desktop bridge stay out of
 * reach. Applied by both the tunnel route and proxy.ts.
 */
export const TUNNEL_SANDBOX =
    'sandbox allow-scripts allow-forms allow-popups allow-modals allow-downloads';
