'use client';

import { Card, CardContent } from '@/components/ui/card';
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
const SECTION_LABEL = 'text-[11px] font-semibold text-muted-foreground uppercase tracking-wider';

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
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                    {protocols.map((p) => {
                        const isActive = value === p.value;
                        const c = protoColors[p.value];
                        const Icon = p.icon;
                        return (
                            <button
                                key={p.value}
                                type="button"
                                onClick={() => onChange(p.value)}
                                className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border transition-all duration-150 ${
                                    isActive
                                        ? `${c.pill} ${c.ring} ring-1`
                                        : 'border-border text-muted-foreground hover:border-border/80 hover:text-foreground hover:bg-accent/30'
                                }`}
                            >
                                <Icon className="w-4 h-4" />
                                <span className="text-xs font-semibold">{p.label}</span>
                                <span className="text-[10px] opacity-60 hidden sm:block leading-none">
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
                        Name <span className="text-red-400">*</span>
                    </Label>
                    <Input
                        type="text"
                        value={form.name}
                        onChange={(e) => update({ name: e.target.value })}
                        className="bg-secondary border-border text-sm h-9"
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
                        <SelectTrigger className="bg-secondary border-border text-sm h-9">
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
                            Host / IP <span className="text-red-400">*</span>
                        </Label>
                        <Input
                            type="text"
                            value={form.host}
                            onChange={(e) => {
                                update({ host: e.target.value });
                                onConnectionFieldChange();
                            }}
                            className="bg-secondary border-border text-sm h-9 font-mono"
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
                            className="bg-secondary border-border text-sm h-9 font-mono"
                            min={1}
                            max={65535}
                            required
                        />
                    </div>
                </div>
                <div className="space-y-1.5">
                    <Label className="text-xs">
                        Username <span className="text-red-400">*</span>
                    </Label>
                    <Input
                        type="text"
                        value={form.username}
                        onChange={(e) => update({ username: e.target.value })}
                        className="bg-secondary border-border text-sm h-9"
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
                <p className={SECTION_LABEL}>Display Settings</p>
                <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1.5">
                        <Label className="text-xs">Width (px)</Label>
                        <Input
                            type="number"
                            value={form.displayWidth}
                            onChange={(e) =>
                                update({ displayWidth: parseInt(e.target.value) || 1920 })
                            }
                            className="bg-secondary border-border text-sm h-9 font-mono"
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
                            className="bg-secondary border-border text-sm h-9 font-mono"
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
                            className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-colors ${
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
                        <Label className="text-xs">Security Mode</Label>
                        <Select
                            value={form.rdpSecurity}
                            onValueChange={(v) => update({ rdpSecurity: v as RdpSecurity })}
                        >
                            <SelectTrigger className="bg-secondary border-border text-sm h-9">
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
