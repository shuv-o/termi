import type { MetadataRoute } from 'next';

import { getSiteUrl } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
    return {
        rules: [
            {
                userAgent: '*',
                allow: ['/', '/login', '/register'],
                disallow: ['/panel/', '/api/'],
            },
        ],
        // Was hardcoded to a github.com URL that serves no such file — crawlers
        // following robots.txt's sitemap pointer got a 404 instead of the real
        // sitemap. Must match the sitemap route's own base URL (getSiteUrl()),
        // not a fixed domain, since every self-hosted instance differs.
        sitemap: `${getSiteUrl()}/sitemap.xml`,
    };
}
