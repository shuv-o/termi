'use client';

import { Waypoints } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useCachedFetch } from '@/lib/hooks/useCachedFetch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    protoColors,
    protocols,
    type Group,
    type ProtocolValue,
    type RdpSecurity,
    type ServerFormValues,
} from './types';

const CARD_CLASS = 'border-border hover:border-border/80 transition-all duration-200';
const SECTION_LABEL = 'text-xs font-medium text-muted-foreground';

export function ProtocolSelector({
    value,
    onChange,
}: {
    value: ProtocolValue;
    onChange: (p: ProtocolValue) => void;
}) {
    return (
        <Card className={CARD_CLASS}>
            <CardContent className="p-4">
                <p className={`${SECTION_LABEL} mb-3`}>Protocol</p>
                {/* Below `sm`, a 3-per-row grid leaves an awkward 3+2 last row, so
                    it scrolls horizontally as a single strip instead; `sm:` and up
                    have the room for a clean 5-across grid. */}
                <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:grid sm:grid-cols-5 sm:overflow-visible sm:px-0 sm:pb-0">
                    {protocols.map((p) => {
                        const isActive = value === p.value;
                        const c = protoColors[p.value];
                        const Icon = p.icon;
                        return (
                            <button
                                key={p.value}
                                type="button"
                                onClick={() => onChange(p.value)}
                                className={`flex w-[84px] shrink-0 flex-col items-center gap-1.5 p-3 rounded-lg border transition-all duration-150 sm:w-auto ${
                                    isActive
                                        ? `${c.pill} ${c.ring} ring-1`
                                        : 'border-border text-muted-foreground hover:border-border/80 hover:text-foreground hover:bg-accent/30'
                                }`}
                            >
                                <Icon className="w-4 h-4" />
                                <span className="text-xs font-semibold">{p.label}</span>
                                <span className="text-[11px] opacity-60 hidden sm:block leading-none">
                                    {p.desc}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </CardContent>
        </Card>
    );
}

/** Name, group, host, port and username. */
export function IdentityCard({
    form,
    update,
    groups,
    onConnectionFieldChange,
}: {
    form: ServerFormValues;
    update: (fields: Partial<ServerFormValues>) => void;
    groups: Group[];
    /** Invalidates a previous connection test whenever host/port change. */
    onConnectionFieldChange: () => void;
}) {
    return (
        <Card className={`divide-y divide-border ${CARD_CLASS}`}>
            <div className="grid gap-3 p-4 md:grid-cols-2">
                <div className="space-y-1.5">
                    <Label className="text-xs">
                        Name <span className="text-danger">*</span>
                    </Label>
                    <Input
                        type="text"
                        value={form.name}
                        onChange={(e) => update({ name: e.target.value })}
                       
                        placeholder="Production Web"
                        required
                    />
                </div>
                <div className="space-y-1.5">
                    <Label className="text-xs">
                        Group <span className="text-muted-foreground/50">(optional)</span>
                    </Label>
                    <Select
                        value={form.groupId || 'none'}
                        onValueChange={(v) => update({ groupId: v === 'none' ? '' : v })}
                    >
                        <SelectTrigger className="text-sm h-9">
                            <SelectValue placeholder="No group" />
                        </SelectTrigger>
                        <SelectContent className="bg-card border-border">
                            <SelectItem value="none">No group</SelectItem>
                            {groups.map((g) => (
                                <SelectItem key={g.id} value={g.id}>
                                    {g.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <div className="p-4 space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="col-span-2 space-y-1.5">
                        <Label className="text-xs">
                            Host / IP <span className="text-danger">*</span>
                        </Label>
                        <Input
                            type="text"
                            value={form.host}
                            onChange={(e) => {
                                update({ host: e.target.value });
                                onConnectionFieldChange();
                            }}
                            className="font-mono"
                            placeholder="192.168.1.100"
                            required
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs">Port</Label>
                        <Input
                            type="number"
                            value={form.port}
                            onChange={(e) => {
                                update({ port: parseInt(e.target.value) || 0 });
                                onConnectionFieldChange();
                            }}
                            className="font-mono"
                            min={1}
                            max={65535}
                            required
                        />
                    </div>
                </div>
                <div className="space-y-1.5">
                    <Label className="text-xs">
                        Username <span className="text-danger">*</span>
                    </Label>
                    <Input
                        type="text"
                        value={form.username}
                        onChange={(e) => update({ username: e.target.value })}
                       
                        placeholder="root"
                        required
                    />
                </div>
            </div>
        </Card>
    );
}

const RESOLUTION_PRESETS: [number, number, string][] = [
    [1280, 720, 'HD'],
    [1920, 1080, 'FHD'],
    [2560, 1440, '2K'],
    [3840, 2160, '4K'],
];

/** Resolution and RDP security mode — only relevant for RDP and VNC. */
export function DisplaySettingsCard({
    form,
    update,
}: {
    form: ServerFormValues;
    update: (fields: Partial<ServerFormValues>) => void;
}) {
    if (form.protocol !== 'RDP' && form.protocol !== 'VNC') return null;

    return (
        <Card className={CARD_CLASS}>
            <CardContent className="p-4 space-y-3">
                <p className={SECTION_LABEL}>Display settings</p>
                <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1.5">
                        <Label className="text-xs">Width (px)</Label>
                        <Input
                            type="number"
                            value={form.displayWidth}
                            onChange={(e) =>
                                update({ displayWidth: parseInt(e.target.value) || 1920 })
                            }
                            className="font-mono"
                            min={640}
                            max={7680}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs">Height (px)</Label>
                        <Input
                            type="number"
                            value={form.displayHeight}
                            onChange={(e) =>
                                update({ displayHeight: parseInt(e.target.value) || 1080 })
                            }
                            className="font-mono"
                            min={480}
                            max={4320}
                        />
                    </div>
                </div>
                <div className="flex gap-1.5 flex-wrap">
                    {RESOLUTION_PRESETS.map(([w, h, label]) => (
                        <button
                            key={label}
                            type="button"
                            onClick={() => update({ displayWidth: w, displayHeight: h })}
                            className={`px-2 py-0.5 rounded-sm text-[11px] font-medium border transition-colors ${
                                form.displayWidth === w && form.displayHeight === h
                                    ? 'bg-primary/15 text-primary border-primary/30'
                                    : 'border-border text-muted-foreground hover:text-foreground hover:bg-accent/30'
                            }`}
                        >
                            {label}
                        </button>
                    ))}
                </div>
                {form.protocol === 'RDP' && (
                    <div className="space-y-1.5">
                        <Label className="text-xs">Security mode</Label>
                        <Select
                            value={form.rdpSecurity}
                            onValueChange={(v) => update({ rdpSecurity: v as RdpSecurity })}
                        >
                            <SelectTrigger className="text-sm h-9">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-card border-border">
                                <SelectItem value="any">Any (auto-negotiate)</SelectItem>
                                <SelectItem value="rdp">RDP (classic, most compatible)</SelectItem>
                                <SelectItem value="nla">NLA (Network Level Auth)</SelectItem>
                                <SelectItem value="tls">TLS only</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

const NO_JUMP = '__direct__';

/**
 * "Connect through" — pick one of the user's SSH servers as a jump host
 * (bastion), like `ssh -J`. Only SSH servers that are themselves reached
 * directly are offered, since only one hop is supported.
 */
export function JumpHostCard({
    form,
    update,
    selfId,
    onConnectionFieldChange,
}: {
    form: ServerFormValues;
    update: (patch: Partial<ServerFormValues>) => void;
    /** The server being edited, so it is not offered as its own jump host. */
    selfId?: string;
    onConnectionFieldChange: () => void;
}) {
    const { data } = useCachedFetch<{
        servers: { id: string; name: string; protocol: string; host: string; jumpServerId: string | null }[];
    }>('/api/servers');
    const candidates = (data?.servers ?? []).filter(
        (s) => s.protocol === 'SSH' && s.id !== selfId && !s.jumpServerId,
    );
    const selected = candidates.find((s) => s.id === form.jumpServerId);

    return (
        <Card className={CARD_CLASS}>
            <CardContent className="space-y-3 p-4">
                <div className="flex items-start gap-3">
                    <Waypoints className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                        <p className="text-sm font-medium">Connect through</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                            Reach a server on a private network via a bastion you have already
                            added. Its credentials are used for the first hop.
                        </p>
                    </div>
                </div>
                <Select
                    value={form.jumpServerId || NO_JUMP}
                    onValueChange={(v) => {
                        update({ jumpServerId: v === NO_JUMP ? '' : v });
                        onConnectionFieldChange();
                    }}
                >
                    <SelectTrigger aria-label="Jump host">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value={NO_JUMP}>Direct connection</SelectItem>
                        {candidates.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                                {s.name}
                                <span className="data ml-2 text-xs text-muted-foreground">
                                    {s.host}
                                </span>
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                {selected && (form.protocol === 'RDP' || form.protocol === 'VNC') && (
                    <p className="text-xs text-muted-foreground">
                        {form.protocol} through a jump host needs the gateway&apos;s{' '}
                        <code className="data">GUACD_TUNNEL_HOST</code> setting.
                    </p>
                )}
                {selected ? (
                    <p className="data text-xs text-muted-foreground">
                        Like <span className="text-foreground/85">ssh -J {selected.host}</span>.
                        The host above is dialed from {selected.name}, so a private address such as
                        10.0.0.5 is fine.
                    </p>
                ) : (
                    candidates.length === 0 && (
                        <p className="text-xs text-muted-foreground">
                            Add the bastion as an SSH server first, then pick it here.
                        </p>
                    )
                )}
            </CardContent>
        </Card>
    );
}
