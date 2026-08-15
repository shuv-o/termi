import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Forgot Password — Termix',
};

export default function ForgotPasswordLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
            {children}
        </div>
    );
}
