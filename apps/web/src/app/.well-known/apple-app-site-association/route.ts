/**
 * Apple App Site Association (AASA)
 *
 * Served at https://<domain>/.well-known/apple-app-site-association so Apple can
 * verify the macOS desktop app's `webcredentials:<domain>` associated-domain
 * entitlement — required for native passkeys in the Electron app on macOS.
 *
 * Set APPLE_TEAM_ID (and optionally APPLE_APP_BUNDLE_ID) in the deployment env.
 * Without APPLE_TEAM_ID this endpoint 404s, so it stays inert until configured.
 */

export const dynamic = 'force-static';

export function GET() {
    const teamId = process.env.APPLE_TEAM_ID;
    if (!teamId) {
        return new Response('Not configured', { status: 404 });
    }
    const bundleId = process.env.APPLE_APP_BUNDLE_ID || 'com.shuvoo.termi';

    const body = JSON.stringify({
        webcredentials: {
            apps: [`${teamId}.${bundleId}`],
        },
    });

    return new Response(body, {
        status: 200,
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=3600',
        },
    });
}
