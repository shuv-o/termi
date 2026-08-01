'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AddToast } from '../types';

/** VAPID keys travel as base64url; `pushManager.subscribe` wants raw bytes. */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

/** Per-device Web Push subscription for server up/down alerts. */
export function usePushNotifications(addToast: AddToast) {
    const [permission, setPermission] = useState<NotificationPermission>('default');
    const [subscribed, setSubscribed] = useState(false);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        if ('Notification' in window) setPermission(Notification.permission);
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.ready
                .then((reg) =>
                    reg.pushManager.getSubscription().then((sub) => setSubscribed(!!sub)),
                )
                .catch(() => {});
        }
    }, []);

    const enable = useCallback(async () => {
        setBusy(true);
        try {
            if (!('Notification' in window) || !('serviceWorker' in navigator)) {
                addToast('error', 'Push notifications are not supported by your browser');
                return;
            }
            const granted = await Notification.requestPermission();
            setPermission(granted);
            if (granted !== 'granted') {
                addToast('warning', 'Notification permission denied');
                return;
            }

            const keyRes = await fetch('/api/push/vapid-public-key');
            const keyData = await keyRes.json();
            if (!keyData.success) {
                addToast('error', 'Push notifications not configured on this server');
                return;
            }

            const applicationServerKey = urlBase64ToUint8Array(keyData.data.publicKey)
                .buffer as ArrayBuffer;
            const reg = await navigator.serviceWorker.ready;
            const subscription = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey,
            });
            const subJson = subscription.toJSON() as {
                endpoint: string;
                keys: { p256dh: string; auth: string };
            };

            const res = await fetch('/api/push/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    endpoint: subJson.endpoint,
                    keys: subJson.keys,
                    deviceLabel: navigator.userAgent.slice(0, 100),
                }),
            });
            const data = await res.json();
            if (data.success) {
                setSubscribed(true);
                addToast('success', 'Push notifications enabled for this device');
            } else {
                addToast('error', data.error || 'Failed to save subscription');
            }
        } catch (err) {
            addToast(
                'error',
                `Failed to enable push: ${err instanceof Error ? err.message : 'Unknown error'}`,
            );
        } finally {
            setBusy(false);
        }
    }, [addToast]);

    const disable = useCallback(async () => {
        setBusy(true);
        try {
            const reg = await navigator.serviceWorker.ready;
            const sub = await reg.pushManager.getSubscription();
            if (sub) {
                await fetch('/api/push/subscribe', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ endpoint: sub.endpoint }),
                });
                await sub.unsubscribe();
            }
            setSubscribed(false);
            addToast('success', 'Push notifications disabled for this device');
        } catch {
            addToast('error', 'Failed to disable push notifications');
        } finally {
            setBusy(false);
        }
    }, [addToast]);

    return { permission, subscribed, busy, enable, disable };
}
