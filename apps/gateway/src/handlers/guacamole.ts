/**
 * Guacamole Protocol Handler for RDP and VNC connections
 *
 * Directly communicates with the guacd 1.5.x daemon (FreeRDP 2.x backend)
 * using the Guacamole protocol over TCP sockets.
 */

import { WebSocket } from 'ws';
import { Socket } from 'net';
import type { TokenPayload } from '../auth/token.js';

// Guacd connection settings
const GUACD_HOST = process.env.GUACD_HOST || 'localhost';
const GUACD_PORT = parseInt(process.env.GUACD_PORT || '4822', 10);

/**
 * Encode a Guacamole protocol instruction.
 * The Guacamole protocol requires UTF-8 byte counts as the length prefix,
 * NOT JavaScript's UTF-16 code-unit count. Using p.length would corrupt any
 * field that follows a value containing multi-byte UTF-8 characters
 * (e.g. non-ASCII usernames or passwords), misaligning all subsequent args.
 */
function encodeInstruction(opcode: string, ...args: string[]): Buffer {
    const parts = [opcode, ...args];
    const encoded = parts
        .map(p => `${Buffer.byteLength(p, 'utf8')}.${p}`)
        .join(',') + ';';
    return Buffer.from(encoded, 'utf8');
}

/**
 * Parse a Guacamole protocol instruction
 */
function parseInstruction(data: string): { opcode: string; args: string[] } | null {
    const match = data.match(/^(\d+)\.([^,;]*)/);
    if (!match) return null;

    const parts: string[] = [];
    let remaining = data;

    while (remaining.length > 0 && !remaining.startsWith(';')) {
        const lengthMatch = remaining.match(/^(\d+)\.([^,;]*)/);
        if (!lengthMatch) break;

        const length = parseInt(lengthMatch[1], 10);
        const value = remaining.substring(lengthMatch[1].length + 1, lengthMatch[1].length + 1 + length);
        parts.push(value);

        remaining = remaining.substring(lengthMatch[1].length + 1 + length);
        if (remaining.startsWith(',')) {
            remaining = remaining.substring(1);
        }
    }

    if (parts.length === 0) return null;

    return {
        opcode: parts[0],
        args: parts.slice(1),
    };
}

export class GuacamoleHandler {
    private ws: WebSocket;
    private guacdSocket: Socket;
    private buffer: string = '';
    private closing = false;
    // Callbacks used during the guacd protocol handshake phase
    private handshakeResolve: ((args: string[]) => void) | null = null;
    private handshakeReject: ((err: Error) => void) | null = null;

    constructor(ws: WebSocket, payload: TokenPayload, protocol: 'rdp' | 'vnc') {
        this.ws = ws;
        this.guacdSocket = new Socket();

        this.setupSocket();
        this.setupWebSocket();
        this.connect(payload, protocol).catch(err => {
            console.error('[Guacamole] Connection init error:', err);
            this.sendError('Failed to initialize connection');
        });
    }

    private setupSocket() {
        this.guacdSocket.on('error', (err) => {
            console.error('[Guacamole] Socket error:', err.message);
            console.error('[Guacamole] Error details:', err);
            if (this.handshakeReject) {
                const reject = this.handshakeReject;
                this.handshakeResolve = null;
                this.handshakeReject = null;
                reject(err);
                return;
            }
            this.sendError(`Guacamole error: ${err.message}`);
            if (this.ws.readyState === WebSocket.OPEN) {
                this.ws.close();
            }
        });

        this.guacdSocket.on('close', () => {
            console.log('[Guacamole] guacd socket closed');
            if (this.buffer.length > 0) {
                console.warn('[Guacamole] Unprocessed buffer on close (possible truncated error):', this.buffer.substring(0, 200));
            }
            if (this.closing) return; // Already handling shutdown
            this.closing = true;
            if (this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({ type: 'closed' }));
                this.ws.close();
            }
        });

