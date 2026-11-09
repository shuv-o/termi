'use client';

/**
 * Getting a connection token, and opening the socket it is for.
 *
 * In the desktop app, SSH, file transfer and tunnels to the user's own
 * servers can run from their computer through the app's own gateway. The
 * server decides per request (owner, the server's "Connect from" setting, a
 * registered device); the browser only asks. A device connection never
 * touches the network from the page: the app relays it over IPC.
 */

export const DEVICE_SCHEME = 'termi-device://';

export const isDeviceUrl = (url: string | null | undefined): boolean =>
    !!url && url.startsWith(DEVICE_SCHEME);

/** True inside a desktop app that can connect from this computer. */
export function deviceGatewayAvailable(): boolean {
    return typeof window !== 'undefined' && !!window.electronAPI?.localGateway;
}

export interface ConnectionGrant {
    token: string;
    gatewayUrl: string | null;
    via: 'gateway' | 'device';
    /** A device connection may fall back to the gateway if it can't reach the server. */
    fallback: boolean;
}

/**
 * POST /api/connection/token. `route: 'auto'` asks for a device token when
 * the app can connect locally (the server may still answer with a gateway
 * one); `'gateway'` always goes through the Termi server.
 */
export async function requestConnection(
    body: Record<string, unknown>,
    route: 'auto' | 'gateway' = 'auto',
): Promise<ConnectionGrant> {
    const via = route === 'auto' && deviceGatewayAvailable() ? 'device' : 'gateway';
    const res = await fetch('/api/connection/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, via }),
    });
    const data = await res.json().catch(() => null);
    if (!data?.success) throw new Error(data?.error ?? 'Could not get a connection token');
    return {
        token: data.data.token,
        gatewayUrl: data.data.gatewayUrl ?? null,
        via: data.data.via === 'device' ? 'device' : 'gateway',
        fallback: !!data.data.fallback,
    };
}

/** A WebSocket, or the desktop app's IPC-backed equivalent for device URLs. */
export function openGatewaySocket(url: string): WebSocket {
    if (!isDeviceUrl(url)) return new WebSocket(url);
    return new DeviceSocket(url) as unknown as WebSocket;
}

type Handler<E> = ((ev: E) => void) | null;

/**
 * The subset of WebSocket the terminal and file manager use, carried over
 * the desktop app's IPC to its own gateway.
 */
class DeviceSocket extends EventTarget {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSING = 2;
    static readonly CLOSED = 3;
    readonly CONNECTING = 0;
    readonly OPEN = 1;
    readonly CLOSING = 2;
    readonly CLOSED = 3;

    readyState = 0;
    binaryType: BinaryType = 'arraybuffer';
    bufferedAmount = 0;
    readonly url: string;
    onopen: Handler<Event> = null;
    onmessage: Handler<MessageEvent> = null;
    onclose: Handler<CloseEvent> = null;
    onerror: Handler<Event> = null;

    private id: string | null = null;
    private unsubscribe: (() => void) | null = null;
    private queue: (string | ArrayBuffer)[] = [];

    constructor(url: string) {
        super();
        this.url = url;
        const api = window.electronAPI?.localGateway;
        const q = url.indexOf('?');
        const query = q >= 0 ? url.slice(q + 1) : '';
        if (!api) {
            queueMicrotask(() => this.finish(1006, 'This app cannot connect from this computer'));
            return;
        }
        // Our own id, set before opening, so no event can arrive before we know it.
        const id = crypto.randomUUID();
        this.id = id;
        this.unsubscribe = api.onEvent((e) => {
            if (e.id !== id) return;
            if (e.type === 'open') {
                this.readyState = 1;
                this.emit('open', new Event('open'));
                for (const m of this.queue.splice(0)) api.send(e.id, m);
            } else if (e.type === 'message') {
                this.emit('message', new MessageEvent('message', { data: e.data }));
            } else if (e.type === 'error') {
                this.emit('error', new Event('error'));
            } else if (e.type === 'close') {
                this.finish(e.code, e.reason);
            }
        });
        void api.open(id, query).then((r) => {
            if ('error' in r) {
                this.emit('error', new Event('error'));
                this.finish(1006, r.error);
            }
        });
    }

    send(data: string | ArrayBuffer | ArrayBufferView | Blob): void {
        if (this.readyState > 1) return;
        const payload =
            typeof data === 'string'
                ? data
                : data instanceof ArrayBuffer
                  ? data
                  : ArrayBuffer.isView(data)
                    ? (data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer)
                    : null;
        if (payload === null) return; // Blobs aren't used by Termi's clients
        if (this.readyState === 1 && this.id) window.electronAPI?.localGateway?.send(this.id, payload);
        else this.queue.push(payload);
    }

    close(code?: number, reason?: string): void {
        if (this.readyState > 1) return;
        this.readyState = 2;
        if (this.id) window.electronAPI?.localGateway?.close(this.id, code, reason);
        else this.finish(code ?? 1000, reason ?? '');
    }

    private emit(type: 'open' | 'message' | 'error' | 'close', ev: Event) {
        const handler = this[`on${type}` as 'onopen'] as Handler<Event>;
        handler?.call(this as unknown as WebSocket, ev);
        this.dispatchEvent(ev);
    }

    private finish(code: number, reason: string) {
        if (this.readyState === 3) return;
        this.readyState = 3;
        this.unsubscribe?.();
        this.emit('close', new CloseEvent('close', { code, reason, wasClean: code === 1000 }));
    }
}
