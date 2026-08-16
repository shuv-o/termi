import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Set Up Encryption — Termi' };

export default function SetupEncryptionLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
            {children}
        </div>
    );
}
