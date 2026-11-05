'use client';

import { useState } from 'react';
import {
    AlertTriangle,
    CheckCircle2,
    Circle,
    KeyRound,
    Loader2,
    MinusCircle,
    ShieldCheck,
    XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import PasskeyRevealModal from '@/components/auth/PasskeyRevealModal';
import type { HardenEvent, StepStatus } from '@/lib/services/hardening/harden.service';
import { RISKY_PORTS, type SecurityReport } from '@/lib/services/hardening/evaluate';
import { cn } from '@/lib/utils';

type Done = Extract<HardenEvent, { type: 'done' }>;
interface StepRow {
    id: string;
    status: StepStatus;
    label: string;
}

const STEP_ICON: Record<StepStatus, typeof CheckCircle2> = {
    running: Loader2,
    done: CheckCircle2,
    warning: AlertTriangle,
    failed: XCircle,
    skipped: MinusCircle,
};
const STEP_TONE: Record<StepStatus, string> = {
    running: 'text-primary animate-spin',
    done: 'text-success',
    warning: 'text-warning',
    failed: 'text-danger',
    skipped: 'text-muted-foreground',
};

function OptionRow({
    id,
    title,
    hint,
    checked,
    onChange,
    disabled,
    children,
}: {
    id: string;
    title: string;
    hint: string;
    checked: boolean;
    onChange: (v: boolean) => void;
    disabled?: boolean;
    children?: React.ReactNode;
}) {
    return (
        <div className="py-3">
            <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                    <Label htmlFor={id} className="text-sm">
                        {title}
                    </Label>
                    <p className="mt-1 text-xs leading-snug text-muted-foreground">{hint}</p>
                </div>
                <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} />
            </div>
            {checked && children}
        </div>
    );
}

/**
 * "Secure this server": the options, then live progress, then the outcome.
 * The two choices that change how people log in afterwards — a dedicated
 * admin user, and turning password logins off — are the user's to make.
 */
