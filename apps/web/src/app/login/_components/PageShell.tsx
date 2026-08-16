'use client';

import { Globe, Shield, Terminal, Zap } from 'lucide-react';
import { Card } from '@/components/ui/card';
import TerminalLogo from '@/components/common/Logo';
import { cn } from '@/lib/utils';

/** Gradient backdrop + centred card shared by every login screen state. */
export function PageShell({
    children,
    fullWidth = false,
}: {
    children: React.ReactNode;
    fullWidth?: boolean;
}) {
    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-linear-to-br from-slate-950 via-background to-slate-950">
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/3 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
                <div className="absolute bottom-1/3 right-1/4 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl" />
            </div>
            <div className={cn('relative w-full', fullWidth ? 'max-w-3xl' : 'max-w-lg')}>
                <Card className="bg-card border-border overflow-hidden">{children}</Card>
            </div>
        </div>
    );
}

const FEATURES = [
    { icon: Terminal, text: 'Manage SSH servers from one place' },
    { icon: Shield, text: 'End-to-end encrypted credentials' },
    { icon: Zap, text: 'Instant terminal sessions' },
    { icon: Globe, text: 'Access from anywhere, securely' },
];

/** Marketing column beside the sign-in form; hidden below `md`. */
export function BrandPanel() {
    return (
        <div className="hidden md:flex flex-col justify-between w-[42%] shrink-0 bg-gradient-to-b from-primary/10 to-purple-500/10 border-r border-border p-8">
            <div>
                <div className="flex items-center gap-3 mb-8">
                    <TerminalLogo width={40} height={40} className="rounded-xl" />
                    <span className="text-xl font-bold gradient-text">Termi</span>
                </div>
                <h2 className="text-2xl font-bold leading-snug mb-2">
                    Your servers,
                    <br />
                    always within reach.
                </h2>
                <p className="text-sm text-muted-foreground mb-8">
                    A secure, modern SSH manager built for developers and teams.
                </p>
                <ul className="space-y-3">
                    {FEATURES.map(({ icon: Icon, text }) => (
                        <li
                            key={text}
                            className="flex items-center gap-3 text-sm text-muted-foreground"
                        >
                            <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 shrink-0">
                                <Icon className="w-3.5 h-3.5 text-primary" />
                            </span>
                            {text}
                        </li>
                    ))}
                </ul>
            </div>
            <p className="text-xs text-muted-foreground/50 mt-8">
                © {new Date().getFullYear()} Termi. All rights reserved.
            </p>
        </div>
    );
}

export function GoogleIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
            />
            <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
            />
            <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
            />
            <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
            />
        </svg>
    );
}
