'use client';

import Link from 'next/link';
import { Info } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { hostPort } from '@/lib/servers/commands';
import type { ServerInfo } from './types';

/** How Termi signs in to this server, in words. */
export function signInMethod(s: ServerInfo): string {
    if (s.securityKeyId) return 'Security key (FIDO2)';
    const parts: string[] = [];
    if (s.hasPrivateKey) {
        parts.push(
            s.certificate
                ? 'SSH key with certificate'
                : s.hasPassphrase
                  ? 'SSH key (with passphrase)'
                  : 'SSH key',
        );
    }
    if (s.hasPassword) parts.push('password');
    if (!parts.length) return 'Asks each time';
    const text = parts.join(', then ');
    return text.charAt(0).toUpperCase() + text.slice(1);
}

const CONNECT_FROM: Record<string, string> = {
    server: 'The Termi server',
    device: 'This computer (desktop app)',
    auto: 'This computer, else Termi',
};

const AGENT: Record<string, string> = {
    off: 'Off',
    on: 'On',
    confirm: 'Asks each time',
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="grid grid-cols-[8.5rem_1fr] gap-3 py-2 text-sm">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="min-w-0 break-words">{children}</dd>
        </div>
    );
}

/** What this server is and how it is reached, at a glance. Never shows secrets. */
export function ServerFacts({ server }: { server: ServerInfo }) {
    const sshLike = server.protocol === 'SSH' || server.protocol === 'SCP';
    return (
        <div>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground/80">
                <Info className="h-4 w-4 text-info" />
                Details
            </h2>
            <Card className="px-4 py-2">
                <dl className="divide-y divide-border/50">
                    <Row label="Address">
                        <span className="data">{hostPort(server.host, server.port)}</span>
                    </Row>
                    {server.username && (
                        <Row label="Username">
                            <span className="data">{server.username}</span>
                        </Row>
                    )}
                    <Row label="Signs in with">{signInMethod(server)}</Row>
                    {server.jumpServer && (
                        <Row label="Through">
                            <Link
                                href={`/panel/servers/${server.jumpServer.id}`}
                                className="hover:underline"
                            >
                                {server.jumpServer.name}
                            </Link>{' '}
                            <span className="data text-xs text-muted-foreground">
                                ({hostPort(server.jumpServer.host, server.jumpServer.port)})
                            </span>
                        </Row>
                    )}
                    {sshLike && server.connectFrom && (
                        <Row label="Connects from">
                            {CONNECT_FROM[server.connectFrom] ?? server.connectFrom}
                        </Row>
                    )}
                    {server.protocol === 'SSH' && server.agentForwarding && (
                        <Row label="Agent forwarding">
                            {AGENT[server.agentForwarding] ?? server.agentForwarding}
                        </Row>
                    )}
                    {server.createdAt && (
                        <Row label="Added">
                            {new Date(server.createdAt).toLocaleDateString(undefined, {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                            })}
                        </Row>
                    )}
                    {server.notes?.trim() && (
                        <Row label="Notes">
                            <span className="whitespace-pre-wrap text-foreground/85">
                                {server.notes}
                            </span>
                        </Row>
                    )}
                </dl>
            </Card>
        </div>
    );
}
