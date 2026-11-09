import type { MetadataRoute } from 'next';

import { searchIndexingAllowed } from '@/lib/seo';
import { getSiteUrl } from '@/lib/site';

// Read SEARCH_INDEXING and NEXT_PUBLIC_APP_URL per request: a prebuilt image is
// configured when it starts, not when it is built.
export const dynamic = 'force-dynamic';

/** The public pages worth finding. Sign-in and the app itself are never listed. */
export default function sitemap(): MetadataRoute.Sitemap {
    if (!searchIndexingAllowed()) return [];
    const base = getSiteUrl();
    return [
        { url: base, changeFrequency: 'weekly', priority: 1 },
        { url: `${base}/security`, changeFrequency: 'monthly', priority: 0.5 },
        { url: `${base}/privacy`, changeFrequency: 'yearly', priority: 0.3 },
    ];
}
