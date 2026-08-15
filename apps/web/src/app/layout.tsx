import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import '../styles/globals.css';
import InstallPrompt from '@/components/pwa/InstallPrompt';
import CapacitorBridge from '@/components/pwa/CapacitorBridge';
import { getSiteUrl } from '@/lib/site';

export const metadata: Metadata = {
    // Resolves relative OG/twitter image URLs and the canonical link tag. This
    // must be the site people actually land on when they click a shared link,
    // and — since Termix is self-hosted — that's a different domain for every
    // deployment (NEXT_PUBLIC_APP_URL), not always this project's own site.
    metadataBase: new URL(getSiteUrl()),
    title: {
        default: 'Termix - Secure Server Management',
        template: '%s | Termi',
    },
    description:
        'Termix is an open-source, self-hosted server management platform. Manage Linux and Windows servers via SSH, SCP, RDP, and VNC directly from your browser — with AES-256-GCM encryption, TOTP 2FA, and a mobile-ready PWA.',
    keywords: [
        'server management',
        'SSH client',
        'SCP file transfer',
        'RDP remote desktop',
        'VNC viewer',
        'self-hosted',
        'open source',
        'web terminal',
        'xterm.js',
        'secure server access',
        'AES-256 encryption',
        'TOTP 2FA',
        'PWA',
        'Next.js',
        'developer tools',
        'Shuvo',
    ],
    authors: [
        {
            name: 'Shuvo',
            url: 'https://github.com/shuv-o',
        },
    ],
    creator: 'Shuvo',
    publisher: 'Shuvo',
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
        title: 'Termi',
        statusBarStyle: 'black-translucent',
    },
    openGraph: {
        title: 'Termix - Secure Server Management',
        description:
            'Open-source self-hosted platform to manage servers via SSH, SCP, RDP, and VNC from your browser. Built with Next.js, AES-256-GCM encryption, and TOTP 2FA.',
        type: 'website',
        url: getSiteUrl(),
        siteName: 'Termi',
        locale: 'en_US',
    },
    twitter: {
        card: 'summary_large_image',
        title: 'Termix - Secure Server Management',
        description:
            'Open-source self-hosted platform to manage servers via SSH, SCP, RDP, and VNC from your browser.',
        creator: '@shuv-o',
    },
    robots: {
        index: true,
        follow: true,
        googleBot: {
            index: true,
            follow: true,
            'max-snippet': -1,
            'max-image-preview': 'large',
            'max-video-preview': -1,
        },
    },
    category: 'technology',
    // Without an explicit canonical, search engines have to guess which URL is
    // authoritative when the same page is reachable under multiple hosts/paths.
    alternates: {
        canonical: '/',
    },
};

export const viewport: Viewport = {
    themeColor: '#0f172a',
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
    viewportFit: 'cover',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
    const nonce = (await headers()).get('x-nonce') ?? '';

    return (
        <html lang="en" className="dark">
            <head>
                {/* Propagate the per-request nonce so Next.js can apply it to
                    any inline scripts it injects during hydration */}
                <meta name="csp-nonce" content={nonce} />
                {/* Microsoft tile */}
                <meta name="msapplication-TileColor" content="#0f172a" />
                <meta name="msapplication-TileImage" content="/icons/icon-144x144.png" />
            </head>
            <body className="min-h-screen bg-background text-white antialiased">
                {children}
                <InstallPrompt />
                <CapacitorBridge />
                <script
                    type="application/ld+json"
                    nonce={nonce}
                    dangerouslySetInnerHTML={{
                        __html: JSON.stringify({
                            '@context': 'https://schema.org',
                            '@graph': [
                                {
                                    '@type': 'SoftwareApplication',
                                    name: 'Termi',
                                    applicationCategory: 'DeveloperApplication',
                                    operatingSystem: 'Any',
                                    description:
                                        'Open-source self-hosted server management platform with SSH, SCP, RDP, and VNC support. Features AES-256-GCM encryption, TOTP 2FA, and a mobile-ready PWA.',
                                    url: 'https://github.com/shuv-o/termi',
                                    author: {
                                        '@type': 'Person',
                                        name: 'Shuvo',
                                        email: 'shuvo.punam@gmail.com',
                                        url: 'https://github.com/shuv-o',
                                        sameAs: [
                                            'https://github.com/shuv-o',
                                            'https://www.linkedin.com/in/shuv-o/',
                                        ],
                                    },
                                    license: 'https://opensource.org/licenses/MIT',
                                    offers: {
                                        '@type': 'Offer',
                                        price: '0',
                                        priceCurrency: 'USD',
                                    },
                                    featureList: [
                                        'SSH Terminal',
                                        'SCP File Manager',
                                        'RDP Remote Desktop',
                                        'VNC Viewer',
                                        'AES-256-GCM Encryption',
                                        'TOTP Two-Factor Authentication',
                                        'Progressive Web App',
                                        'Mobile Optimized',
                                    ],
                                },
                                {
                                    '@type': 'Person',
                                    name: 'Shuvo',
                                    email: 'shuvo.punam@gmail.com',
                                    url: 'https://github.com/shuv-o',
                                    sameAs: [
                                        'https://github.com/shuv-o',
                                        'https://www.linkedin.com/in/shuv-o/',
                                    ],
                                },
                            ],
                        }),
                    }}
                />
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
