/** GET /api/auth/sso — whether single sign-on is set up, and its button label. */

import { successResponse } from '@/lib/api';
import { oidcConfig } from '@/lib/auth/oidc';

export function GET() {
    const cfg = oidcConfig();
    return successResponse({ enabled: !!cfg, name: cfg?.name ?? null });
}
