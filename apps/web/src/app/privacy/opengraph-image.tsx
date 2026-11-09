import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from '@/lib/og-image';

export const alt = 'Termi privacy policy';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function OpengraphImage() {
    return ogImage({
        title: 'Privacy policy',
        subtitle: 'What Termi stores and why. Self-hosted, so your data stays on your own server.',
    });
}
