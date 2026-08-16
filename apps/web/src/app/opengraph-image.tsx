import { ImageResponse } from 'next/og';

/**
 * The site had no Open Graph image at all, so every shared link (Slack,
 * Discord, Twitter/X, LinkedIn) rendered as a bare title with no visual —
 * the single biggest lever on click-through from a shared link. Next's
 * `opengraph-image` file convention renders this at request time and wires
 * up the og:image / twitter:image meta tags automatically; no manual asset
 * upload, no stale image to remember to update.
 */

export const alt = 'Termi — Self-hosted SSH, SCP, RDP & VNC from your browser';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const PROTOCOLS = ['SSH', 'SCP', 'RDP', 'VNC'];

export default function OpengraphImage() {
    return new ImageResponse(
        <div
            style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#0f172a',
                backgroundImage:
                    'radial-gradient(circle at 22% 20%, rgba(14,165,233,0.35), rgba(15,23,42,0) 55%), radial-gradient(circle at 82% 78%, rgba(139,92,246,0.30), rgba(15,23,42,0) 55%)',
                fontFamily: 'sans-serif',
            }}
        >
            {/* Terminal-window chrome, to visually anchor "this is a terminal app" */}
            <div
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    width: 920,
                    borderRadius: 16,
                    border: '1px solid rgba(148,163,184,0.25)',
                    backgroundColor: 'rgba(15,23,42,0.55)',
                    boxShadow: '0 30px 80px rgba(0,0,0,0.45)',
                    overflow: 'hidden',
                }}
            >
                {/* Title bar */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '16px 20px',
                        borderBottom: '1px solid rgba(148,163,184,0.18)',
                    }}
                >
                    <div
                        style={{
                            width: 12,
                            height: 12,
                            borderRadius: 999,
                            backgroundColor: '#ef4444',
                            display: 'flex',
                        }}
                    />
                    <div
                        style={{
                            width: 12,
                            height: 12,
                            borderRadius: 999,
                            backgroundColor: '#f59e0b',
                            display: 'flex',
                        }}
                    />
                    <div
                        style={{
                            width: 12,
                            height: 12,
                            borderRadius: 999,
                            backgroundColor: '#22c55e',
                            display: 'flex',
                        }}
                    />
                </div>

                {/* Body */}
                <div
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-start',
                        padding: '56px 60px 60px',
                    }}
                >
                    <div
                        style={{
                            display: 'flex',
                            fontSize: 88,
                            fontWeight: 800,
                            letterSpacing: -2,
                            color: '#f8fafc',
                        }}
                    >
                        Termi
                    </div>

                    <div
                        style={{
                            display: 'flex',
                            marginTop: 18,
                            fontSize: 32,
                            color: '#94a3b8',
                            maxWidth: 780,
                        }}
                    >
                        Self-hosted SSH, SCP, RDP &amp; VNC — from your browser
                    </div>

                    <div style={{ display: 'flex', gap: 12, marginTop: 40 }}>
                        {PROTOCOLS.map((label) => (
                            <div
                                key={label}
                                style={{
                                    display: 'flex',
                                    padding: '10px 22px',
                                    borderRadius: 999,
                                    fontSize: 24,
                                    fontWeight: 600,
                                    color: '#7dd3fc',
                                    backgroundColor: 'rgba(14,165,233,0.12)',
                                    border: '1px solid rgba(14,165,233,0.35)',
                                }}
                            >
                                {label}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div
                style={{
                    display: 'flex',
                    marginTop: 32,
                    fontSize: 24,
                    color: '#64748b',
                }}
            >
                Open source · Self-hosted · AES-256-GCM encrypted
            </div>
        </div>,
        { ...size },
    );
}
