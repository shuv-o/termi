import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Unlock Encryption — Termix' };

export default function UnlockEncryptionLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
            {children}
        </div>
    );
}
