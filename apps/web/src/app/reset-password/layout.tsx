import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Reset Password — Termi',
};

export default function ResetPasswordLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
            {children}
        </div>
    );
}
