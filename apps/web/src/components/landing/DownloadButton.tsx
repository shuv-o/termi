'use client';

import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';

type OS = 'mac' | 'windows' | 'linux';
type Arch = 'arm64' | 'x64';

//   Release artifact URLs                                       ─
//   Files follow the `termi-<version>-<arch>.<ext>` convention.

const RELEASE_BASE = 'https://termi.bucket.shuvoo.com/releases';
const VERSION = 'v1.0.0';

const FILE_EXT: Record<OS, string> = {
    mac: 'dmg',
    windows: 'exe',
    linux: 'AppImage',
};

function downloadUrl(os: OS, arch: Arch): string {
    return `${RELEASE_BASE}/termi-${VERSION}-${arch}.${FILE_EXT[os]}`;
}

//   Brand glyphs (lucide has no brand icons)                    ─

function AppleIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M16.365 1.43c0 1.14-.493 2.27-1.177 3.08-.744.9-1.99 1.57-2.987 1.57-.12 0-.23-.02-.3-.03-.01-.06-.04-.22-.04-.39 0-1.13.572-2.27 1.206-2.98.804-.94 2.142-1.64 3.248-1.68.03.13.05.28.05.43zm4.565 15.71c-.03.07-.463 1.58-1.518 3.12-.945 1.34-1.94 2.71-3.43 2.71-1.485 0-1.96-.88-3.66-.88-1.7 0-2.23.85-3.64.91-1.47.06-2.59-1.44-3.54-2.78-1.93-2.71-3.41-7.68-1.42-11.03.98-1.66 2.74-2.71 4.65-2.74 1.42-.03 2.76.96 3.63.96.85 0 2.49-1.19 4.2-1.01.71.03 2.72.29 4.01 2.18-.1.06-2.4 1.4-2.37 4.18.03 3.32 2.91 4.43 2.94 4.44z" />
        </svg>
    );
}

function WindowsIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M0 3.45 9.75 2.1v9.45H0V3.45zM10.95 1.95 24 0v11.4H10.95V1.95zM0 12.6h9.75v9.45L0 20.55V12.6zM10.95 12.6H24V24l-13.05-1.95V12.6z" />
        </svg>
    );
}

function LinuxIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M14.62 8.35c-.42.28-1.75 1-1.95 1.13-.39.25-.74.23-1.13-.04-.2-.13-1.5-.84-1.92-1.12-.46-.31-.43-.75.07-.99.93-.46 1.99-.45 2.92-.01.5.24.54.71.04 1.03zm6.27 9.78c-.18.74-.84 1.06-1.85 1.46-.69.27-1.74.86-2.37 1.5-.66.77-1.48 1.24-2.25 1.3-.77.06-1.49-.29-1.88-1.07l-.01-.01c-.05-.13-.09-.19-.11-.33-1-.07-1.87-.39-2.57-.2-.86.05-1.39.31-1.91.32-.24.48-.68.83-1.21.94-.75.2-1.69-.04-2.61-.47-.86-.46-1.96-.4-2.77-.6-.4-.13-.77-.27-.94-.6-.17-.34-.14-.8.11-1.48.07-.24.01-.57-.04-.97-.03-.13-.06-.34-.06-.54 0-.2.04-.41.13-.6.21-.41.55-.54.86-.68.31-.13.6-.2.8-.4.21-.24.4-.57.66-.84a.42.42 0 01.11-.13c-.12-.81.01-1.66.29-2.49.59-1.77 1.83-3.47 2.72-4.52.75-1.07.97-1.93 1.05-3.02C7 5.41 5.88.94 10.1.6c.16-.01.33-.02.48-.02 3.78 0 3.57 3.99 3.54 6.14-.02 1.41.77 2.36 1.56 3.37.71.84 1.64 2.07 2.18 3.48.43 1.14.6 2.42.17 3.7a.36.36 0 01.19.06c.06.07.13.08.19.13h.01c.31.26.4.65.49 1.05.09.39.17.73.34.93l.01.01c.51.56.73.97.71 1.37z" />
        </svg>
    );
}

const PLATFORMS: Record<
    OS,
    {
        label: string;
        Icon: (p: { className?: string }) => React.ReactElement;
        archLabel: Record<Arch, string>;
    }
> = {
    mac: {
        label: 'macOS',
        Icon: AppleIcon,
        archLabel: { arm64: 'Apple Silicon', x64: 'Intel' },
    },
    windows: {
        label: 'Windows',
        Icon: WindowsIcon,
        archLabel: { arm64: 'ARM64', x64: 'x64' },
    },
    linux: {
        label: 'Linux',
        Icon: LinuxIcon,
        archLabel: { arm64: 'ARM64', x64: 'x64' },
    },
};

