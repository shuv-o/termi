import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from '@/lib/og-image';

export const alt = 'Termi security policy';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function OpengraphImage() {
    return ogImage({
        title: 'Security policy',
        subtitle:
            'How Termi protects your credentials, and how to report a vulnerability privately.',
    });
}
