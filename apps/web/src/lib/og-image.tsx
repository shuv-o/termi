import { ImageResponse } from 'next/og';

/**
 * Link-preview images (Open Graph / X), drawn in Termi's own colours: a
 * terminal pane with the page's title, and the protocols Termi speaks.
 */

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = 'image/png';

const BG = '#0e1319';
const PANE = '#0b0f14';
const BORDER = 'rgba(148,163,184,0.22)';
const TEXT = '#e6edf3';
const MUTED = '#8b98a8';
const BLUE = '#38b2f0';

const PROTOCOLS: [string, string][] = [
    ['SSH', '#3ecfa4'],
    ['SFTP', '#7aa7ff'],
    ['RDP', '#b58cff'],
    ['VNC', '#ff9b5e'],
    ['Telnet', '#4fd1e0'],
    ['Serial', '#8b98a8'],
];

export function ogImage({ title, subtitle }: { title: string; subtitle: string }) {
    return new ImageResponse(
        <div
            style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                backgroundColor: BG,
                padding: 64,
                fontFamily: 'sans-serif',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 52,
                        height: 52,
                        borderRadius: 12,
                        backgroundColor: '#141a22',
                        border: `1px solid ${BORDER}`,
                        color: BLUE,
                        fontSize: 30,
                        fontWeight: 700,
                    }}
                >
                    {'>_'}
                </div>
                <div style={{ display: 'flex', fontSize: 34, fontWeight: 700, color: TEXT }}>
                    Termi
                </div>
                <div style={{ display: 'flex', marginLeft: 'auto', fontSize: 24, color: MUTED }}>
                    Open source, self-hosted
                </div>
            </div>

            <div
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    flex: 1,
                    marginTop: 40,
                    borderRadius: 18,
                    border: `1px solid ${BORDER}`,
                    backgroundColor: PANE,
                    padding: '44px 52px',
                }}
            >
                <div style={{ display: 'flex', fontSize: 26, color: '#3ecfa4' }}>
                    deploy@web-01:~$
                </div>
                <div
                    style={{
                        display: 'flex',
                        marginTop: 18,
                        fontSize: title.length > 30 ? 54 : 62,
                        fontWeight: 700,
                        lineHeight: 1.1,
                        letterSpacing: -1.5,
                        color: TEXT,
                        maxWidth: 980,
                    }}
                >
                    {title}
                </div>
                <div
                    style={{
                        display: 'flex',
                        marginTop: 20,
                        fontSize: 28,
                        lineHeight: 1.4,
                        color: MUTED,
                        maxWidth: 980,
                    }}
                >
                    {subtitle}
                </div>
                <div style={{ display: 'flex', gap: 22, marginTop: 'auto', paddingTop: 28 }}>
                    {PROTOCOLS.map(([name, color]) => (
                        <div
                            key={name}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 10,
                                fontSize: 24,
                                color: TEXT,
                            }}
                        >
                            <div
                                style={{
                                    display: 'flex',
                                    width: 12,
                                    height: 12,
                                    borderRadius: 999,
                                    backgroundColor: color,
                                }}
                            />
                            {name}
                        </div>
                    ))}
                </div>
            </div>
        </div>,
        { ...OG_SIZE },
    );
}
