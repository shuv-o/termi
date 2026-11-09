/**
 * The path one connection takes, hop by hop: the browser gets a sealed token
 * from the web app, opens the gateway with it, and the gateway dials the
 * server. Mirrors the real flow (api/connection/token → gateway /connect).
 */

const HOPS = [
    {
        from: 'Your device',
        to: 'Termi web app',
        title: 'You ask to connect',
        body: 'Your sign-in is checked, along with your access to the server. The web app decrypts the server’s credentials and seals them into a five-minute token that only the gateway can open.',
    },
    {
        from: 'Your device',
        to: 'Termi gateway',
        title: 'Your device opens the connection',
        body: 'It hands the gateway the sealed token. The browser carries the token but cannot read what is inside it.',
    },
    {
        from: 'Termi gateway',
        to: 'Your server',
        title: 'The gateway connects to the server',
        body: 'Over SSH, SFTP, RDP, VNC or Telnet, and only to the host key it expects. Every 30 seconds it checks that your access still stands.',
    },
];

export default function HowItWorks() {
    return (
        <div>
            <ol className="space-y-px overflow-hidden rounded-xl border border-border bg-border">
                {HOPS.map((hop, i) => (
                    <li
                        key={hop.title}
                        className="grid gap-4 bg-card p-5 sm:p-6 lg:grid-cols-[minmax(0,26rem)_1fr] lg:items-center lg:gap-10"
                    >
                        <div className="flex items-center gap-3 text-sm">
                            <span className="data w-5 shrink-0 text-muted-foreground">{i + 1}</span>
                            <Node label={hop.from} />
                            <span
                                aria-hidden
                                className="relative h-px min-w-6 flex-1 bg-primary/50"
                            >
                                <span className="absolute -right-px -top-[3px] h-[7px] w-[7px] rotate-45 border-r border-t border-primary/70" />
                            </span>
                            <span className="sr-only">to</span>
                            <Node label={hop.to} />
                        </div>
                        <div className="pl-8 lg:pl-0">
                            <h3 className="font-medium">{hop.title}</h3>
                            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                                {hop.body}
                            </p>
                        </div>
                    </li>
                ))}
            </ol>
            <p className="mt-5 max-w-[70ch] text-sm text-muted-foreground">
                The database only ever holds encrypted values, and the gateway has no way to reach
                it: it runs on a separate network and knows nothing until it is handed a token.
            </p>
        </div>
    );
}

function Node({ label }: { label: string }) {
    return (
        <span className="shrink-0 whitespace-nowrap rounded-md border border-border bg-background px-2.5 py-1 text-[13px]">
            {label}
        </span>
    );
}
