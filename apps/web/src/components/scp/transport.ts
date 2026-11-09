'use client';

import { openGatewaySocket, type ConnectionGrant } from '@/lib/gateway/connect';
import type { RemoteEntry } from './types';

/**
 * How the file manager reaches a server: through the Termi server's SFTP
 * routes, or (desktop app, the user's own server) through the app's own
 * gateway over the SCP protocol.
 */
export interface FileTransport {
    readonly kind: 'server' | 'device';
    list(path: string): Promise<RemoteEntry[]>;
    download(entry: RemoteEntry): Promise<void>;
    mkdir(path: string): Promise<void>;
    rename(oldPath: string, newPath: string): Promise<void>;
    remove(entry: RemoteEntry): Promise<void>;
    upload(file: File, dir: string, onProgress: (percent: number) => void): Promise<void>;
    close(): void;
}

const joinPath = (dir: string, name: string) => dir.replace(/\/+$/, '') + '/' + name;

function clickDownload(href: string, name: string) {
    const a = document.createElement('a');
    a.href = href;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

async function postJson(url: string, body: unknown, failure: string) {
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    if (!data?.success) throw new Error(data?.error ?? failure);
}

export function serverTransport(serverId: string): FileTransport {
    const base = `/api/servers/${serverId}/sftp`;
    return {
        kind: 'server',
        async list(path) {
            const res = await fetch(`${base}/list?path=${encodeURIComponent(path)}`);
            const data = await res.json().catch(() => null);
            if (!data?.success) throw new Error(data?.error ?? 'Cannot read directory');
            return data.data.entries;
        },
        async download(entry) {
            clickDownload(`${base}/download?path=${encodeURIComponent(entry.path)}`, entry.name);
        },
        mkdir: (path) => postJson(`${base}/mkdir`, { path }, 'Could not create the folder'),
        rename: (oldPath, newPath) =>
            postJson(`${base}/rename`, { oldPath, newPath }, 'Could not rename'),
        remove: (e) =>
            postJson(
                `${base}/delete`,
                { path: e.path, isDirectory: e.type === 'dir' },
                'Could not delete',
            ),
        upload(file, dir, onProgress) {
            return new Promise((resolve, reject) => {
                // XMLHttpRequest, because fetch has no upload progress.
                const xhr = new XMLHttpRequest();
                const fd = new FormData();
                fd.append('file', file);
                fd.append('path', dir);
                xhr.upload.onprogress = (ev) => {
                    if (ev.lengthComputable) onProgress(Math.round((ev.loaded / ev.total) * 100));
                };
                xhr.onload = () =>
                    xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error('Failed'));
                xhr.onerror = () => reject(new Error('Network error'));
                xhr.open('POST', `${base}/upload`);
                xhr.send(fd);
            });
        },
        close() {},
    };
}

/** Raw bytes per upload frame; base64 keeps it under the gateway's 1 MiB frame limit. */
const UPLOAD_CHUNK = 512 * 1024;
/** The gateway assembles an upload in memory and refuses more than this per connection. */
export const DEVICE_UPLOAD_LIMIT = 512 * 1024 * 1024;

interface GatewayMessage {
    type: string;
    path?: string;
    files?: { name: string; type: string; size: number; modified: string; permissions: string }[];
    data?: string;
    message?: string;
}

/**
 * The gateway's SCP protocol has no request ids, so operations run one at a
 * time: each waits for its own completion message (or an error).
 */
class DeviceTransport implements FileTransport {
    readonly kind = 'device' as const;
    private ws: WebSocket;
    private chain: Promise<unknown> = Promise.resolve();
    private waiter: ((m: GatewayMessage) => boolean) | null = null;
    private failWaiter: ((e: Error) => void) | null = null;
    private closed = false;
    readonly ready: Promise<void>;

    constructor(grant: ConnectionGrant, serverId: string) {
        this.ws = openGatewaySocket(
            `${grant.gatewayUrl}/connect?protocol=scp&serverId=${encodeURIComponent(serverId)}`,
        );
        this.ws.binaryType = 'arraybuffer';
        // The token goes in the first message, never in the URL.
        this.ws.onopen = () => this.ws.send(JSON.stringify({ type: 'auth', token: grant.token }));
        this.ready = new Promise((resolve, reject) => {
            let ready = false;
            this.ws.onmessage = (ev) => {
                let m: GatewayMessage;
                try {
                    m = JSON.parse(typeof ev.data === 'string' ? ev.data : '');
                } catch {
                    return;
                }
                if (!ready) {
                    if (m.type === 'sftp-ready') {
                        ready = true;
                        resolve();
                    } else if (m.type === 'error') {
                        reject(new Error(m.message ?? 'Could not connect'));
                    }
                    return;
                }
                if (m.type === 'error') {
                    const fail = this.failWaiter;
                    this.waiter = this.failWaiter = null;
                    fail?.(new Error(m.message ?? 'The operation failed'));
                } else if (this.waiter?.(m)) {
                    this.waiter = this.failWaiter = null;
                }
            };
            this.ws.onclose = () => {
                this.closed = true;
                if (!ready) reject(new Error('Could not connect from this computer'));
                const fail = this.failWaiter;
                this.waiter = this.failWaiter = null;
                fail?.(new Error('The connection closed'));
            };
        });
    }

