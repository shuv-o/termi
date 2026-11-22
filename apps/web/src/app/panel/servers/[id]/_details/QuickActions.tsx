'use client';

import { useState, type ComponentType } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
    Check,
    Copy,
    FileCode2,
    FolderOpen,
    KeyRound,
    Lock,
    QrCode,
    Share2,
    Terminal,
    TerminalSquare,
    Waypoints,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import type { RevealField } from '@/components/auth/PasskeyRevealModal';
import { connectHref } from '@/lib/servers/connect-route';
import {
    hostPort,
    sftpCommand,
    sshAlias,
    sshCommand,
    sshConfigEntry,
    userAtHost,
    type SshTarget,
} from '@/lib/servers/commands';
import { QRConnectDialog } from './QRConnectDialog';
import { protocolIcons, type ServerInfo } from './types';

const PasskeyRevealModal = dynamic(() => import('@/components/auth/PasskeyRevealModal'), {
    ssr: false,
});
const ShareModal = dynamic(
    () => import('@/components/servers/ShareModal').then((m) => m.ShareModal),
    { ssr: false },
);
const RunOnServersDialog = dynamic(
    () => import('@/components/servers/RunOnServersDialog').then((m) => m.RunOnServersDialog),
    { ssr: false },
);

type Icon = ComponentType<{ className?: string }>;

const tileClass =
    'group flex min-w-0 items-center gap-2.5 rounded-lg border border-border bg-background/50 px-3 py-2.5 text-left transition-colors hover:border-input hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50';

function TileBody({ icon: I, label, hint }: { icon: Icon; label: string; hint?: string }) {
    return (
        <>
            <I className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-foreground" />
            <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{label}</span>
                {hint && (
                    <span className="data block truncate text-[11px] text-muted-foreground">
                        {hint}
                    </span>
                )}
            </span>
        </>
    );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section aria-label={title}>
            <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {title}
            </h3>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
        </section>
    );
}

/**
 * One-click tools for a server: open it, copy how to reach it from your own
 * terminal, copy a stored secret (after re-authenticating, audited), share it.
 */
export function QuickActions({ server }: { server: ServerInfo }) {
    const { toast } = useToast();
    const [copied, setCopied] = useState<string | null>(null);
    const [reveal, setReveal] = useState<RevealField | null>(null);
    const [showQR, setShowQR] = useState(false);
    const [showShare, setShowShare] = useState(false);
    const [showRun, setShowRun] = useState(false);

    const isSSH = server.protocol === 'SSH';
    const sshLike = isSSH || server.protocol === 'SCP';
    const ProtoIcon = protocolIcons[server.protocol];
    const target: SshTarget = {
        host: server.host,
        port: server.port,
        username: server.username,
        jump: server.jumpServer
            ? {
                  host: server.jumpServer.host,
                  port: server.jumpServer.port,
                  username: server.jumpServer.username,
              }
            : null,
    };

    const copy = async (key: string, text: string, what: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(key);
            setTimeout(() => setCopied((k) => (k === key ? null : k)), 1500);
            toast('success', `${what} copied`);
        } catch {
            toast('error', 'Could not copy — your browser blocked the clipboard');
        }
    };

    const copyTile = ({
        id,
        label,
        text,
        hint = text,
        icon = Copy,
    }: {
        id: string;
        label: string;
        text: string;
        hint?: string;
        icon?: Icon;
    }) => (
        <button
            key={id}
            type="button"
            className={tileClass}
            onClick={() => void copy(id, text, label)}
            title={text}
        >
            <TileBody icon={copied === id ? Check : icon} label={label} hint={hint} />
        </button>
    );

    const secrets: { field: RevealField; label: string; has?: boolean }[] = [
        { field: 'password', label: 'Copy password', has: server.hasPassword },
        { field: 'passphrase', label: 'Copy key passphrase', has: server.hasPassphrase },
        { field: 'privateKey', label: 'Copy private key', has: server.hasPrivateKey },
    ];
    const storedSecrets = secrets.filter((s) => s.has);

    return (
        <Card className="space-y-5 p-4">
            <Group title="Open">
                <Link href={connectHref(server.id, server.protocol)} className={tileClass}>
                    <TileBody
                        icon={isSSH ? TerminalSquare : ProtoIcon}
                        label={isSSH ? 'Open a terminal' : `Connect via ${server.protocol}`}
                        hint={isSSH ? 'New shell in a tab' : undefined}
                    />
                </Link>
                {sshLike && (
                    <Link href={connectHref(server.id, 'scp')} className={tileClass}>
                        <TileBody icon={FolderOpen} label="Browse files" hint="SFTP file manager" />
                    </Link>
                )}
                {isSSH && (
                    <button type="button" className={tileClass} onClick={() => setShowRun(true)}>
                        <TileBody
                            icon={Terminal}
                            label="Run a command"
                            hint="See the output here"
                        />
                    </button>
                )}
                {isSSH && (
                    <a href="#forwarding" className={tileClass}>
                        <TileBody
                            icon={Waypoints}
                            label="Forward a port"
                            hint="Reach a service behind it"
                        />
                    </a>
                )}
            </Group>

            <Group title="Copy to use elsewhere">
                {sshLike && copyTile({ id: 'ssh', label: 'SSH command', text: sshCommand(target) })}
                {sshLike &&
                    copyTile({ id: 'sftp', label: 'SFTP command', text: sftpCommand(target) })}
                {sshLike &&
                    copyTile({
                        id: 'config',
                        label: '~/.ssh/config entry',
                        text: sshConfigEntry(server.name, target),
                        hint: `Host ${sshAlias(server.name)}`,
                        icon: FileCode2,
                    })}
                {server.username &&
                    copyTile({
                        id: 'user',
                        label: 'User and host',
                        text: userAtHost(server.username, server.host),
                    })}
                {copyTile({
                    id: 'addr',
                    label: 'Address',
                    text: hostPort(server.host, server.port),
                })}
            </Group>

            <Group title="Secrets and sharing">
                {storedSecrets.map((s) => (
                    <button
                        key={s.field}
                        type="button"
                        className={tileClass}
                        onClick={() => setReveal(s.field)}
                    >
                        <TileBody
                            icon={s.field === 'password' ? KeyRound : Lock}
                            label={s.label}
                            hint="Asks you to confirm it's you"
                        />
                    </button>
                ))}
                <button type="button" className={tileClass} onClick={() => setShowShare(true)}>
                    <TileBody icon={Share2} label="Share" hint="Invite someone by email" />
                </button>
                <button type="button" className={tileClass} onClick={() => setShowQR(true)}>
                    <TileBody icon={QrCode} label="QR code" hint="Open it on your phone" />
                </button>
            </Group>

            {reveal && (
                <PasskeyRevealModal
                    serverId={server.id}
                    serverName={server.name}
                    field={reveal}
                    onClose={() => setReveal(null)}
                    autoCopy
                />
            )}
            {showShare && <ShareModal server={server} onClose={() => setShowShare(false)} />}
            {showRun && (
                <RunOnServersDialog
                    initialServerIds={[server.id]}
                    onClose={() => setShowRun(false)}
                />
            )}
            <QRConnectDialog
                open={showQR}
                onClose={() => setShowQR(false)}
                serverId={server.id}
                serverName={server.name}
                protocol={server.protocol}
            />
        </Card>
    );
}
