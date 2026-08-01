'use client';

import { Loader2, LogOut, Monitor, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SessionRow } from '../_components/SessionRow';
import { SettingsSection } from '../_components/SettingsSection';
import type { useAuthSessions } from '../_hooks/useAuthSessions';

export function SessionsPanel({ sessions }: { sessions: ReturnType<typeof useAuthSessions> }) {
    const otherCount = sessions.sessions.filter((s) => !s.isCurrent).length;

    return (
        <Card className="border-border p-6 transition-all duration-200 hover:border-border/80">
            <SettingsSection
                title="Active Sessions"
                description="Devices and browsers that are currently signed in to your account."
                icon={Monitor}
                iconBg="bg-sky-500/15 text-sky-400"
            >
                {sessions.loading ? (
                    <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span className="text-sm">Loading sessions…</span>
                    </div>
                ) : sessions.sessions.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">
                        No sessions found
                    </p>
                ) : (
                    <div className="space-y-2">
                        {sessions.sessions.map((s) => (
                            <SessionRow key={s.id} session={s} onRevoke={sessions.revoke} />
                        ))}
                    </div>
                )}

                {otherCount > 0 && (
                    <div className="mt-4 flex items-center justify-between pt-4 border-t border-border/50">
                        <p className="text-xs text-muted-foreground">
                            {otherCount} other device{otherCount !== 1 ? 's' : ''} signed in
                        </p>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={sessions.revokeAllOthers}
                            disabled={sessions.revokingAll}
                            className="gap-2 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        >
                            {sessions.revokingAll ? (
                                <>
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Revoking…
                                </>
                            ) : (
                                <>
                                    <LogOut className="w-3.5 h-3.5" /> Sign out all others
                                </>
                            )}
                        </Button>
                    </div>
                )}

                <div className="mt-4 flex items-start gap-2 text-xs text-muted-foreground/60">
                    <RefreshCw className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    Revoking a session will sign out that device immediately.
                </div>
            </SettingsSection>
        </Card>
    );
}
