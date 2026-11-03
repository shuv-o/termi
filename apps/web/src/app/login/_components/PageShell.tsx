'use client';

import { Card } from '@/components/ui/card';
import TerminalLogo from '@/components/common/Logo';
import { cn } from '@/lib/utils';

/** Plain ink ground + centred card shared by every login screen state. */
export function PageShell({
    children,
    fullWidth = false,
}: {
    children: React.ReactNode;
    fullWidth?: boolean;
}) {
    return (
        <div
            className="flex min-h-dvh items-center justify-center bg-background px-4 py-8"
            style={{
                paddingTop: 'max(2rem, env(safe-area-inset-top, 0px))',
                paddingBottom: 'max(2rem, env(safe-area-inset-bottom, 0px))',
            }}
        >
            <div className={cn('w-full', fullWidth ? 'max-w-3xl' : 'max-w-md')}>
                <Card className="overflow-hidden">{children}</Card>
            </div>
        </div>
    );
}

/** A few lines of what Termi actually looks like in use. */
const TRANSCRIPT: { host: string; state: 'online' | 'offline'; note: string }[] = [
    { host: 'web-01', state: 'online', note: '14 ms' },
    { host: 'db-primary', state: 'online', note: '9 ms' },
    { host: 'build-runner', state: 'offline', note: 'offline' },
    { host: 'win-desktop', state: 'online', note: 'RDP' },
];

/** Brand column beside the sign-in form; hidden below `md`. */
export function BrandPanel() {
    return (
        <div className="hidden w-[44%] shrink-0 flex-col justify-between border-r border-border bg-background/50 p-8 md:flex">
            <div>
                <div className="mb-10 flex items-center gap-2.5">
                    <TerminalLogo width={28} height={28} className="rounded-md" />
                    <span className="text-[15px] font-semibold">Termi</span>
                </div>
                <h2 className="text-[26px] font-semibold leading-[1.15] tracking-[-0.02em]">
                    Your servers,
                    <br />
                    one tap away
                    <span aria-hidden className="cursor-block" />
                </h2>
                <p className="mt-3 max-w-[30ch] text-sm text-muted-foreground">
                    SSH, RDP, VNC and file transfer from any browser, with credentials encrypted
                    before they are stored.
                </p>
            </div>

            <div
                aria-hidden
                className="data mt-10 rounded-lg border border-border bg-[var(--terminal-bg)] p-4 text-[12px] leading-6"
            >
                <p className="text-muted-foreground">
                    <span className="text-primary">$</span> termi status
                </p>
                {TRANSCRIPT.map((row) => (
                    <p key={row.host} className="flex items-center gap-2">
                        <span
                            className={`h-1.5 w-1.5 shrink-0 rounded-full ${row.state === 'online' ? 'bg-success' : 'bg-danger'}`}
                        />
                        <span className="flex-1 text-foreground/90">{row.host}</span>
                        <span
                            className={row.state === 'online' ? 'text-muted-foreground' : 'text-danger'}
                        >
                            {row.note}
                        </span>
                    </p>
                ))}
            </div>
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