export function HardenDialog({
    serverId,
    serverName,
    report,
    open,
    onOpenChange,
    onFinished,
}: {
    serverId: string;
    serverName: string;
    report: SecurityReport;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Called after a run ends, so the page can refresh and re-scan. */
    onFinished: (ok: boolean) => void;
}) {
    const loggedInAsRoot = report.loginUser === 'root';
    const [createUser, setCreateUser] = useState(loggedInAsRoot);
    const [newUsername, setNewUsername] = useState('termi-admin');
    const [disablePasswords, setDisablePasswords] = useState(true);
    const [rotatePassword, setRotatePassword] = useState(true);
    // Root login: off by default when Termi has its own admin user; when
    // Termi itself logs in as root, "off" would lock it out, so it is not offered.
    const [rootLoginChoice, setRootLogin] = useState<'no' | 'key' | 'password'>('no');
    const termiIsRoot = loggedInAsRoot && !createUser;
    const rootLogin =
        termiIsRoot && rootLoginChoice === 'no'
            ? 'key'
            : disablePasswords && rootLoginChoice === 'password'
              ? 'key'
              : rootLoginChoice;
    const [fail2ban, setFail2ban] = useState(true);
    const [autoUpdates, setAutoUpdates] = useState(true);
    const [extraKey, setExtraKey] = useState('');

    // Phase 3 — both opt-in, both can cut off access, so both are off by default.
    const publicPorts = [
        ...new Map(
            report.ports
                .filter((p) => p.public && p.port !== report.sshPort)
                .map((p) => [p.port, p] as const),
        ).values(),
    ];
    const [firewall, setFirewall] = useState(false);
    const [allowed, setAllowed] = useState<Set<number>>(
        () => new Set(publicPorts.filter((p) => !RISKY_PORTS[p.port]).map((p) => p.port)),
    );
    const [customPort, setCustomPort] = useState('');
    const [movePort, setMovePort] = useState(false);
    const used = new Set(report.ports.map((p) => p.port));
    const [newPort, setNewPort] = useState(() => {
        for (;;) {
            const p = 20000 + Math.floor(Math.random() * 40000);
            if (!used.has(p)) return String(p);
        }
    });
    const newPortNum = Number(newPort);
    const newPortValid =
        Number.isInteger(newPortNum) &&
        newPortNum >= 1024 &&
        newPortNum <= 65535 &&
        newPortNum !== report.sshPort &&
        !used.has(newPortNum);
    const firewallManaged = report.firewall === 'ufw' || report.firewall === 'firewalld';
    const firewallForeign = report.firewall === 'nftables' || report.firewall === 'iptables';

    const [running, setRunning] = useState(false);
    const [steps, setSteps] = useState<StepRow[]>([]);
    const [result, setResult] = useState<Done | null>(null);
    const [showKey, setShowKey] = useState(false);

    const usernameValid = /^[a-z_][a-z0-9_-]{0,31}$/.test(newUsername) && newUsername !== 'root';
    const canStart = !running && (!createUser || usernameValid) && (!movePort || newPortValid);
    const started = running || result !== null;

    const apply = async () => {
        setRunning(true);
        setSteps([]);
        setResult(null);
        try {
            const res = await fetch(`/api/servers/${serverId}/harden`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    createUser,
                    newUsername: createUser ? newUsername : undefined,
                    disablePasswordLogin: disablePasswords,
                    rotatePassword: createUser || rotatePassword,
                    fail2ban,
                    autoUpdates,
                    extraPublicKey: extraKey.trim() || undefined,
                    firewall,
                    allowPorts: firewall ? [...allowed] : [],
                    newPort: movePort ? newPortNum : null,
                    rootLogin,
                }),
            });
            if (!res.ok || !res.body) {
                const json = await res.json().catch(() => null);
                setResult({
                    type: 'done',
                    ok: false,
                    outcome: 'failed',
                    message: json?.error || 'Could not start. Nothing was changed.',
                });
                return;
            }
            // Buffer across chunks: an event can arrive split in two.
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            for (;;) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const parts = buffer.split('\n\n');
                buffer = parts.pop() ?? '';
                for (const part of parts) {
                    if (!part.startsWith('data: ')) continue;
                    const event = JSON.parse(part.slice(6)) as HardenEvent;
                    if (event.type === 'done') {
                        setResult(event);
                    } else {
                        setSteps((prev) => {
                            const i = prev.findIndex((s) => s.id === event.id);
                            const row = { id: event.id, status: event.status, label: event.label };
                            if (i < 0) return [...prev, row];
                            const next = [...prev];
                            next[i] = row;
                            return next;
                        });
                    }
                }
            }
        } catch {
            setResult({
                type: 'done',
                ok: false,
                outcome: 'rollback-pending',
                message:
                    'Lost the connection to Termi. The run continues on the server: if it could not finish, the server restores its previous settings within 5 minutes.',
            });
        } finally {
            setRunning(false);
        }
    };

    const close = (next: boolean) => {
        if (running) return; // never abandon a run from the UI
        if (!next && result) onFinished(result.ok);
        onOpenChange(next);
        if (!next) {
            setSteps([]);
            setResult(null);
        }
    };

    return (
        <>
            <Dialog open={open} onOpenChange={close}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <ShieldCheck className="h-5 w-5 text-primary" />
                            Secure {serverName}
                        </DialogTitle>
                        <DialogDescription>
                            Before changing anything, Termi arms an automatic rollback on the
                            server. It only switches to the new login after proving it works —
                            otherwise everything is restored.
                        </DialogDescription>
                    </DialogHeader>

                    {!started ? (
                        <div className="-my-1 divide-y divide-border">
                            <div className="pb-3">
                                <p className="text-xs text-muted-foreground">Always applied</p>
                                <ul className="mt-1.5 space-y-1 text-[13px] text-foreground/85">
                                    <li>A new SSH key that only Termi holds</li>
                                    <li>3 login tries per connection, 30-second login timeout</li>
                                    <li>No empty passwords, no X11 forwarding</li>
                                </ul>
                            </div>

                            <OptionRow
                                id="harden-user"
                                title="Create a dedicated admin user"
                                hint={
                                    loggedInAsRoot
                                        ? 'Recommended. Termi will log in as this user and use sudo, instead of logging in as root.'
                                        : `Termi will log in as a new sudo user instead of ${report.loginUser}.`
                                }
                                checked={createUser}
                                onChange={setCreateUser}
                            >
                                <div className="mt-2.5">
                                    <Input
                                        value={newUsername}
                                        onChange={(e) => setNewUsername(e.target.value.trim())}
                                        aria-label="Username for the admin user"
                                        aria-invalid={!usernameValid || undefined}
                                        className="data"
                                        autoCapitalize="off"
                                        autoCorrect="off"
                                        spellCheck={false}
                                    />
                                    {!usernameValid && (
                                        <p className="mt-1 text-xs text-danger">
                                            Lowercase letters, digits, - and _; start with a letter.
                                        </p>
                                    )}
                                </div>
                            </OptionRow>

                            <div className="py-3">
                                <p className="text-sm font-medium">Root login over SSH</p>
                                <p className="mt-1 text-xs leading-snug text-muted-foreground">
                                    root is the first account attackers try. Allow it only if you
                                    need to log in as root directly.
                                </p>
                                <div
                                    role="radiogroup"
                                    aria-label="Root login over SSH"
                                    className="mt-2.5 grid grid-cols-3 gap-1 rounded-md border border-input p-0.5"
                                >
                                    {(
                                        [
                                            ['no', 'Off', termiIsRoot],
                                            ['key', 'Key only', false],
                                            ['password', 'Password too', disablePasswords],
                                        ] as const
                                    ).map(([value, label, disabled]) => (
                                        <button
                                            key={value}
                                            type="button"
                                            role="radio"
                                            aria-checked={rootLogin === value}
                                            disabled={disabled}
                                            onClick={() => setRootLogin(value)}
                                            className={cn(
                                                'h-9 rounded-[5px] px-2 text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 sm:h-8',
                                                rootLogin === value
                                                    ? 'bg-accent text-foreground'
                                                    : 'text-muted-foreground hover:text-foreground',
                                            )}
                                        >
                                            {label}
                                        </button>
                                    ))}
                                </div>
                                <p className="mt-1.5 text-xs text-muted-foreground">
                                    {termiIsRoot
                                        ? 'Termi logs in as root, so root login stays on. Create an admin user above to turn it off.'
                                        : rootLogin === 'key'
                                          ? "root can log in only with a key already in root's authorized_keys."
                                          : rootLogin === 'password'
                                            ? 'root keeps its current password. If it is a provider default, change it.'
                                            : 'Use sudo from your admin user instead.'}
                                    {disablePasswords &&
                                        ' "Password too" needs password logins left on.'}
                                </p>
                            </div>

                            <OptionRow
                                id="harden-passwords"
                                title="Turn off password logins"
                                hint="Only SSH keys can log in, so passwords can no longer be guessed. Add your own public key below to keep a way in outside Termi."
                                checked={disablePasswords}
                                onChange={setDisablePasswords}
                            />

                            {!createUser && (
                                <OptionRow
                                    id="harden-rotate"
                                    title={`New password for ${report.loginUser}`}
                                    hint="Replaces the current (possibly default) password with a strong random one, saved in Termi."
                                    checked={rotatePassword}
                                    onChange={setRotatePassword}
                                />
                            )}

                            <OptionRow
                                id="harden-f2b"
                                title="Brute-force protection"
                                hint="Installs fail2ban and bans addresses that keep failing to log in. Termi's own address is never banned."
                                checked={fail2ban}
                                onChange={setFail2ban}
                            />

                            <OptionRow
                                id="harden-updates"
                                title="Automatic security updates"
                                hint="Security fixes install on their own, every day."
                                checked={autoUpdates}
                                onChange={setAutoUpdates}
                            />

                            <OptionRow
                                id="harden-firewall"
                                title={firewallManaged ? 'Firewall rules' : 'Turn on the firewall'}
                                hint={
                                    firewallForeign
                                        ? `A hand-made ${report.firewall} firewall is already active, so Termi will not manage it.`
                                        : firewallManaged
                                          ? `${report.firewall} is already on. Termi keeps SSH and the ports below open, and blocks everything else.`
                                          : 'Blocks every incoming connection except SSH and the ports you keep open below.'
                                }
                                checked={firewall}
                                onChange={setFirewall}
                                disabled={firewallForeign}
                            >
                                <div className="mt-2.5 space-y-1.5">
                                    <p className="text-xs text-muted-foreground">
                                        SSH (port{' '}
                                        {movePort && newPortValid ? newPort : report.sshPort})
                                        always stays open.
                                    </p>
                                    {[
                                        ...publicPorts.map((p) => p.port),
                                        ...[...allowed].filter(
                                            (p) => !publicPorts.some((x) => x.port === p),
                                        ),
                                    ].map((port) => {
                                        const info = publicPorts.find((p) => p.port === port);
                                        const risky = RISKY_PORTS[port];
                                        return (
                                            <label
                                                key={port}
                                                className="flex min-h-9 cursor-pointer items-center gap-2.5 text-sm"
                                            >
                                                <Checkbox
                                                    checked={allowed.has(port)}
                                                    onCheckedChange={(v) =>
                                                        setAllowed((prev) => {
                                                            const next = new Set(prev);
                                                            if (v) next.add(port);
                                                            else next.delete(port);
                                                            return next;
                                                        })
                                                    }
                                                />
                                                <span className="data">{port}</span>
                                                <span className="truncate text-muted-foreground">
                                                    {risky ?? info?.process ?? 'custom'}
                                                </span>
                                                {risky && (
                                                    <span className="ml-auto shrink-0 text-[11px] text-warning">
                                                        usually should not be public
                                                    </span>
                                                )}
                                            </label>
                                        );
                                    })}
                                    <div className="flex gap-2 pt-1">
                                        <Input
                                            value={customPort}
                                            onChange={(e) =>
                                                setCustomPort(e.target.value.replace(/\D/g, ''))
                                            }
                                            placeholder="Another port, e.g. 443"
                                            inputMode="numeric"
                                            aria-label="Port to keep open"
                                            className="data"
                                        />
                                        <Button
                                            variant="outline"
                                            disabled={
                                                !(
                                                    Number(customPort) >= 1 &&
                                                    Number(customPort) <= 65535
                                                )
                                            }
                                            onClick={() => {
                                                setAllowed((prev) =>
                                                    new Set(prev).add(Number(customPort)),
                                                );
                                                setCustomPort('');
                                            }}
                                        >
                                            Keep open
                                        </Button>
                                    </div>
                                    {report.os.family === 'debian' && (
                                        <p className="text-xs text-muted-foreground">
                                            Ports published by Docker containers bypass ufw and are
                                            not affected.
                                        </p>
                                    )}
                                </div>
                            </OptionRow>

                            <OptionRow
                                id="harden-port"
                                title="Move SSH to another port"
                                hint={`Cuts the automated login attempts that hammer port ${report.sshPort}. sshd listens on both ports until Termi has logged in on the new one, and the server's own firewall (ufw, firewalld, nftables or iptables) is opened for it and kept open across reboots. If your provider has its own firewall (AWS, GCP, Azure…), allow the new port there first — otherwise Termi cannot reach it and rolls everything back.`}
                                checked={movePort}
                                onChange={setMovePort}
                            >
                                <div className="mt-2.5">
                                    <Input
                                        value={newPort}
                                        onChange={(e) =>
                                            setNewPort(e.target.value.replace(/\D/g, ''))
                                        }
                                        inputMode="numeric"
                                        aria-label="New SSH port"
                                        aria-invalid={!newPortValid || undefined}
                                        className="data"
                                    />
                                    {!newPortValid && (
                                        <p className="mt-1 text-xs text-danger">
                                            Pick a free port between 1024 and 65535.
                                        </p>
                                    )}
                                </div>
                            </OptionRow>

                            <div className="pt-3">
                                <Label htmlFor="harden-key" className="text-sm">
                                    Your public key{' '}
                                    <span className="font-normal text-muted-foreground">
                                        (optional)
                                    </span>
                                </Label>
                                <Textarea
                                    id="harden-key"
                                    value={extraKey}
                                    onChange={(e) => setExtraKey(e.target.value)}
                                    placeholder="ssh-ed25519 AAAA… you@laptop"
                                    className="data mt-1.5 min-h-[64px] text-xs"
                                    spellCheck={false}
                                />
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <ul className="space-y-1.5" aria-live="polite">
                                {steps.map((s) => {
                                    const Icon = STEP_ICON[s.status];
                                    return (
                                        <li key={s.id} className="flex items-start gap-2.5 text-sm">
                                            <Icon
                                                className={cn(
                                                    'mt-0.5 h-4 w-4 shrink-0',
                                                    STEP_TONE[s.status],
                                                )}
                                            />
                                            <span
                                                className={
                                                    s.status === 'running'
                                                        ? 'text-foreground'
                                                        : 'text-foreground/85'
                                                }
                                            >
                                                {s.label}
                                            </span>
                                        </li>
                                    );
                                })}
                                {running && steps.length === 0 && (
                                    <li className="flex items-center gap-2.5 text-sm text-muted-foreground">
                                        <Circle className="h-4 w-4" /> Starting…
                                    </li>
                                )}
                            </ul>

                            {result && (
                                <div
                                    className={cn(
                                        'rounded-lg border p-3 text-sm',
                                        result.ok
                                            ? 'border-success/25 bg-success/5 text-foreground'
                                            : result.outcome === 'rollback-pending'
                                              ? 'border-warning/30 bg-warning/5 text-foreground'
                                              : 'border-danger/25 bg-danger/5 text-foreground',
                                    )}
                                >
                                    {result.message}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Pinned, so the action stays reachable while the options scroll. */}
                    <DialogFooter className="sticky -bottom-6 z-10 -mx-5 -mb-5 border-t border-border bg-card px-5 py-3 sm:-mx-6 sm:-mb-6 sm:px-6">
                        {!started ? (
                            <>
                                <Button variant="outline" onClick={() => close(false)}>
                                    Cancel
                                </Button>
                                <Button onClick={apply} disabled={!canStart}>
                                    <ShieldCheck /> Secure server
                                </Button>
                            </>
                        ) : running ? (
                            <Button disabled>
                                <Loader2 className="animate-spin" /> Securing… keep this open
                            </Button>
                        ) : (
                            <>
                                {result?.ok && (
                                    <Button variant="outline" onClick={() => setShowKey(true)}>
                                        <KeyRound /> Copy private key
                                    </Button>
                                )}
                                <Button onClick={() => close(false)}>
                                    {result?.ok ? 'Done' : 'Close'}
                                </Button>
                            </>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {showKey && (
                <PasskeyRevealModal
                    serverId={serverId}
                    serverName={serverName}
                    field="privateKey"
                    onClose={() => setShowKey(false)}
                />
            )}
        </>
    );
}