    /** Send `request`, then resolve once `done` accepts a message. */
    private run<T>(
        request: object | (() => void),
        done: (m: GatewayMessage, resolve: (v: T) => void) => boolean,
    ): Promise<T> {
        const op = this.chain.then(
            () =>
                new Promise<T>((resolve, reject) => {
                    if (this.closed) return reject(new Error('The connection closed'));
                    this.waiter = (m) => done(m, resolve);
                    this.failWaiter = reject;
                    if (typeof request === 'function') request();
                    else this.ws.send(JSON.stringify(request));
                }),
        );
        this.chain = op.catch(() => {});
        return op;
    }

    async list(path: string): Promise<RemoteEntry[]> {
        const m = await this.run<GatewayMessage>({ type: 'list', path }, (m, resolve) => {
            if (m.type !== 'list' || m.path !== path) return false;
            resolve(m);
            return true;
        });
        return (m.files ?? [])
            .filter((f) => f.name !== '.' && f.name !== '..')
            .map((f) => ({
                name: f.name,
                path: joinPath(path, f.name),
                type: f.type === 'directory' ? 'dir' : 'file',
                size: f.size,
                modifiedAt: Date.parse(f.modified) || 0,
                permissions: f.permissions,
                mode: 0,
            }));
    }

    async download(entry: RemoteEntry): Promise<void> {
        const parts: Uint8Array<ArrayBuffer>[] = [];
        await this.run<void>({ type: 'download', path: entry.path }, (m, resolve) => {
            if (m.path !== entry.path) return false;
            if (m.type === 'download-chunk' && m.data) {
                const bin = atob(m.data);
                const bytes = new Uint8Array(bin.length);
                for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
                parts.push(bytes);
                return false;
            }
            if (m.type !== 'download-complete') return false;
            resolve();
            return true;
        });
        const url = URL.createObjectURL(new Blob(parts));
        clickDownload(url, entry.name);
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }

    async mkdir(path: string): Promise<void> {
        await this.run<void>({ type: 'mkdir', path }, (m, resolve) => {
            if (m.type !== 'mkdir-complete' || m.path !== path) return false;
            resolve();
            return true;
        });
    }

    async rename(oldPath: string, newPath: string): Promise<void> {
        await this.run<void>({ type: 'rename', path: oldPath, newPath }, (m, resolve) => {
            if (m.type !== 'rename-complete') return false;
            resolve();
            return true;
        });
    }

    async remove(entry: RemoteEntry): Promise<void> {
        await this.run<void>({ type: 'delete', path: entry.path }, (m, resolve) => {
            if (m.type !== 'delete-complete' || m.path !== entry.path) return false;
            resolve();
            return true;
        });
    }

    async upload(file: File, dir: string, onProgress: (p: number) => void): Promise<void> {
        if (file.size > DEVICE_UPLOAD_LIMIT) {
            throw new Error('Files over 512 MB must go through the Termi server');
        }
        const path = joinPath(dir, file.name);
        const total = Math.max(1, Math.ceil(file.size / UPLOAD_CHUNK));
        const chunkOf = async (i: number) => {
            const buf = new Uint8Array(
                await file.slice(i * UPLOAD_CHUNK, (i + 1) * UPLOAD_CHUNK).arrayBuffer(),
            );
            let bin = '';
            for (let j = 0; j < buf.length; j += 0x8000) {
                bin += String.fromCharCode(...buf.subarray(j, j + 0x8000));
            }
            return btoa(bin);
        };
        // One chunk per round trip, so a slow link never queues the whole file in memory.
        for (let i = 0; i < total; i++) {
            const data = await chunkOf(i);
            await this.run<void>(
                { type: 'upload', path, data, chunk: i, totalChunks: total },
                (m, resolve) => {
                    if (m.path !== path) return false;
                    if (m.type !== 'upload-progress' && m.type !== 'upload-complete') return false;
                    resolve();
                    return true;
                },
            );
            onProgress(Math.round(((i + 1) / total) * 100));
        }
    }

    close() {
        this.closed = true;
        this.ws.close();
    }
}

/** Open the file transfer connection a device grant is for; resolves once SFTP is ready. */
export async function deviceTransport(
    grant: ConnectionGrant,
    serverId: string,
): Promise<FileTransport> {
    const t = new DeviceTransport(grant, serverId);
    try {
        await t.ready;
    } catch (err) {
        t.close();
        throw err;
    }
    return t;
}
