'use client';
/**
 * GuacamoleDisplay - uses guacamole-common-js 1.6 officially.
 * GatewayTunnel bridges our custom gateway WS protocol to Guacamole.Tunnel.
 */
import { useEffect, useRef, useState } from 'react';
import { createGatewayTunnel } from './GatewayTunnel';
interface GuacamoleDisplayProps {
    serverId: string;
    connectionToken: string;
    protocol: 'rdp' | 'vnc';
    gatewayUrl?: string;
    onDisconnect?: () => void;
    onError?: (error: string) => void;
    /** Override the RDP/VNC session resolution. When omitted, the container size is used. */
    preferredWidth?: number;
    preferredHeight?: number;
    /**
     * Visual zoom scale applied to the Guacamole display without reconnecting.
     * undefined = auto-fit to container (default).
     * 1.0 = 100% (1 remote pixel : 1 screen pixel).
     * Values > auto-fit scale will clip at the container edges.
     */
    scale?: number;
}
/** Human-readable messages for Guacamole protocol status codes (sent by guacd) */
const GUAC_STATUS_MESSAGES: Record<number, string> = {
    512: 'Internal server error in guacd',
    513: 'guacd server is too busy',
    514: 'Connection timed out — verify the RDP/VNC server is running, port is correct, and reachable from the gateway',
    515: 'Upstream connection error — the remote server refused or dropped the connection',
    516: 'Session resource not found',
    517: 'Session resource conflict',
    518: 'Session closed by the remote server',
    519: 'Remote server not found — check the host address and port',
    520: 'Remote desktop service unavailable',
    521: 'Session conflict',
    522: 'Session timed out',
    523: 'Session closed',
    768: 'Bad connection request',
    769: 'Authentication required',
    771: 'Access forbidden',
    776: 'Connection attempt timed out (client-side)',
    781: 'Too many connections',
};

