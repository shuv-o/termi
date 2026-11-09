import type { MetadataRoute } from 'next';

import { PRIVATE_PATH_PREFIXES, searchIndexingAllowed } from '@/lib/seo';
import { getSiteUrl } from '@/lib/site';

// Read SEARCH_INDEXING and NEXT_PUBLIC_APP_URL per request: a prebuilt image is
// configured when it starts, not when it is built.
export const dynamic = 'force-dynamic';

export default function robots(): MetadataRoute.Robots {
    if (!searchIndexingAllowed()) {
        return { rules: [{ userAgent: '*', disallow: '/' }] };
    }
    return {
        rules: [
            {
                userAgent: '*',
                allow: ['/', '/privacy', '/security'],
                // Prefix matches: '/panel' covers every page under it.
                disallow: PRIVATE_PATH_PREFIXES,
            },
        ],
        // This instance's own sitemap: every self-hosted deployment has its own domain.
        sitemap: `${getSiteUrl()}/sitemap.xml`,
        host: getSiteUrl(),
    };
}
