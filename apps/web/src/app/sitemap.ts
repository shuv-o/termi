import type { MetadataRoute } from 'next';

import { getSiteUrl } from '@/lib/site';

export default function sitemap(): MetadataRoute.Sitemap {
    // Each self-hosted deployment has its own domain — the sitemap must list
    // that instance's own pages, not the maintainer's. The previous fallback
    // (when NEXT_PUBLIC_APP_URL was unset) pointed at the GitHub repo instead
    // of a real site; getSiteUrl() falls back to this project's own domain,
    // which is at least a working page.
    const baseUrl = getSiteUrl();

    return [
        {
            url: baseUrl,
            lastModified: new Date(),
            changeFrequency: 'monthly',
            priority: 1,
        },
        {
            url: `${baseUrl}/login`,
            lastModified: new Date(),
            changeFrequency: 'yearly',
            priority: 0.5,
        },
        {
            url: `${baseUrl}/register`,
            lastModified: new Date(),
            changeFrequency: 'yearly',
            priority: 0.5,
        },
        {
            url: `${baseUrl}/privacy`,
            lastModified: new Date(),
            changeFrequency: 'yearly',
            priority: 0.3,
        },
        {
            url: `${baseUrl}/security`,
            lastModified: new Date(),
            changeFrequency: 'yearly',
            priority: 0.3,
        },
    ];
}