const OS_ORDER: OS[] = ['mac', 'windows', 'linux'];
const ARCH_ORDER: Arch[] = ['arm64', 'x64'];

function detectOS(): OS {
    if (typeof navigator === 'undefined') return 'mac';
    const ua = navigator.userAgent.toLowerCase();
    const platform = (navigator.platform || '').toLowerCase();
    if (/mac|iphone|ipad|ipod/.test(ua) || platform.includes('mac')) return 'mac';
    if (/win/.test(ua) || platform.includes('win')) return 'windows';
    return 'linux';
}

/** Best-effort renderer string from WebGL, used to spot Apple Silicon GPUs. */
function webglRenderer(): string | null {
    try {
        const canvas = document.createElement('canvas');
        const gl = (canvas.getContext('webgl') ||
            canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
        if (!gl) return null;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        if (!ext) return null;
        return String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) ?? '');
    } catch {
        return null;
    }
}

/**
 * Detect CPU architecture. Prefers the high-entropy User-Agent Client Hints
 * (Chromium), falls back to UA string sniffing, and uses a WebGL renderer
 * heuristic to catch Apple Silicon Macs (which still report "MacIntel").
 */
async function detectArch(os: OS): Promise<Arch> {
    const uaData = (
        navigator as Navigator & {
            userAgentData?: {
                getHighEntropyValues?: (h: string[]) => Promise<{ architecture?: string }>;
            };
        }
    ).userAgentData;

    if (uaData?.getHighEntropyValues) {
        try {
            const { architecture } = await uaData.getHighEntropyValues(['architecture']);
            if (architecture === 'arm' || architecture === 'arm64') return 'arm64';
            if (architecture === 'x86') return 'x64';
        } catch {
            /* fall through to heuristics */
        }
    }

    const ua = navigator.userAgent.toLowerCase();
    if (/aarch64|arm64|armv[78]|\barm\b/.test(ua)) return 'arm64';

    if (os === 'mac') {
        const renderer = webglRenderer();
        if (renderer && /apple/i.test(renderer) && !/intel|amd|radeon|nvidia/i.test(renderer)) {
            return 'arm64';
        }
    }

    return 'x64';
}

export default function DownloadDesktopButton() {
    // Deterministic first render, then refine on mount once we can read the
    // navigator / WebGL context.
    const [os, setOs] = useState<OS>('mac');
    const [arch, setArch] = useState<Arch>('arm64');
    const [showAll, setShowAll] = useState(false);

    useEffect(() => {
        const detected = detectOS();
        setOs(detected);
        detectArch(detected).then(setArch);
    }, []);

    const { label, Icon, archLabel } = PLATFORMS[os];

    return (
        <div className="flex flex-col items-center gap-4">
            {/* Primary, OS + architecture aware download */}
            <a
                href={downloadUrl(os, arch)}
                download
                className="group inline-flex items-center gap-3 px-6 py-3.5 rounded-xl bg-gradient-to-r from-primary to-sky-600 text-white font-semibold shadow-lg shadow-primary/20 hover:shadow-primary/40 hover:-translate-y-0.5 transition-all duration-200"
            >
                <Icon className="w-5 h-5" />
                <span>
                    Download for {label}
                    <span className="opacity-80"> ({archLabel[arch]})</span>
                </span>
                <Download className="w-4 h-4 opacity-80 group-hover:translate-y-0.5 transition-transform" />
            </a>

            <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                className="text-sm text-slate-400 hover:text-white transition-colors"
            >
                {showAll ? 'Hide all downloads' : 'All platforms & architectures'}
            </button>

            {/* Full matrix: every OS × architecture */}
            {showAll && (
                <div className="w-full max-w-md space-y-3 rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
                    {OS_ORDER.map((o) => {
                        const P = PLATFORMS[o];
                        return (
                            <div
                                key={o}
                                className="flex items-center justify-between gap-3 text-sm"
                            >
                                <span className="inline-flex items-center gap-2 text-slate-300">
                                    <P.Icon className="w-4 h-4" />
                                    {P.label}
                                </span>
                                <div className="flex items-center gap-2">
                                    {ARCH_ORDER.map((a) => {
                                        const current = o === os && a === arch;
                                        return (
                                            <a
                                                key={a}
                                                href={downloadUrl(o, a)}
                                                download
                                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition-colors ${
                                                    current
                                                        ? 'border-primary/60 bg-primary/10 text-white'
                                                        : 'border-slate-700/60 text-slate-400 hover:border-slate-500 hover:text-white'
                                                }`}
                                            >
                                                <Download className="w-3 h-3" />
                                                {P.archLabel[a]}
                                            </a>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
