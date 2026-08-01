'use client';

import Link from 'next/link';
import { AlertCircle, ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AuthCard } from './AuthCard';
import { DisplaySettingsCard, IdentityCard, ProtocolSelector } from './ConnectionCards';
import { AdvancedCard, PreviewCard, TestConnectionCard } from './SidebarCards';
import { NO_STORED_CREDENTIALS, type StoredCredentials } from './types';
import type { ServerFormState } from './useServerForm';

type ServerFormMode = 'create' | 'edit';

/** Copy that differs between adding a new server and editing an existing one. */
const MODE_COPY: Record<
    ServerFormMode,
    { heading: string; untitledLabel: string; testHint: string; submit: string; submitting: string }
> = {
    create: {
        heading: 'Add Server',
        untitledLabel: 'Untitled Server',
        testHint: 'Enter host, username & credentials first',
        submit: 'Create Server',
        submitting: 'Creating…',
    },
    edit: {
        heading: 'Edit Server',
        untitledLabel: 'Untitled',
        testHint: 'Enter new credentials to test',
        submit: 'Save Changes',
        submitting: 'Saving…',
    },
};

/**
 * The add/edit server form.
 *
 * Both pages render this; they differ only in `mode`, the seeded values, and
 * what `onSubmit` does with them (POST /api/servers vs PATCH /api/servers/:id).
 */
export function ServerForm({
    mode,
    state,
    subtitle,
    storedCreds = NO_STORED_CREDENTIALS,
    submitting,
    error,
    onSubmit,
}: {
    mode: ServerFormMode;
    state: ServerFormState;
    /** Line under the heading — the server name in edit mode. */
    subtitle: string;
    storedCreds?: StoredCredentials;
    submitting: boolean;
    error: string;
    onSubmit: (e: React.FormEvent) => void;
}) {
    const copy = MODE_COPY[mode];
    const { form, update, groups, changeProtocol, resetTest } = state;

    return (
        <div className="mx-auto max-w-5xl space-y-6">
            <div className="flex items-center gap-3">
                <Button variant="ghost" size="icon" asChild className="h-9 w-9 rounded-xl">
                    <Link href="/panel">
                        <ArrowLeft className="w-4 h-4" />
                    </Link>
                </Button>
                <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                        Server setup
                    </p>
                    <h1 className="text-2xl font-semibold">{copy.heading}</h1>
                    <p className="text-muted-foreground text-sm">{subtitle}</p>
                </div>
            </div>

            <form onSubmit={onSubmit} method="POST" action="#">
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)] xl:gap-6">
                    <div className="space-y-4">
                        <ProtocolSelector value={form.protocol} onChange={changeProtocol} />
                        <IdentityCard
                            form={form}
                            update={update}
                            groups={groups}
                            onConnectionFieldChange={resetTest}
                        />
                        <DisplaySettingsCard form={form} update={update} />
                    </div>

                    <div className="space-y-4 self-start xl:sticky xl:top-6">
                        <AuthCard state={state} mode={mode} storedCreds={storedCreds} />
                        <AdvancedCard form={form} update={update} />
                        <PreviewCard
                            form={form}
                            groups={groups}
                            untitledLabel={copy.untitledLabel}
                        />
                        <TestConnectionCard
                            isSSHProto={state.isSSHProto}
                            canTest={state.canTest}
                            testStatus={state.testStatus}
                            testResult={state.testResult}
                            onTest={state.runTest}
                            disabledHint={copy.testHint}
                        />

                        {error && (
                            <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs">
                                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                {error}
                            </div>
                        )}

                        <div className="flex flex-col gap-2">
                            <Button type="submit" disabled={submitting} className="w-full">
                                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                                {submitting ? copy.submitting : copy.submit}
                            </Button>
                            <Button variant="secondary" asChild className="w-full">
                                <Link href="/panel">Cancel</Link>
                            </Button>
                        </div>
                    </div>
                </div>
            </form>
        </div>
    );
}
