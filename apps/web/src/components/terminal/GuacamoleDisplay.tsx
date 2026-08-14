'use client';
/**
 * GuacamoleDisplay - uses guacamole-common-js 1.6 officially.
 * GatewayTunnel bridges our custom gateway WS protocol to Guacamole.Tunnel.
 */
import { useEffect, useRef, useState } from 'react';
import { Keyboard } from 'lucide-react';
import { createGatewayTunnel } from './GatewayTunnel';

// X11 keysyms for keys a normal keyboard/browser can't send at all (the OS
// intercepts Ctrl+Alt+Del before it reaches any page) or that touch devices
// have no physical key for.
const KEYSYM = {
    ESCAPE: 0xff1b,
    TAB: 0xff09,
    DELETE: 0xffff,
    CTRL_L: 0xffe3,
    ALT_L: 0xffe9,
    SUPER_L: 0xffeb,
};
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
    const [showKeyboard, setShowKeyboard] = useState(false);
    const onDisconnectRef = useRef(onDisconnect);
    onDisconnectRef.current = onDisconnect;
    const onErrorRef = useRef(onError);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const guacClientRef = useRef<any>(null);
    const hiddenInputRef = useRef<HTMLInputElement>(null);

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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let mobileKeyboard: any = null;
        let resizeObserver: ResizeObserver | null = null;
        let displayEl: HTMLElement | null = null;
        let pasteHandler: ((e: ClipboardEvent) => void) | null = null;
        // Mac keyboard state — reset on cleanup
        let macMetaDown = false; // true while Cmd (Meta) is physically held
        let macVSuppressed = false; // true when Cmd+V V-key was suppressed (paste handler sends it)
        let ctrlDown = false; // true while physical Ctrl is held (all platforms)
        let ctrlVSuppressed = false; // true when Ctrl+V V-key was suppressed (paste handler sends it)
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
            const width = preferredWidth || container.clientWidth || 1280;
            const height = preferredHeight || container.clientHeight || 800;
            const connectData =
                `protocol=${protocol}` +
                `&serverId=${encodeURIComponent(serverId)}` +
                `&width=${width}&height=${height}`;
            const tunnel = createGatewayTunnel(Guacamole, wsUrl, connectionToken);
            // Client
            guacClient = new Guacamole.Client(tunnel);
            guacClientRef.current = guacClient;
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
                    const s =
                        scaleRef.current !== undefined
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
                const raw: string = (status?.message ?? '')
                    .replace(/^Guacamole error:\s*/i, '')
                    .trim();
                const msg =
                    raw || (GUAC_STATUS_MESSAGES[code] ?? `Remote desktop error (code ${code})`);
                console.error('[Guacamole] Client error:', msg, status);
                setErrorMsg(msg);
                onErrorRef.current?.(msg);
            };
            // Clipboard: remote → local
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            guacClient.onclipboard = (stream: any, mimetype: string) => {
                if (mimetype === 'text/plain') {
                    let b64 = '';
                    stream.onblob = (chunk: string) => {
                        b64 += chunk;
                    };
                    stream.onend = () => {
                        try {
                            // atob gives raw bytes; TextDecoder handles multi-byte UTF-8 correctly
                            const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
                            const text = new TextDecoder().decode(bytes);
                            navigator.clipboard?.writeText(text).catch(() => {
                                /* silently ignore — page may lack focus */
                            });
                        } catch {
                            /* ignore */
                        }
                    };
                }
            };
            // Shared guard: skip forwarding when a native text field is focused.
            const isNativeInput = () => {
                const a = document.activeElement as HTMLElement | null;
                if (!a) return false;
                const tag = a.tagName.toLowerCase();
                return (
                    tag === 'input' ||
                    tag === 'textarea' ||
                    tag === 'select' ||
                    !!a.isContentEditable
                );
            };
            //   Mac Cmd → Ctrl mapping                      ─
            // X11 keysyms used by guacamole-common-js on Mac:
            //   Meta_L 0xFFE7  Meta_R 0xFFE8  (Mac Command key)
            //   Control_L 0xFFE3  Control_R 0xFFE4
            const isMac = /Mac/i.test(navigator.platform);
            const META_L = 0xffe7,
                META_R = 0xffe8;
            const CTRL_L = 0xffe3,
                CTRL_R = 0xffe4;
            const V_KEYSYM = 0x76;
            //
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
                // Send Ctrl+V AFTER clipboard content so the remote pastes the correct data.
                // V keydown is suppressed in the keyboard handler for both Mac Cmd+V and
                // non-Mac Ctrl+V, so clipboard always arrives before the V keystroke.
                if (isMac && macMetaDown) {
                    // Mac: Ctrl already held via Meta→Ctrl mapping; just send V
                    guacClient.sendKeyEvent(1, V_KEYSYM);
                    guacClient.sendKeyEvent(0, V_KEYSYM);
                } else if (ctrlVSuppressed) {
                    // Windows/Linux Ctrl+V: Ctrl is held, V was suppressed; send V now
                    guacClient.sendKeyEvent(1, V_KEYSYM);
                    guacClient.sendKeyEvent(0, V_KEYSYM);
                    // Leave ctrlVSuppressed=true so keyup handler knows to skip the V keyup
                } else if (!ctrlDown) {
                    // Right-click / menu paste — no Ctrl held; send full Ctrl+V
                    guacClient.sendKeyEvent(1, CTRL_L);
                    guacClient.sendKeyEvent(1, V_KEYSYM);
                    guacClient.sendKeyEvent(0, V_KEYSYM);
                    guacClient.sendKeyEvent(0, CTRL_L);
                }
            };
            document.addEventListener('paste', pasteHandler);
            // Audio from remote desktop
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            guacClient.onaudio = (stream: any, mimetype: string) => {
                Guacamole.AudioPlayer.getInstance(stream, mimetype);
            };
            // Mouse: legacy handler API receives Guacamole.Mouse.State directly.
            // Plain Guacamole.Mouse only binds mousedown/mousemove/mouseup — touch
            // devices never fire those, so taps would otherwise do nothing.
            // Touchscreen (tap-to-click, long-press-to-right-click) is the absolute-
            // positioning equivalent, which matches how RDP/VNC render the remote screen.
            const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
            const mouse = isTouchDevice
                ? new Guacamole.Mouse.Touchscreen(displayEl)
                : new Guacamole.Mouse(displayEl);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const forwardMouse = (state: any) => guacClient.sendMouseState(state, true);
            mouse.onmousedown = forwardMouse;
            mouse.onmouseup = forwardMouse;
            mouse.onmousemove = forwardMouse;
            mouse.onmouseout = forwardMouse;
            // Suppress context menu so right-click is forwarded
            displayEl.addEventListener('contextmenu', (e: Event) => e.preventDefault());
            // sendKeyEvent expects integer 1/0 (not boolean); guacd parses via atoi().
            const forwardKeyDown = (keysym: number) => {
                if (keysym === CTRL_L || keysym === CTRL_R) ctrlDown = true;
                if (isMac) {
                    if (keysym === META_L || keysym === META_R) {
                        // Cmd → Ctrl: covers Cmd+C (copy), Cmd+A, Cmd+Z, etc.
                        macMetaDown = true;
                        guacClient.sendKeyEvent(1, keysym === META_L ? CTRL_L : CTRL_R);
                        return;
                    }
                    if (macMetaDown && keysym === V_KEYSYM) {
                        // Cmd+V: suppress V — paste handler sends clipboard then V in order.
                        macVSuppressed = true;
                        return;
                    }
                }
                // Ctrl+V: suppress V on all platforms — paste handler sends clipboard
                // then V so the remote always receives clipboard data before the keystroke.
                if (ctrlDown && keysym === V_KEYSYM) {
                    ctrlVSuppressed = true;
                    return;
                }
                guacClient.sendKeyEvent(1, keysym);
            };
            const forwardKeyUp = (keysym: number) => {
                if (keysym === CTRL_L || keysym === CTRL_R) ctrlDown = false;
                if (isMac) {
                    if (keysym === META_L || keysym === META_R) {
                        macMetaDown = false;
                        guacClient.sendKeyEvent(0, keysym === META_L ? CTRL_L : CTRL_R);
                        return;
                    }
                    if (keysym === V_KEYSYM && macVSuppressed) {
                        macVSuppressed = false;
                        return;
                    }
                }
                if (keysym === V_KEYSYM && ctrlVSuppressed) {
                    // V keydown was suppressed; skip keyup too (paste handler already sent the pair).
                    ctrlVSuppressed = false;
                    return;
                }
                guacClient.sendKeyEvent(0, keysym);
            };
            // Document-level keyboard — works regardless of which element has DOM
            // focus, but deliberately skips events while a native input/textarea
            // elsewhere on the page is focused (e.g. the hidden mobile-keyboard
            // input below, which has its own dedicated, unguarded instance).
            windowKeyboard = new Guacamole.Keyboard(document);
            windowKeyboard.onkeydown = (keysym: number) => {
                if (isNativeInput()) return;
                forwardKeyDown(keysym);
            };
            windowKeyboard.onkeyup = (keysym: number) => {
                if (isNativeInput()) return;
                forwardKeyUp(keysym);
            };
            // Mobile on-screen keyboard: bound directly to the hidden input (not
            // document), so it's exempt from the isNativeInput guard above — that
            // guard exists to ignore *other* native fields, not this one.
            if (hiddenInputRef.current) {
                mobileKeyboard = new Guacamole.Keyboard(hiddenInputRef.current);
                mobileKeyboard.onkeydown = forwardKeyDown;
                mobileKeyboard.onkeyup = forwardKeyUp;
            }
            // Connect
            guacClient.connect(connectData);
        });
        return () => {
            fitFnRef.current = null;
            macMetaDown = macVSuppressed = ctrlDown = ctrlVSuppressed = false;
            if (pasteHandler) document.removeEventListener('paste', pasteHandler);
            guacClientRef.current = null;
            try {
                guacClient?.disconnect();
            } catch {
                /* ignore */
            }
            try {
                if (windowKeyboard) {
                    windowKeyboard.onkeydown = null;
                    windowKeyboard.onkeyup = null;
                    windowKeyboard.reset?.();
                }
                if (mobileKeyboard) {
                    mobileKeyboard.onkeydown = null;
                    mobileKeyboard.onkeyup = null;
                    mobileKeyboard.reset?.();
                }
            } catch {
                /* ignore */
            }
            resizeObserver?.disconnect();
            if (displayEl && displayEl.parentNode === container) {
                container.removeChild(displayEl);
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [serverId, connectionToken, protocol, preferredWidth, preferredHeight]);
    const isConnecting = clientState === 1 || clientState === 2;
    const isConnected = clientState === 3;
    const label = CLIENT_STATE_LABELS[clientState] ?? String(clientState);

    /** Single key tap: down, then up shortly after. */
    const sendTap = (keysym: number) => {
        const client = guacClientRef.current;
        if (!client) return;
        client.sendKeyEvent(1, keysym);
        setTimeout(() => client.sendKeyEvent(0, keysym), 50);
    };
    /** Chord: press every key in order, hold briefly, then release in reverse order. */
    const sendCombo = (keysyms: number[]) => {
        const client = guacClientRef.current;
        if (!client) return;
        keysyms.forEach((k) => client.sendKeyEvent(1, k));
        setTimeout(() => {
            [...keysyms].reverse().forEach((k) => client.sendKeyEvent(0, k));
        }, 80);
    };
    const toggleKeyboard = () => {
        setShowKeyboard((v) => {
            const next = !v;
            if (next) setTimeout(() => hiddenInputRef.current?.focus(), 0);
            else hiddenInputRef.current?.blur();
            return next;
        });
    };

    return (
        <div className="relative h-full w-full bg-black overflow-hidden">
            {/* Status badge + keyboard toggle */}
            <div className="absolute top-2 right-2 z-10 flex items-center gap-2">
                <button
                    onClick={toggleKeyboard}
                    title={showKeyboard ? 'Hide keyboard' : 'Show keyboard'}
                    className={`flex items-center justify-center w-7 h-7 rounded-md transition-colors ${
                        showKeyboard
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-black/50 text-gray-400 hover:text-white'
                    }`}
                >
                    <Keyboard className="w-3.5 h-3.5" />
                </button>
                <div className="flex items-center gap-2 pointer-events-none">
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
            </div>
            {/* Guacamole display is mounted here via useEffect */}
            <div ref={containerRef} className="h-full w-full" />
            {/* Hidden input: focusing it summons the mobile OS keyboard. Its own
                Guacamole.Keyboard instance (bound above) forwards its key events —
                nothing is displayed or typed here, everything goes to the remote screen. */}
            <input
                ref={hiddenInputRef}
                type="text"
                inputMode="text"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                aria-hidden="true"
                className="absolute w-px h-px opacity-0 -left-full"
            />
            {/* Special keys no browser can send via a normal keypress. */}
            {showKeyboard && (
                <div className="absolute bottom-0 left-0 right-0 z-10 flex items-center gap-1.5 px-2 py-2 bg-black/70 backdrop-blur-sm overflow-x-auto no-scrollbar">
                    <button
                        onClick={() => sendTap(KEYSYM.ESCAPE)}
                        className="shrink-0 px-3 py-1.5 rounded-md text-xs font-medium bg-white/10 text-gray-200 hover:bg-white/20"
                    >
                        Esc
                    </button>
                    <button
                        onClick={() => sendTap(KEYSYM.TAB)}
                        className="shrink-0 px-3 py-1.5 rounded-md text-xs font-medium bg-white/10 text-gray-200 hover:bg-white/20"
                    >
                        Tab
                    </button>
                    <button
                        onClick={() => sendCombo([KEYSYM.ALT_L, KEYSYM.TAB])}
                        className="shrink-0 px-3 py-1.5 rounded-md text-xs font-medium bg-white/10 text-gray-200 hover:bg-white/20"
                    >
                        Alt+Tab
                    </button>
                    <button
                        onClick={() => sendCombo([KEYSYM.CTRL_L, KEYSYM.ALT_L, KEYSYM.DELETE])}
                        className="shrink-0 px-3 py-1.5 rounded-md text-xs font-medium bg-white/10 text-gray-200 hover:bg-white/20"
                    >
                        Ctrl+Alt+Del
                    </button>
                    <button
                        onClick={() => sendTap(KEYSYM.SUPER_L)}
                        className="shrink-0 px-3 py-1.5 rounded-md text-xs font-medium bg-white/10 text-gray-200 hover:bg-white/20"
                    >
                        Win
                    </button>
                </div>
            )}
            {/* Connecting overlay */}
            {isConnecting && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/75 z-20 pointer-events-none">
                    <div className="text-center">
                        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                        <p className="text-white">Connecting to {protocol.toUpperCase()}...</p>
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
