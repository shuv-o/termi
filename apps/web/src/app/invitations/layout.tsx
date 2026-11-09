import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Server invitation',
    robots: { index: false, follow: false },
};

export default function InvitationsLayout({ children }: { children: React.ReactNode }) {
    return children;
}
