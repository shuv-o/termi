import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Create account',
    description: 'Create a free Termi account and open your servers from your browser in minutes.',
    alternates: { canonical: '/register' },
    robots: {
        index: false,
        follow: false,
    },
};

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
    return children;
}
