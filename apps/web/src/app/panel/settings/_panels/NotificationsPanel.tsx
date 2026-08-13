'use client';

import { Bell, BellOff, BellRing, Info, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SettingsSection } from '../_components/SettingsSection';
import type { usePushNotifications } from '../_hooks/usePushNotifications';

type PushState = ReturnType<typeof usePushNotifications>;

function StatusBanner({ push }: { push: PushState }) {
    if (push.needsIOSInstall) {
        return (
            <div className="flex items-center gap-3 p-4 rounded-xl border bg-amber-500/10 border-amber-500/20">
                <div className="w-9 h-9 rounded-lg bg-amber-500/20 flex items-center justify-center shrink-0">
                    <Info className="w-4 h-4 text-amber-400" />
                </div>
                <div>
                    <p className="text-sm font-medium text-amber-400">Add to Home Screen first</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        iOS only allows notifications for apps installed to the Home Screen. Tap
                        Share → Add to Home Screen, then open Termi from there and enable
                        notifications again.
                    </p>
                </div>
            </div>
        );
    }
    if (push.subscribed) {
        return (
            <div className="flex items-center gap-3 p-4 rounded-xl border bg-emerald-500/10 border-emerald-500/20">
                <div className="w-9 h-9 rounded-lg bg-emerald-500/20 flex items-center justify-center shrink-0">
                    <Bell className="w-4 h-4 text-emerald-400" />
                </div>
                <div>
                    <p className="text-sm font-medium text-emerald-400">Notifications active</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        This device will receive server alert notifications
                    </p>
                </div>
            </div>
        );
    }
    if (push.permission === 'denied') {
        return (
            <div className="flex items-center gap-3 p-4 rounded-xl border bg-red-500/10 border-red-500/20">
                <div className="w-9 h-9 rounded-lg bg-red-500/20 flex items-center justify-center shrink-0">
                    <BellOff className="w-4 h-4 text-red-400" />
                </div>
                <div>
                    <p className="text-sm font-medium text-red-400">Notifications blocked</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        Enable them in your browser site settings, then reload this page.
                    </p>
                </div>
            </div>
        );
    }
    return (
        <div className="flex items-center gap-3 p-4 rounded-xl border bg-secondary/50 border-border/50">
            <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                <BellOff className="w-4 h-4 text-muted-foreground" />
            </div>
            <div>
                <p className="text-sm font-medium">Notifications off</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                    Enable to get server alerts on this device
                </p>
            </div>
        </div>
    );
}

export function NotificationsPanel({ push }: { push: PushState }) {
    return (
        <Card className="border-border p-6 transition-all duration-200 hover:border-border/80">
            <SettingsSection
                title="Push Notifications"
                description="Get browser notifications for server down/up alerts on this device."
                icon={BellRing}
                iconBg="bg-amber-500/15 text-amber-400"
            >
                <div className="space-y-4">
                    <StatusBanner push={push} />

                    {push.subscribed ? (
                        <Button
                            variant="secondary"
                            onClick={push.disable}
                            disabled={push.busy}
                            className="gap-2"
                        >
                            {push.busy ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <BellOff className="w-4 h-4" />
                            )}
                            Disable for this device
                        </Button>
                    ) : (
                        <Button
                            onClick={push.enable}
                            disabled={
                                push.busy || push.permission === 'denied' || push.needsIOSInstall
                            }
                            className="gap-2"
                        >
                            {push.busy ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <Bell className="w-4 h-4" />
                            )}
                            {push.busy ? 'Enabling…' : 'Enable for this device'}
                        </Button>
                    )}

                    <div className="flex items-start gap-2 text-xs text-muted-foreground/60">
                        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        Notifications are per-device. Enable separately on each device. Alert rules
                        are configured per server in the server details page.
                    </div>
                </div>
            </SettingsSection>
        </Card>
    );
}
