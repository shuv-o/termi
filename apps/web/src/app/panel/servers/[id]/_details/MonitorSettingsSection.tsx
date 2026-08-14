'use client';

import {
    AlertTriangle,
    Bell,
    BellRing,
    CheckCircle2,
    Clock,
    Loader2,
    Mail,
    Webhook,
    WifiOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { formatRelativeTime } from '@/lib/format';
import {
    INTERVALS,
    WEBHOOK_PLATFORMS,
    type MonitorConfig,
    type MonitorFormValues,
} from './types';

function AlertChannel({
    icon: Icon,
    title,
    description,
    checked,
    enabled,
    onChange,
}: {
    icon: React.ElementType;
    title: string;
    description: string;
    checked: boolean;
    enabled: boolean;
    onChange: (v: boolean) => void;
}) {
    return (
        <div
            className={`flex items-center justify-between rounded-lg px-3 py-2.5 border transition-colors ${
                checked && enabled
                    ? 'bg-primary/8 border-primary/30'
                    : 'border-border/60 bg-transparent'
            } ${!enabled ? 'opacity-50' : ''}`}
        >
            <div className="flex items-center gap-2.5">
                <Icon className="w-4 h-4 text-muted-foreground" />
                <div>
                    <p className="text-sm font-medium">{title}</p>
                    <p className="text-xs text-muted-foreground">{description}</p>
                </div>
            </div>
            <Checkbox
                checked={checked}
                disabled={!enabled}
                onCheckedChange={(c) => onChange(!!c)}
            />
        </div>
    );
}

/** Live banner describing the monitor's current verdict. */
function MonitorStatusBanner({ config }: { config: MonitorConfig }) {
    return (
        <div className="px-4 py-3 bg-secondary/40">
            <div className="flex items-center gap-3 text-xs">
                {config.alertSent ? (
                    <>
                        <WifiOff className="w-4 h-4 text-red-400 shrink-0" />
                        <div>
                            <span className="text-red-400 font-medium">
                                Server is currently DOWN
                            </span>
                            <span className="text-muted-foreground ml-1.5">— alert was sent</span>
                        </div>
                    </>
                ) : config.consecutiveFailures > 0 ? (
                    <>
                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                        <span className="text-amber-400">
                            {config.consecutiveFailures} failure
                            {config.consecutiveFailures !== 1 ? 's' : ''} —
                            {config.failureThreshold - config.consecutiveFailures} more before alert
                        </span>
                    </>
                ) : (
                    <>
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span className="text-emerald-400">Server is healthy</span>
                    </>
                )}
                {config.lastCheckedAt && (
                    <span className="ml-auto text-muted-foreground/40">
                        Last checked {formatRelativeTime(config.lastCheckedAt)}
                    </span>
                )}
            </div>
        </div>
    );
}

export function MonitorSettingsSection({
    form,
    setForm,
    monitorConfig,
    saving,
    onSave,
}: {
    form: MonitorFormValues;
    setForm: React.Dispatch<React.SetStateAction<MonitorFormValues>>;
    monitorConfig: MonitorConfig | null;
    saving: boolean;
    onSave: () => void;
}) {
    return (
        <div>
            <h2 className="text-sm font-semibold text-foreground/80 flex items-center gap-2 mb-3">
                <Bell className="w-4 h-4 text-amber-400" />
                Monitoring &amp; Alerts
            </h2>

            <Card className="divide-y divide-border/50">
                <div className="p-4 flex items-center justify-between">
                    <div>
                        <p className="text-sm font-medium">Enable Monitoring</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            Periodically check if this server is reachable
                        </p>
                    </div>
                    <Switch
                        checked={form.enabled}
                        onCheckedChange={(checked) => setForm((f) => ({ ...f, enabled: checked }))}
                    />
                </div>

                <div className="p-4">
                    <div className="mb-2">
                        <p className="text-sm font-medium flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                            Check Interval
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            How often to ping the server
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                        {INTERVALS.map((opt) => (
                            <button
                                key={opt.value}
                                onClick={() =>
                                    setForm((f) => ({ ...f, checkIntervalMinutes: opt.value }))
                                }
                                disabled={!form.enabled}
                                className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                                    form.checkIntervalMinutes === opt.value && form.enabled
                                        ? 'bg-primary/15 border-primary/40 text-primary'
                                        : !form.enabled
                                          ? 'border-border text-muted-foreground/30 cursor-not-allowed'
                                          : 'border-border text-muted-foreground hover:border-border/80 hover:text-foreground'
                                }`}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="p-4">
                    <div className="mb-2">
                        <p className="text-sm font-medium flex items-center gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                            Failure Threshold
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            Alert after this many consecutive failed checks
                        </p>
                    </div>
                    <div className="flex items-center gap-3 mt-2">
                        <input
                            type="range"
                            min={1}
                            max={10}
                            value={form.failureThreshold}
                            disabled={!form.enabled}
                            onChange={(e) =>
                                setForm((f) => ({
                                    ...f,
                                    failureThreshold: parseInt(e.target.value),
                                }))
                            }
                            className="flex-1 accent-sky-500 disabled:opacity-40"
                        />
                        <span className="text-sm font-bold text-foreground w-8 text-center tabular-nums">
                            {form.failureThreshold}×
                        </span>
                    </div>
                    <p className="text-xs text-muted-foreground/40 mt-1">
                        Alert fires after {form.failureThreshold} consecutive failure
                        {form.failureThreshold !== 1 ? 's' : ''}
                        {form.enabled && form.checkIntervalMinutes
                            ? ` (~${form.failureThreshold * form.checkIntervalMinutes} min downtime)`
                            : ''}
                    </p>
                </div>

                <div className="p-4 space-y-3">
                    <p className="text-sm font-medium text-foreground/80">Alert Channels</p>
                    <AlertChannel
                        icon={Mail}
                        title="Email"
                        description="Send alert to your account email"
                        checked={form.alertEmail}
                        enabled={form.enabled}
                        onChange={(alertEmail) => setForm((f) => ({ ...f, alertEmail }))}
                    />
                    <AlertChannel
                        icon={BellRing}
                        title="Push Notification"
                        description="Browser / mobile push alert"
                        checked={form.alertPush}
                        enabled={form.enabled}
                        onChange={(alertPush) => setForm((f) => ({ ...f, alertPush }))}
                    />
                    <AlertChannel
                        icon={Webhook}
                        title="Webhook"
                        description={
                            monitorConfig?.webhookConfigured
                                ? 'Configured — posts to Slack, Discord, or a custom URL'
                                : 'Post alerts to Slack, Discord, or a custom URL'
                        }
                        checked={form.webhookEnabled}
                        enabled={form.enabled}
                        onChange={(webhookEnabled) => setForm((f) => ({ ...f, webhookEnabled }))}
                    />
                    {form.webhookEnabled && (
                        <div className="pl-1 space-y-2">
                            <div className="flex gap-1.5">
                                {WEBHOOK_PLATFORMS.map((p) => (
                                    <button
                                        key={p.value}
                                        type="button"
                                        onClick={() =>
                                            setForm((f) => ({ ...f, webhookPlatform: p.value }))
                                        }
                                        disabled={!form.enabled}
                                        className={`px-2.5 py-1 rounded-md border text-xs font-medium transition-colors ${
                                            form.webhookPlatform === p.value
                                                ? 'bg-primary/15 border-primary/40 text-primary'
                                                : 'border-border text-muted-foreground hover:text-foreground disabled:opacity-40'
                                        }`}
                                    >
                                        {p.label}
                                    </button>
                                ))}
                            </div>
                            <Input
                                type="url"
                                value={form.webhookUrl}
                                onChange={(e) =>
                                    setForm((f) => ({ ...f, webhookUrl: e.target.value }))
                                }
                                disabled={!form.enabled}
                                placeholder={
                                    monitorConfig?.webhookConfigured
                                        ? 'Webhook URL set — enter a new one to replace it'
                                        : 'https://hooks.slack.com/services/...'
                                }
                                className="font-mono text-xs"
                            />
                        </div>
                    )}
                </div>

                {monitorConfig?.enabled && <MonitorStatusBanner config={monitorConfig} />}

                <div className="p-4">
                    <Button onClick={onSave} disabled={saving} className="w-full">
                        {saving ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" /> Saving…
                            </>
                        ) : (
                            <>
                                <Bell className="w-4 h-4" /> Save Monitoring Settings
                            </>
                        )}
                    </Button>
                </div>
            </Card>
        </div>
    );
}
