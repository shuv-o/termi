'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useCachedFetch } from '@/lib/hooks/useCachedFetch';

import { MobileSectionPicker } from './_components/MobileSectionPicker';
import { RecoveryCodesPanel, UnverifiedBanner } from './_components/RecoveryCodes';
import { SettingsSidebar } from './_components/SettingsSidebar';
import { ToastList } from './_components/ToastList';

import { useAccountSettings } from './_hooks/useAccountSettings';
import { useAuthSessions } from './_hooks/useAuthSessions';
import { usePasskeys } from './_hooks/usePasskeys';
import { usePushNotifications } from './_hooks/usePushNotifications';
import { useToasts } from './_hooks/useToasts';
import { useTwoFactor } from './_hooks/useTwoFactor';

import { DangerZonePanel } from './_panels/DangerZonePanel';
import { EncryptionPanel } from './_panels/EncryptionPanel';
import { NotificationsPanel } from './_panels/NotificationsPanel';
import { PasskeysPanel } from './_panels/PasskeysPanel';
import { ProfilePanel } from './_panels/ProfilePanel';
import { RecordingsPanel } from './_panels/RecordingsPanel';
import { SecurityPanel } from './_panels/SecurityPanel';
import { SessionsPanel } from './_panels/SessionsPanel';

import { SECTION_IDS, type SectionId, type SetUser, type User } from './types';

/** Applies a `?section=` deep link (e.g. from the command palette) on mount. */
function SectionFromUrl({ onSection }: { onSection: (s: SectionId) => void }) {
    const searchParams = useSearchParams();

    useEffect(() => {
        const section = searchParams.get('section');
        if (section && SECTION_IDS.includes(section as SectionId)) {
            onSection(section as SectionId);
        }
        // Run only on mount — intentional
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return null;
}

export default function SettingsPage() {
    // Share the layout's cached user instead of re-fetching /api/auth/me. Writes
    // go through the cache so an edit here (name, 2FA, passkey) also updates the
    // shell's avatar immediately, with no extra round-trip.
    const {
        data: meData,
        isLoading: userLoading,
        mutate: mutateMe,
    } = useCachedFetch<{ user: User }>('/api/auth/me');
    const user = meData?.user ?? null;

    const setUser = useCallback<SetUser>(
        (updater) => {
            mutateMe((prev) => {
                const current = prev?.user ?? null;
                const next = typeof updater === 'function' ? updater(current) : updater;
                // Settings only ever edits an existing user, never clears it.
                return { user: (next ?? current) as User };
            });
        },
        [mutateMe],
    );

    const [activeSection, setActiveSection] = useState<SectionId>('profile');

    const { toasts, addToast, dismissToast } = useToasts();
    const account = useAccountSettings(user, setUser, addToast);
    const passkeys = usePasskeys(addToast, setUser);
    const twoFactor = useTwoFactor(setUser, addToast);
    const push = usePushNotifications(addToast);
    const sessions = useAuthSessions(activeSection === 'sessions', addToast);

    // Only the very first visit (nothing cached) shows a spinner; arriving here
    // from elsewhere in the panel reuses the already-loaded user instantly.
    if (userLoading && !user) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-7 h-7 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-screen-2xl pb-16">
            <Suspense fallback={null}>
                <SectionFromUrl onSection={setActiveSection} />
            </Suspense>

            <div className="mb-8 max-w-4xl">
                <h1 className="mt-0.5 text-xl sm:text-2xl font-bold">Settings</h1>
                <p className="mt-0.5 text-xs sm:text-sm text-muted-foreground">
                    Manage your account, security, and preferences
                </p>
            </div>

            {user && !user.isVerified && (
                <UnverifiedBanner
                    resending={account.verification.resending}
                    sent={account.verification.sent}
                    onResend={account.verification.resend}
                />
            )}

            {twoFactor.recoveryCodes.length > 0 && (
                <RecoveryCodesPanel
                    codes={twoFactor.recoveryCodes}
                    copiedCode={twoFactor.copiedCode}
                    onCopy={twoFactor.copyRecoveryCode}
                    onDismiss={() => twoFactor.setRecoveryCodes([])}
                />
            )}

            <div className="xl:grid xl:grid-cols-[240px_minmax(0,1fr)] xl:gap-10">
                <aside className="hidden xl:block">
                    {user && (
                        <SettingsSidebar
                            user={user}
                            active={activeSection}
                            onChange={setActiveSection}
                            passkeyCount={passkeys.passkeys.length}
                            sessionCount={sessions.sessions.length}
                        />
                    )}
                </aside>

                <div className="min-w-0 max-w-4xl">
                    <MobileSectionPicker active={activeSection} onChange={setActiveSection} />

                    {activeSection === 'profile' && user && (
                        <ProfilePanel
                            user={user}
                            passkeys={passkeys.passkeys}
                            name={account.name}
                            onNavigate={setActiveSection}
                        />
                    )}

                    {activeSection === 'security' && (
                        <SecurityPanel
                            user={user}
                            twoFactor={twoFactor}
                            password={account.password}
                        />
                    )}

                    {activeSection === 'passkeys' && <PasskeysPanel passkeys={passkeys} />}

                    {activeSection === 'encryption' && (
                        <EncryptionPanel user={user} encryption={account.encryption} />
                    )}

                    {activeSection === 'notifications' && <NotificationsPanel push={push} />}

                    {activeSection === 'sessions' && <SessionsPanel sessions={sessions} />}

                    {activeSection === 'recordings' && <RecordingsPanel />}

                    {activeSection === 'danger' && (
                        <DangerZonePanel user={user} encryption={account.encryption} />
                    )}
                </div>
            </div>

            <ToastList toasts={toasts} onDismiss={dismissToast} />
        </div>
    );
}
