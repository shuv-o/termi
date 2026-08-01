'use client';

import { AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SettingsSection } from '../_components/SettingsSection';
import type { useAccountSettings } from '../_hooks/useAccountSettings';
import type { User } from '../types';

type EncryptionState = ReturnType<typeof useAccountSettings>['encryption'];

export function DangerZonePanel({
    user,
    encryption,
}: {
    user: User | null;
    encryption: EncryptionState;
}) {
    return (
        <Card className="border border-red-500/20 p-6 transition-all duration-200 hover:border-red-500/30">
            <SettingsSection
                title="Danger Zone"
                description="Irreversible actions that permanently affect your account."
                icon={AlertTriangle}
                iconBg="bg-red-500/15 text-red-400"
            >
                <div className="space-y-4">
                    {user?.isGoogleUser && (
                        <div className="p-4 rounded-xl border border-red-500/20 bg-red-500/5">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <p className="text-sm font-medium text-red-300">
                                        Reset Encryption Key
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        Permanently deletes all stored servers and credentials.
                                        You&apos;ll need to re-add everything from scratch.
                                    </p>
                                </div>
                                {!encryption.showResetConfirm && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => encryption.setShowResetConfirm(true)}
                                        className="shrink-0 border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300"
                                    >
                                        Reset
                                    </Button>
                                )}
                            </div>
                            {encryption.showResetConfirm && (
                                <div className="mt-4 pt-4 border-t border-red-500/20 space-y-3">
                                    <p className="text-sm text-red-300 font-medium">
                                        This will permanently delete all your stored servers and
                                        credentials. This cannot be undone.
                                    </p>
                                    <div className="flex gap-2">
                                        <Button
                                            variant="destructive"
                                            size="sm"
                                            onClick={encryption.reset}
                                            disabled={encryption.resetting}
                                        >
                                            {encryption.resetting && (
                                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                            )}
                                            Delete Everything &amp; Reset
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => encryption.setShowResetConfirm(false)}
                                        >
                                            Cancel
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {!user?.isGoogleUser && (
                        <div className="p-4 rounded-xl border border-border/50 bg-secondary/30">
                            <p className="text-sm text-muted-foreground">
                                Password-based accounts use a login-derived encryption key.
                                Encryption reset is only available for Google-authenticated
                                accounts.
                            </p>
                        </div>
                    )}
                </div>
            </SettingsSection>
        </Card>
    );
}