/** Guacamole.Client.State numeric values to human labels */
const CLIENT_STATE_LABELS: Record<number, string> = {
    0: 'idle',
    1: 'connecting',
    2: 'waiting',
    3: 'connected',
    4: 'disconnecting',
    5: 'disconnected',
};
export default function GuacamoleDisplay({
    serverId,
    connectionToken,
    protocol,
    gatewayUrl,
    onDisconnect,
    onError,
    preferredWidth,
    preferredHeight,
    scale,
}: GuacamoleDisplayProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    // 0=IDLE 1=CONNECTING 2=WAITING 3=CONNECTED 4=DISCONNECTING 5=DISCONNECTED
    const [clientState, setClientState] = useState<number>(0);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const onDisconnectRef = useRef(onDisconnect);
    onDisconnectRef.current = onDisconnect;
    const onErrorRef = useRef(onError);

    // Refs that let scale changes re-fit the display without remounting the connection.
    const scaleRef = useRef<number | undefined>(scale);
    const fitFnRef = useRef<(() => void) | null>(null);

    useEffect(() => {
        scaleRef.current = scale;
        fitFnRef.current?.();
    }, [scale]);
    onErrorRef.current = onError;
    useEffect(() => {
        if (!containerRef.current) return;
        const container = containerRef.current;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let guacClient: any = null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let windowKeyboard: any = null;
        let resizeObserver: ResizeObserver | null = null;
        let displayEl: HTMLElement | null = null;
        let pasteHandler: ((e: ClipboardEvent) => void) | null = null;
        // Mac keyboard state — reset on cleanup
        let macMetaDown   = false; // true while Cmd (Meta) is physically held
        let macVSuppressed = false; // true when Cmd+V V-key was suppressed (paste handler sends it)
        let ctrlDown      = false; // true while physical Ctrl is held (all platforms)
        // guacamole-common-js uses browser globals - must be loaded client-side
        import('guacamole-common-js').then((module) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const Guacamole = (module as any).default ?? module;
            // Gateway tunnel
            const gatewayBase =
                gatewayUrl || process.env.NEXT_PUBLIC_GATEWAY_URL || 'ws://localhost:22080/gateway';
            const wsUrl = `${gatewayBase}/connect`;
            // Use explicit preferred dimensions if provided, otherwise fall back to the container size.
            // preferredWidth/Height come from the parent (e.g. user-selected resolution or screen dims).
            const width  = preferredWidth  || container.clientWidth  || 1280;
            const height = preferredHeight || container.clientHeight || 800;
            const connectData =
                `protocol=${protocol}` +
                `&serverId=${encodeURIComponent(serverId)}` +
                `&width=${width}&height=${height}`;
            const tunnel = createGatewayTunnel(Guacamole, wsUrl, connectionToken);
            // Client
            guacClient = new Guacamole.Client(tunnel);
            // Display
            const display = guacClient.getDisplay();
            displayEl = display.getElement() as HTMLElement;
            displayEl.style.position = 'absolute';
            displayEl.style.top = '0';
            displayEl.style.left = '0';
            displayEl.style.overflow = 'hidden';
            displayEl.setAttribute('tabindex', '0');
            displayEl.style.outline = 'none';
            container.style.position = 'relative';
            container.appendChild(displayEl);
            // Scale display to fit container, honouring any manual zoom override.
            const fitDisplay = () => {
                const cw = container.clientWidth;
                const ch = container.clientHeight;
                const dw = display.getWidth();
                const dh = display.getHeight();
                if (dw > 0 && dh > 0 && cw > 0 && ch > 0) {
                    const s = scaleRef.current !== undefined
                        ? scaleRef.current
                        : Math.min(cw / dw, ch / dh);
                    display.scale(s);
                }
            };
            fitFnRef.current = fitDisplay;
            resizeObserver = new ResizeObserver(fitDisplay);
            resizeObserver.observe(container);
            display.onresize = fitDisplay;
            // Client state changes
            guacClient.onstatechange = (state: number) => {
                console.log(`[Guacamole] State -> ${CLIENT_STATE_LABELS[state] ?? state}`);
                setClientState(state);
                if (state === 3 /* CONNECTED */) {
                    fitDisplay();
                    displayEl?.focus();
                }
                if (state === 5 /* DISCONNECTED */) {
                    onDisconnectRef.current?.();
                }
            };
            // Error — Guacamole.Status has .code (number) and .message (string)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            guacClient.onerror = (status: any) => {
                const code: number = status?.code ?? 0;
                // guacd prefixes all messages with "Guacamole error: " — strip it for clarity
                const raw: string = (status?.message ?? '').replace(/^Guacamole error:\s*/i, '').trim();
                const msg = raw || (GUAC_STATUS_MESSAGES[code] ?? `Remote desktop error (code ${code})`);
                console.error('[Guacamole] Client error:', msg, status);
                setErrorMsg(msg);
                onErrorRef.current?.(msg);
            };
            // Clipboard: remote → local
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            guacClient.onclipboard = (stream: any, mimetype: string) => {
                if (mimetype === 'text/plain') {
                    let b64 = '';
                    stream.onblob = (chunk: string) => { b64 += chunk; };
                    stream.onend = () => {
                        try {
                            // atob gives raw bytes; TextDecoder handles multi-byte UTF-8 correctly
                            const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
                            const text = new TextDecoder().decode(bytes);
                            navigator.clipboard?.writeText(text);
                        } catch { /* ignore */ }
                    };
                }
            };
            // Shared guard: skip forwarding when a native text field is focused.
            const isNativeInput = () => {
                const a = document.activeElement as HTMLElement | null;
                if (!a) return false;
                const tag = a.tagName.toLowerCase();
                return tag === 'input' || tag === 'textarea' || tag === 'select' || !!a.isContentEditable;
            };
            // ── Mac Cmd → Ctrl mapping ───────────────────────────────────────────
            // X11 keysyms used by guacamole-common-js on Mac:
            //   Meta_L 0xFFE7  Meta_R 0xFFE8  (Mac Command key)
            //   Control_L 0xFFE3  Control_R 0xFFE4
            const isMac = /Mac/i.test(navigator.platform);
            const META_L = 0xFFE7, META_R = 0xFFE8;
            const CTRL_L = 0xFFE3, CTRL_R = 0xFFE4;
            const V_KEYSYM = 0x76;
            // ────────────────────────────────────────────────────────────────────
            // Clipboard: local → remote
            // Listen on document so paste fires even when the display canvas is not
            // the focused element — mirrors how the keyboard handler works.
            pasteHandler = (e: ClipboardEvent) => {
                if (isNativeInput()) return;
                const text = e.clipboardData?.getData('text/plain');
                if (text) {
                    const stream = guacClient.createClipboardStream('text/plain');
                    const writer = new Guacamole.StringWriter(stream);
                    writer.sendText(text);
                    writer.sendEnd();
                }
                // Send Ctrl+V AFTER clipboard content so the remote always pastes
                // the correct data regardless of timing:
                //   • Mac Cmd+V: V keydown was suppressed in keyboard handler;
                //     Ctrl is held (Meta→Ctrl translation) — just send V.
                //   • Non-Mac right-click paste (Ctrl not held): send full Ctrl+V.
                //   • Non-Mac Ctrl+V via keyboard: keyboard already sent Ctrl+V before
                //     this event, so we skip to avoid double paste.
                if (isMac && macMetaDown) {
                    // Ctrl already held by Meta→Ctrl mapping; append V
                    guacClient.sendKeyEvent(1, V_KEYSYM);
                    guacClient.sendKeyEvent(0, V_KEYSYM);
                } else if (!ctrlDown) {
                    // Right-click paste (no keyboard Ctrl held on any platform)
                    guacClient.sendKeyEvent(1, CTRL_L);
                    guacClient.sendKeyEvent(1, V_KEYSYM);
                    guacClient.sendKeyEvent(0, V_KEYSYM);
                    guacClient.sendKeyEvent(0, CTRL_L);
                }
                // else: physical Ctrl+V — keyboard already sent Ctrl+V first (pre-existing
                //       timing limitation; clipboard content syncs for the next paste).
            };
            document.addEventListener('paste', pasteHandler);
            // Audio from remote desktop
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            guacClient.onaudio = (stream: any, mimetype: string) => {
                Guacamole.AudioPlayer.getInstance(stream, mimetype);
            };
            // Mouse: legacy handler API receives Guacamole.Mouse.State directly
            const mouse = new Guacamole.Mouse(displayEl);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const forwardMouse = (state: any) => guacClient.sendMouseState(state, true);
            mouse.onmousedown = forwardMouse;
            mouse.onmouseup   = forwardMouse;
            mouse.onmousemove = forwardMouse;
            mouse.onmouseout  = forwardMouse;
            // Suppress context menu so right-click is forwarded
            displayEl.addEventListener('contextmenu', (e: Event) => e.preventDefault());
            // Document-level keyboard — works regardless of which element has DOM focus.
            windowKeyboard = new Guacamole.Keyboard(document);
            // sendKeyEvent expects integer 1/0 (not boolean); guacd parses via atoi().
            windowKeyboard.onkeydown = (keysym: number) => {
                if (isNativeInput()) return;
                if (keysym === CTRL_L || keysym === CTRL_R) ctrlDown = true;
                if (isMac) {
                    if (keysym === META_L || keysym === META_R) {
                        // Cmd → Ctrl: covers Cmd+C (copy), Cmd+A, Cmd+Z, etc.
                        macMetaDown = true;
                        guacClient.sendKeyEvent(1, keysym === META_L ? CTRL_L : CTRL_R);
                        return;
                    }
                    if (macMetaDown && keysym === V_KEYSYM) {
                        // Cmd+V: suppress keyboard V — paste handler sends clipboard
                        // then V so the remote gets them in the correct order.
                        macVSuppressed = true;
                        return;
                    }
                }
                guacClient.sendKeyEvent(1, keysym);
            };
            windowKeyboard.onkeyup = (keysym: number) => {
                if (isNativeInput()) return;
                if (keysym === CTRL_L || keysym === CTRL_R) ctrlDown = false;
                if (isMac) {
                    if (keysym === META_L || keysym === META_R) {
                        macMetaDown = false;
                        guacClient.sendKeyEvent(0, keysym === META_L ? CTRL_L : CTRL_R);
                        return;
                    }
                    if (keysym === V_KEYSYM && macVSuppressed) {
                        // V keydown was suppressed; skip the keyup too (paste handler
                        // already sent the matched down+up pair).
                        macVSuppressed = false;
                        return;
                    }
                }
                guacClient.sendKeyEvent(0, keysym);
            };
            // Connect
            guacClient.connect(connectData);
        });
        return () => {
            fitFnRef.current = null;
            macMetaDown = macVSuppressed = ctrlDown = false;
            if (pasteHandler) document.removeEventListener('paste', pasteHandler);
            try { guacClient?.disconnect(); } catch { /* ignore */ }
            try {
                if (windowKeyboard) {
                    windowKeyboard.onkeydown = null;
                    windowKeyboard.onkeyup = null;
                    windowKeyboard.reset?.();
                }
            } catch { /* ignore */ }
            resizeObserver?.disconnect();
            if (displayEl && displayEl.parentNode === container) {
                container.removeChild(displayEl);
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [serverId, connectionToken, protocol, preferredWidth, preferredHeight]);
    const isConnecting = clientState === 1 || clientState === 2;
    const isConnected  = clientState === 3;
    const label        = CLIENT_STATE_LABELS[clientState] ?? String(clientState);
    return (
        <div className="relative h-full w-full bg-black overflow-hidden">
            {/* Status badge */}
            <div className="absolute top-2 right-2 z-10 flex items-center gap-2 pointer-events-none">
                <span
                    className={`w-2 h-2 rounded-full ${
                        isConnected
                            ? 'bg-green-500'
                            : isConnecting
                            ? 'bg-yellow-500 animate-pulse'
                            : 'bg-red-500'
                    }`}
                />
                <span className="text-xs text-gray-400 capitalize bg-black/50 px-2 py-1 rounded">
                    {label}
                </span>
            </div>
            {/* Guacamole display is mounted here via useEffect */}
            <div ref={containerRef} className="h-full w-full" />
            {/* Connecting overlay */}
            {isConnecting && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/75 z-20 pointer-events-none">
                    <div className="text-center">
                        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                        <p className="text-white">
                            Connecting to {protocol.toUpperCase()}...
                        </p>
                    </div>
                </div>
            )}
            {/* Error overlay */}
            {errorMsg && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/75 z-20">
                    <div className="text-center px-6 max-w-md">
                        <p className="text-red-400 text-sm font-semibold mb-2">Connection Error</p>
                        <p className="text-gray-300 text-xs leading-relaxed">{errorMsg}</p>
                        <button
                            onClick={() => window.location.reload()}
                            className="mt-4 px-4 py-1.5 text-xs bg-primary text-primary-foreground rounded hover:opacity-90"
                        >
                            Retry
                        </button>
                    </div>
                </div>
            )}
            {/* Disconnected overlay */}
            {!errorMsg && (clientState === 4 || clientState === 5) && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/75 z-20 pointer-events-none">
                    <p className="text-gray-300 text-sm">Disconnected</p>
                </div>
            )}
        </div>
    );
}
