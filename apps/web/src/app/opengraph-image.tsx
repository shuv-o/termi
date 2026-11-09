import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from '@/lib/og-image';

export const alt =
    'Termi: every server you run, in one browser tab. SSH, SFTP, RDP, VNC, Telnet and serial.';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function OpengraphImage() {
    return ogImage({
        title: 'Every server you run, in one browser tab',
        subtitle:
            'Terminals, files and remote desktops from your browser, phone or desktop. Credentials stay encrypted on your own server.',
    });
}
