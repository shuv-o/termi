import type { Metadata, Viewport } from 'next';
import { cookies, headers } from 'next/headers';
import { IBM_Plex_Sans, JetBrains_Mono } from 'next/font/google';
import '../styles/globals.css';
import InstallPrompt from '@/components/pwa/InstallPrompt';
import CapacitorBridge from '@/components/pwa/CapacitorBridge';
import { getSiteUrl } from '@/lib/site';
import {
    AUTHOR,
    SITE_DESCRIPTION,
    SITE_KEYWORDS,
    SITE_NAME,
    SITE_TITLE,
    searchIndexingAllowed,
} from '@/lib/seo';
import {
    APPEARANCE_COOKIE,
    decodePaintCookie,
    paintAttributes,
    THEME_COLOR,
} from '@/lib/appearance/prefs';

// Self-hosted at build time by next/font, so the CSP's `font-src 'self'` holds.
const plex = IBM_Plex_Sans({
    subsets: ['latin'],
    weight: ['400', '500', '600', '700'],
    variable: '--font-plex',
    display: 'swap',
});
const jetbrains = JetBrains_Mono({
    subsets: ['latin'],
    weight: ['400', '500'],
    variable: '--font-jetbrains',
    display: 'swap',
});

const indexable = searchIndexingAllowed();

export const metadata: Metadata = {
    // Absolute URLs (canonical, Open Graph) resolve against the deployment's
    // own domain: every self-hosted instance has its own.
    metadataBase: new URL(getSiteUrl()),
    applicationName: SITE_NAME,
    title: {
        default: SITE_TITLE,
        template: '%s | Termi',
    },
    description: SITE_DESCRIPTION,
    keywords: SITE_KEYWORDS,
    authors: [{ name: AUTHOR.name, url: AUTHOR.url }],
    creator: AUTHOR.name,
    publisher: AUTHOR.name,
    manifest: '/manifest.json',
    icons: {
        icon: [
            { url: '/favicon.ico', sizes: 'any' },
            { url: '/icons/icon-96x96.png', sizes: '96x96', type: 'image/png' },
            { url: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
        ],
        apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
    },
    appleWebApp: {
        capable: true,
        title: SITE_NAME,
        statusBarStyle: 'black-translucent',
    },
    formatDetection: { telephone: false, email: false, address: false },
    openGraph: {
        title: SITE_TITLE,
        description: SITE_DESCRIPTION,
        type: 'website',
        siteName: SITE_NAME,
        locale: 'en_US',
    },
    twitter: {
        card: 'summary_large_image',
        title: SITE_TITLE,
        description: SITE_DESCRIPTION,
    },
    robots: indexable
        ? {
              index: true,
              follow: true,
              googleBot: {
                  index: true,
                  follow: true,
                  'max-snippet': -1,
                  'max-image-preview': 'large',
                  'max-video-preview': -1,
              },
          }
        : { index: false, follow: false },
    // Search Console / Bing Webmaster Tools ownership, when configured.
    verification: {
        google: process.env.GOOGLE_SITE_VERIFICATION || undefined,
        other: process.env.BING_SITE_VERIFICATION
            ? { 'msvalidate.01': process.env.BING_SITE_VERIFICATION }
            : undefined,
    },
    category: 'technology',
};

/** The user's theme (from the `termi-ui` cookie) also colours the browser chrome. */
export async function generateViewport(): Promise<Viewport> {
    const { theme } = decodePaintCookie((await cookies()).get(APPEARANCE_COOKIE)?.value);
    return {
        themeColor:
            theme === 'system'
                ? [
                      { media: '(prefers-color-scheme: light)', color: THEME_COLOR.day },
                      { media: '(prefers-color-scheme: dark)', color: THEME_COLOR.night },
                  ]
                : THEME_COLOR[theme],
        width: 'device-width',
        initialScale: 1,
        maximumScale: 1,
        userScalable: false,
        viewportFit: 'cover',
    };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
    const nonce = (await headers()).get('x-nonce') ?? '';
    // Painted on the server, so the first frame is already in the user's theme.
    const paint = paintAttributes(
        decodePaintCookie((await cookies()).get(APPEARANCE_COOKIE)?.value),
    );

    return (
        <html lang="en" className={`${plex.variable} ${jetbrains.variable}`} {...paint}>
            <head>
                {/* Propagate the per-request nonce so Next.js can apply it to
                    any inline scripts it injects during hydration */}
                <meta name="csp-nonce" content={nonce} />
                {/* Microsoft tile */}
                <meta name="msapplication-TileColor" content="#0e1319" />
                <meta name="msapplication-TileImage" content="/icons/icon-144x144.png" />
            </head>
            <body className="min-h-screen bg-background text-foreground antialiased">
                {children}
                <InstallPrompt />
                <CapacitorBridge />
                <script
                    nonce={nonce}
                    dangerouslySetInnerHTML={{
                        __html: `
                        if ('serviceWorker' in navigator) {
                          window.addEventListener('load', function() {
                            navigator.serviceWorker.register('/sw.js').catch(function(err) {
                              console.warn('SW registration failed:', err);
                            });
                          });
                        }`.trim(),
                    }}
                />
            </body>
        </html>
    );
}
