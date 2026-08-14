/**
 * Webhook Alert Service
 *
 * Posts server up/down alerts to a user-configured Slack, Discord, or
 * generic webhook URL. Best-effort: failures are logged, never thrown, so a
 * broken webhook can never block email/push alerts or the monitor loop.
 */

import { validateHost } from '@/lib/security/ssrf';

export type WebhookPlatform = 'SLACK' | 'DISCORD' | 'GENERIC';

export interface WebhookAlertPayload {
    status: 'down' | 'up';
    serverId: string;
    serverName: string;
    serverAddr: string;
    detail: string;
}

const SEND_TIMEOUT_MS = 10000;

function buildBody(platform: WebhookPlatform, payload: WebhookAlertPayload): object {
    const emoji = payload.status === 'down' ? '🔴' : '🟢';
    const title = payload.status === 'down' ? 'Server Down' : 'Server Recovered';
    const text = `${emoji} *${title}: ${payload.serverName}* (${payload.serverAddr}) — ${payload.detail}`;

    switch (platform) {
        case 'SLACK':
            return { text };
        case 'DISCORD':
            return { content: text };
        case 'GENERIC':
        default:
            return {
                status: payload.status,
                serverId: payload.serverId,
                serverName: payload.serverName,
                serverAddr: payload.serverAddr,
                detail: payload.detail,
                timestamp: new Date().toISOString(),
            };
    }
}

/**
 * Sends one alert to a webhook URL. The URL is re-validated against the SSRF
 * blocklist here (not just at config-save time) since DNS can change between
 * when a user saves a webhook and when it actually fires.
 */
export async function sendWebhookAlert(
    webhookUrl: string,
    platform: WebhookPlatform,
    payload: WebhookAlertPayload,
): Promise<void> {
    let url: URL;
    try {
        url = new URL(webhookUrl);
    } catch {
        console.error('[Webhook] Invalid URL, skipping send');
        return;
    }

    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
        console.error('[Webhook] Unsupported protocol, skipping send:', url.protocol);
        return;
    }

    const hostCheck = await validateHost(url.hostname);
    if (!hostCheck.valid) {
        console.error('[Webhook] Blocked outbound host:', hostCheck.error);
        return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(buildBody(platform, payload)),
            signal: controller.signal,
        });
        if (!res.ok) {
            console.error(`[Webhook] Non-OK response from ${url.hostname}: ${res.status}`);
        }
    } catch (err) {
        console.error('[Webhook] Failed to send:', err instanceof Error ? err.message : err);
    } finally {
        clearTimeout(timer);
    }
}