        this.guacdSocket.on('data', (data) => {
            this.buffer += data.toString();

            // Process all complete instructions in the buffer
            while (this.buffer.includes(';')) {
                const endIndex = this.buffer.indexOf(';');
                const instruction = this.buffer.substring(0, endIndex + 1);
                this.buffer = this.buffer.substring(endIndex + 1);

                const parsed = parseInstruction(instruction);
                if (parsed) {
                    // Log non-drawing instructions (excludes high-frequency drawing opcodes)
                    if (!['png', 'jpeg', 'webp', 'blob', 'video', 'audio', 'mouse', 'nop', 'sync', 'size', 'cursor', 'move', 'shade', 'dispose', 'cfill', 'cstroke', 'lstroke', 'line', 'arc', 'pop', 'push', 'identity', 'transform', 'rect', 'clip', 'end'].includes(parsed.opcode)) {
                        console.log('[Guacamole] ←', parsed.opcode, parsed.args.length > 0 ? `(${parsed.args.length} args)` : '');
                    }
                    if (parsed.opcode === 'error') {
                        console.error('[Guacamole] guacd ERROR:', parsed.args);
                    }
                }

                // During the handshake phase, intercept args/error internally
                // so they are not forwarded to the browser
                if (parsed?.opcode === 'args' && this.handshakeResolve) {
                    const resolve = this.handshakeResolve;
                    this.handshakeResolve = null;
                    this.handshakeReject = null;
                    resolve(parsed.args);
                    continue; // Do NOT forward the internal handshake args to the browser
                }

                if (parsed?.opcode === 'error' && this.handshakeReject) {
                    const reject = this.handshakeReject;
                    this.handshakeResolve = null;
                    this.handshakeReject = null;
                    reject(new Error(`guacd error: ${parsed.args.join(' ')}`));
                    continue;
                }

                // Forward all other instructions to the browser WebSocket
                if (this.ws.readyState === WebSocket.OPEN) {
                    this.ws.send(instruction);
                }
            }
        });
    }

    private setupWebSocket() {
        this.ws.on('message', (message) => {
            try {
                const data = message.toString();

                // Check if it's a Guacamole instruction (contains period-length prefix)
                if (data.match(/^\d+\./)) {
                    this.guacdSocket.write(data);
                } else {
                    // Try to parse as JSON
                    const parsed = JSON.parse(data);

                    if (parsed.type === 'ping') {
                        this.ws.send(JSON.stringify({ type: 'pong' }));
                    } else if (parsed.type === 'disconnect') {
                        this.guacdSocket.write(encodeInstruction('disconnect'));
                        this.guacdSocket.end();
                    }
                }
            } catch {
                // If not JSON, forward as raw Guacamole instruction
                this.guacdSocket.write(message.toString());
            }
        });

        this.ws.on('close', () => {
            console.log('[Guacamole] WebSocket closed');
            this.guacdSocket.end();
        });
    }

    private async connect(payload: TokenPayload, protocol: 'rdp' | 'vnc') {
        console.log(`[Guacamole] Starting ${protocol} connection to ${payload.host}:${payload.port}`);
        console.log(`[Guacamole] Connecting to guacd at ${GUACD_HOST}:${GUACD_PORT}`);

        try {
            await new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Connection to guacd timed out'));
                }, 10000);

                this.guacdSocket.connect(GUACD_PORT, GUACD_HOST, () => {
                    clearTimeout(timeout);
                    console.log('[Guacamole] Connected to guacd');
                    resolve();
                });

                this.guacdSocket.on('error', (err) => {
                    clearTimeout(timeout);
                    reject(err);
                });
            });
        } catch (err: any) {
            const errorMsg = `Failed to connect to guacd daemon at ${GUACD_HOST}:${GUACD_PORT}: ${err.message}`;
            console.error('[Guacamole]', errorMsg);
            this.sendError(errorMsg);
            this.ws.close();
            return;
        }

        // Send select instruction
        const guacProtocol = protocol === 'rdp' ? 'rdp' : 'vnc';
        console.log(`[Guacamole] Sending select instruction: ${guacProtocol}`);
        this.guacdSocket.write(encodeInstruction('select', guacProtocol));

        // Wait for the args instruction using the single buffered data handler
        // (avoids the dual-listener race condition)
        let expectedArgs: string[];
        try {
            expectedArgs = await new Promise<string[]>((resolve, reject) => {
                const timeout = setTimeout(() => {
                    this.handshakeResolve = null;
                    this.handshakeReject = null;
                    reject(new Error('Timeout waiting for args instruction from guacd'));
                }, 5000);

                this.handshakeResolve = (args) => {
                    clearTimeout(timeout);
                    resolve(args);
                };
                this.handshakeReject = (err) => {
                    clearTimeout(timeout);
                    reject(err);
                };
            });
        } catch (err: any) {
            const errorMsg = `Failed to get args from guacd: ${err.message}`;
            console.error('[Guacamole]', errorMsg);
            this.sendError(errorMsg);
            this.ws.close();
            return;
        }

        // Build connection args based on what guacd expects
        const connectionArgs: string[] = [];

        // Map of available parameter values
        const paramMap: Record<string, string> = {
            // Basic connection
            'hostname': payload.host,
            'port': String(payload.port || (protocol === 'rdp' ? 3389 : 5900)),
            'username': payload.username || '',
            'password': payload.password || '',
            'domain': '',
            'timeout': '',

            // Display settings
            'width': String(payload.displayWidth || 1024),
            'height': String(payload.displayHeight || 768),
            'dpi': '96',
            // 32-bit colour → FreeRDP negotiates PIXEL_FORMAT_BGRA32.
            // This avoids the BGR24 "Cache Bitmap V2 + MemBlt" crash that was
            // seen with 24-bit depth, while the patched guacd image fixes the
            // remaining POINTER_LARGE_PDU heap-overflow (GUACAMOLE-1971).
            'color-depth': '32',

            // Audio
            'disable-audio': 'true',
            'enable-audio-input': 'false',
            'console-audio': '',

            // Printing and file sharing
            'enable-printing': 'false',
            'printer-name': '',
            'enable-drive': 'false',
            'drive-name': '',
            'drive-path': '',
            'create-drive-path': 'false',
            'disable-download': '',
            'disable-upload': '',

            // RDP-specific settings
            // Let the server negotiate the best security mode (NLA → TLS → RDP).
            // All modes were failing before due to the SIGFPE crash in guacd
            // (division by zero when no 'size' handshake was sent). Now that
            // the 'size' instruction is sent, 'any' allows the server to pick
            // the most secure mode it supports.
            'security': 'any',
            // ignore-cert: FreeRDP 2.x (guacd 1.5.x) cert bypass — skips all
            // certificate validation so self-signed RDP certs are accepted.
            'ignore-cert': 'true',
            // cert-tofu: Trust-on-First-Use, also supported in guacd 1.5.x.
            // Sent only if guacd lists it in its args; harmless otherwise.
            'cert-tofu': 'true',
            'cert-fingerprints': '',
            'disable-auth': '',
            'server-layout': '',
            'timezone': '',
            'console': '',
            'initial-program': '',
            'client-name': '',
            'preconnection-id': '',
            'preconnection-blob': '',
            'load-balance-info': '',

            // RemoteApp
            'remote-app': '',
            'remote-app-dir': '',
            'remote-app-args': '',

            // Performance optimization
            'enable-wallpaper': 'false',
            'enable-theming': 'false',
            'enable-font-smoothing': 'false',
            'enable-full-window-drag': 'false',
            'enable-desktop-composition': 'false',
            'enable-menu-animations': 'false',
            // Disable all three client-side caches for FreeRDP 2.x stability.
            // FreeRDP 2.11.5 can segfault on Cache Bitmap V2 (Compressed) + MemBlt
            // drawing orders; disabling caches forces a stateless rendering path.
            'disable-bitmap-caching': 'true',
            'disable-offscreen-caching': 'true',
            'disable-glyph-caching': 'true',
            // Disable the GFX (Graphics Pipeline Extension) virtual channel.
            // FreeRDP 2.x may silently fail when negotiating GFX with servers that
            // do not fully support it; the classic drawing-order path is more stable.
            'disable-gfx': 'true',

            // SFTP settings
            'enable-sftp': '',
            'sftp-hostname': '',
            'sftp-host-key': '',
            'sftp-port': '',
            'sftp-timeout': '',
            'sftp-username': '',
            'sftp-password': '',
            'sftp-private-key': '',
            'sftp-passphrase': '',
            'sftp-public-key': '',
            'sftp-directory': '',
            'sftp-root-directory': '',
            'sftp-server-alive-interval': '',
            'sftp-disable-download': '',
            'sftp-disable-upload': '',

            // Recording
            'recording-path': '',
            'recording-name': '',
            'recording-exclude-output': '',
            'recording-exclude-mouse': '',
            'recording-exclude-touch': '',
            'recording-include-keys': '',
            'create-recording-path': '',
            'recording-write-existing': '',

            // Other settings
            'static-channels': '',
            // Disable dynamic display resize. Using 'display-update' loads the
            // DisplayControl DVC (disp channel) which can conflict with cursor
            // shape PDU processing in FreeRDP 2.11.5. Using '' disables resize
            // support entirely and keeps the display fixed at initial dimensions.
            'resize-method': '',
            'enable-touch': '',
            'read-only': '',
            'disable-copy': '',
            'disable-paste': '',

            // Gateway settings
            'gateway-hostname': '',
            'gateway-port': '',
            'gateway-domain': '',
            'gateway-username': '',
            'gateway-password': '',

            // Wake-on-LAN
            'wol-send-packet': '',
            'wol-mac-addr': '',
            'wol-broadcast-addr': '',
            'wol-udp-port': '',
            'wol-wait-time': '',

            // Quality
            'force-lossless': '',
            'normalize-clipboard': '',
        };

        // Build the connect args in the order guacd expects.
        // VERSION_x_x_x args (e.g. VERSION_1_5_0, VERSION_1_6_0) are echoed
        // back verbatim so guacd picks the correct protocol version regardless
        // of which guacd release is running.
        for (const arg of expectedArgs) {
            if (/^VERSION_/.test(arg)) {
                connectionArgs.push(arg); // Echo the version identifier back
            } else {
                connectionArgs.push(paramMap[arg] ?? '');
            }
        }

        console.log('[Guacamole] Sending', connectionArgs.length, 'args to guacd');
        console.log('[Guacamole] Connection params:', {
            hostname: paramMap['hostname'],
            port: paramMap['port'],
            username: paramMap['username'] ? '***' : '(empty)',
            password: paramMap['password'] ? '***' : '(empty)',
            width: paramMap['width'],
            height: paramMap['height'],
            'color-depth': paramMap['color-depth'],
            'ignore-cert': paramMap['ignore-cert'],
            security: paramMap['security']
        });

        // Send the Guacamole handshake 'size' instruction BEFORE 'connect'.
        // guacd's settings.c computes:
        //   width = user->info.optimal_width * resolution / user->info.optimal_resolution
        // before reading argv[IDX_WIDTH]. If optimal_resolution is 0 (the default
        // when no 'size' is sent), this triggers an integer division-by-zero (SIGFPE)
        // which silently crashes the guacd child process. The 'size' instruction
        // is part of the standard Guacamole handshake protocol and populates
        // user->info so that the override in argv[IDX_WIDTH/HEIGHT] is actually reached.
        const width = payload.displayWidth || 1024;
        const height = payload.displayHeight || 768;
        const dpi = 96;
        this.guacdSocket.write(encodeInstruction('size', String(width), String(height), String(dpi)));

        // Send capability handshake instructions as the standard Guacamole.Client
        // does (audio/video/image/timezone).  Without these, guacd leaves its
        // internal capability arrays (audio_mimetypes, image_mimetypes, etc.) as
        // NULL, which can trigger null-dereference crashes in certain PDU-handling
        // paths within FreeRDP's channel callbacks.
        this.guacdSocket.write(encodeInstruction('audio'));           // no audio support — disables server audio
        this.guacdSocket.write(encodeInstruction('video'));           // no video support
        this.guacdSocket.write(encodeInstruction('image', 'image/png', 'image/jpeg', 'image/webp'));
        this.guacdSocket.write(encodeInstruction('timezone', 'UTC'));

        // Build and send the connect instruction.
        // encodeInstruction uses Buffer.byteLength for length prefixes so that
        // multi-byte characters in username/password do not misalign subsequent args.
        const connectBuf = encodeInstruction('connect', ...connectionArgs);
        this.guacdSocket.write(connectBuf);

        this.ws.send(JSON.stringify({ type: 'connected' }));
    }

    private sendError(message: string): void {
        if (this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'error',
                message,
            }));
        }
    }

    public close(): void {
        if (this.closing) {
            return;
        }
        this.closing = true;

        this.guacdSocket.end();
    }
}
