'use client';

import { AlertCircle, Fingerprint, Loader2, MonitorSmartphone, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PasskeyRow } from '../_components/PasskeyRow';
import { SettingsSection } from '../_components/SettingsSection';
import type { usePasskeys } from '../_hooks/usePasskeys';

export function PasskeysPanel({ passkeys }: { passkeys: ReturnType<typeof usePasskeys> }) {
    return (
        <Card className="border-border p-6 transition-all duration-200 hover:border-border/80">
            <SettingsSection
                title="Passkeys"
                description="Sign in with biometrics or a security key — no password needed."
                icon={Fingerprint}
                iconBg="bg-primary/15 text-primary"
            >
                {passkeys.loading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground py-4 justify-center">
                        <Loader2 className="w-4 h-4 animate-spin" /> Loading…
                    </div>
                ) : passkeys.passkeys.length > 0 ? (
                    <div className="space-y-2 mb-4">
                        {passkeys.passkeys.map((pk) => (
                            <PasskeyRow key={pk.id} passkey={pk} onDelete={passkeys.remove} />
                        ))}
                    </div>
                ) : (
                    <div className="mb-4 flex items-center gap-3 p-4 rounded-xl bg-secondary/50 border border-border/50 text-sm text-muted-foreground">
                        <MonitorSmartphone className="w-4 h-4 shrink-0" />
                        No passkeys registered. Add one to enable passwordless sign-in on this
                        device.
                    </div>
                )}

                {passkeys.showAdd ? (
                    <div className="space-y-3 p-4 rounded-xl bg-secondary/50 border border-border">
                        <p className="text-sm font-medium">Name this passkey</p>
                        <p className="text-xs text-muted-foreground">
                            Identify the device — e.g. &quot;MacBook Touch ID&quot; or &quot;iPhone
                            Face ID&quot;.
                        </p>
                        <Input
                            type="text"
                            value={passkeys.newName}
                            onChange={(e) => passkeys.setNewName(e.target.value)}
                            placeholder="My Passkey"
                            className="bg-card border-border"
                            maxLength={64}
                            disabled={passkeys.adding}
                            autoFocus
                        />
                        {passkeys.error && (
                            <div className="flex items-start gap-2 p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-sm text-destructive">
                                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                                {passkeys.error}
                            </div>
                        )}
                        <div className="flex gap-2">
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => {
                                    passkeys.setShowAdd(false);
                                    passkeys.setNewName('');
                                    passkeys.setError('');
                                }}
                                disabled={passkeys.adding}
                            >
                                Cancel
                            </Button>
                            <Button
                                size="sm"
                                onClick={passkeys.add}
                                disabled={passkeys.adding}
                                className="flex-1"
                            >
                                {passkeys.adding ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" /> Waiting for
                                        system dialog…
                                    </>
                                ) : (
                                    <>
                                        <Fingerprint className="w-4 h-4" /> Create Passkey
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                ) : (
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                            passkeys.setShowAdd(true);
                            passkeys.setError('');
                        }}
                        className="gap-2"
                    >
                        <Plus className="w-4 h-4" /> Add Passkey
                    </Button>
                )}

                <p className="text-xs text-muted-foreground/50 mt-4">
                    Requires a device with biometrics or hardware security key, and a modern browser
                    (Chrome 108+, Safari 16+, Firefox 119+).
                </p>
            </SettingsSection>
        </Card>
    );
}
