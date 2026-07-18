'use client';

import { useState, useEffect, useRef } from 'react';
import { startAuthentication } from '@simplewebauthn/browser';
import {
    KeyRound,
    Copy,
    Check,
    Eye,
    EyeOff,
    Fingerprint,
    Loader2,
    AlertCircle,
    RefreshCw,
    Lock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';

export type RevealField = 'password' | 'privateKey' | 'passphrase';

interface Props {
    serverId: string;
    serverName: string;
    field: RevealField;
    onClose: () => void;
    /**
     * When true, the credential is copied to the clipboard automatically as soon
     * as it is revealed (after passkey / password verification), and the modal
     * closes shortly after. Used by the "Copy Password" action. If the clipboard
     * write fails, the revealed value stays on screen for a manual copy.
     */
    autoCopy?: boolean;
}

type Step = 'authenticating' | 'password-fallback' | 'revealed' | 'error';

const fieldLabel: Record<RevealField, string> = {
    password: 'Password',
    privateKey: 'Private Key',
    passphrase: 'Passphrase',
};

function getWebAuthnErrorMessage(err: unknown): string {
    if (!(err instanceof Error)) return 'Passkey authentication failed';
    switch (err.name) {
        case 'NotAllowedError':
            return 'Passkey authentication was cancelled or timed out. Please try again.';
        case 'SecurityError':
            return 'Security error — ensure the app is running on HTTPS or localhost.';
        case 'InvalidStateError':
            return 'No passkey found for this account on this device. Register a passkey in Settings.';
        case 'AbortError':
            return 'Authentication was aborted. Please try again.';
        case 'NotSupportedError':
            return 'Passkeys are not supported on this browser. Try Chrome 108+, Safari 16+, or Firefox 119+.';
        case 'UnknownError':
            return 'An unknown error occurred. Ensure your device has Touch ID / Face ID enabled.';
        default:
            return err.message || 'Passkey authentication failed';
    }
}

export default function PasskeyRevealModal({
    serverId,
    serverName,
    field,
    onClose,
    autoCopy = false,
}: Props) {
    const isElectron = typeof window !== 'undefined' && Boolean(window.electronAPI?.isElectron);

    const [step, setStep] = useState<Step>(isElectron ? 'password-fallback' : 'authenticating');
    const [errorMsg, setErrorMsg] = useState('');
    const [revealedValue, setRevealedValue] = useState('');
    const [showValue, setShowValue] = useState(false);
    const [copied, setCopied] = useState(false);
    const [passwordInput, setPasswordInput] = useState('');
    const [passwordLoading, setPasswordLoading] = useState(false);
    const passwordRef = useRef<HTMLInputElement>(null);
    const autoCopiedRef = useRef(false);

    useEffect(() => {
        if (!isElectron) void handlePasskeyAuth();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Auto-copy once the credential is revealed (only for the "Copy" intent).
    useEffect(() => {
        if (!autoCopy || step !== 'revealed' || !revealedValue || autoCopiedRef.current) return;
        autoCopiedRef.current = true;
        void (async () => {
            const ok = await copyToClipboard();
            // On success the value is on the clipboard — close after showing the
            // "Copied!" confirmation. On failure, leave the modal open so the
            // user can reveal and copy manually.
            if (ok) setTimeout(onClose, 1200);
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [step, revealedValue, autoCopy]);

    useEffect(() => {
        if (step === 'password-fallback') {
            setTimeout(() => passwordRef.current?.focus(), 50);
        }
    }, [step]);

    async function handlePasskeyAuth() {
        setStep('authenticating');
        setErrorMsg('');

        let webAuthnOptions: unknown;
        try {
            const optRes = await fetch('/api/auth/passkey/authenticate-options', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            });
            const optData = await optRes.json().catch(() => ({}));
            if (!optRes.ok || !optData.success) {
                setErrorMsg(optData.error || 'Failed to get passkey options from server');
                setStep('error');
                return;
            }
            webAuthnOptions = optData.data;
        } catch {
            setErrorMsg('Network error — could not reach the server');
            setStep('error');
            return;
        }

        let assertion: Awaited<ReturnType<typeof startAuthentication>>;
        try {
            assertion = await startAuthentication({
                optionsJSON: webAuthnOptions as Parameters<
                    typeof startAuthentication
                >[0]['optionsJSON'],
            });
        } catch (err: unknown) {
            setErrorMsg(getWebAuthnErrorMessage(err));
            setStep('error');
            return;
        }

        try {
            const revealRes = await fetch(`/api/servers/${serverId}/reveal`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ field, passkeyResponse: assertion }),
            });
            const revealData = await revealRes.json().catch(() => ({}));
            if (!revealRes.ok || !revealData.success) {
                setErrorMsg(revealData.error || 'Failed to reveal credential');
                setStep('error');
                return;
            }
            setRevealedValue(revealData.data.value);
            setStep('revealed');
        } catch {
            setErrorMsg('Network error — could not reach the server');
            setStep('error');
        }
    }

    async function handlePasswordReveal() {
        if (!passwordInput.trim()) return;
        setPasswordLoading(true);
        setErrorMsg('');
        try {
            const res = await fetch(`/api/servers/${serverId}/reveal`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ field, authPassword: passwordInput }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.success) {
                setErrorMsg(data.error || 'Authentication failed');
                setStep('error');
                return;
            }
            setRevealedValue(data.data.value);
            setStep('revealed');
        } catch {
            setErrorMsg('Network error — could not reach the server');
            setStep('error');
        } finally {
            setPasswordLoading(false);
            setPasswordInput('');
        }
    }

    async function copyToClipboard(): Promise<boolean> {
        let ok = false;
        try {
            await navigator.clipboard.writeText(revealedValue);
            ok = true;
        } catch {
            // Clipboard API unavailable (non-HTTPS or locked permissions)
        }
        if (ok) {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
        return ok;
    }

    return (
        <Dialog open onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="bg-card border-border max-w-md">
                {/* Header */}
                <div className="flex items-center gap-3 mb-5">
                    <div className="w-10 h-10 rounded-full bg-sky-500/10 flex items-center justify-center shrink-0">
                        <KeyRound className="w-5 h-5 text-sky-400" />
                    </div>
                    <div className="min-w-0">
                        <h2 className="font-semibold">Reveal {fieldLabel[field]}</h2>
                        <p className="text-sm text-muted-foreground truncate">{serverName}</p>
                    </div>
                </div>

                {/* Step: authenticating */}
                {step === 'authenticating' && (
                    <div className="flex flex-col items-center gap-4 py-6">
                        <div className="relative">
                            <div className="w-16 h-16 rounded-full bg-sky-500/10 flex items-center justify-center">
                                <Fingerprint className="w-8 h-8 text-sky-400 animate-pulse" />
                            </div>
                            <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-card flex items-center justify-center">
                                <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
                            </div>
                        </div>
                        <div className="text-center space-y-1">
                            <p className="font-medium">Verify with Passkey</p>
                            <p className="text-sm text-muted-foreground">
                                Use Touch ID, Face ID, or your security key to authenticate
                            </p>
                        </div>
                        <p className="text-xs text-muted-foreground/60 text-center">
                            Your device should show a biometric prompt shortly
                        </p>
                    </div>
                )}

                {/* Step: password-fallback (Electron — passkeys not supported) */}
                {step === 'password-fallback' && (
                    <div className="space-y-4">
                        <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                            <Lock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                            <p className="text-sm text-amber-300/90">
                                Passkeys aren&apos;t available in the desktop app. Enter your
                                account password to reveal this credential.
                            </p>
                        </div>
                        <div>
                            <label className="text-xs text-muted-foreground mb-1.5 block uppercase tracking-wider">
                                Account Password
                            </label>
                            <input
                                ref={passwordRef}
                                type="password"
                                value={passwordInput}
                                onChange={(e) => setPasswordInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handlePasswordReveal()}
                                placeholder="Enter your password"
                                className="w-full rounded-md bg-secondary border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-sky-500"
                            />
                        </div>
                        <div className="flex gap-3 justify-end">
                            <Button variant="secondary" onClick={onClose}>
                                Cancel
                            </Button>
                            <Button
                                onClick={handlePasswordReveal}
                                disabled={!passwordInput.trim() || passwordLoading}
                            >
                                {passwordLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                                Reveal
                            </Button>
                        </div>
                    </div>
                )}

                {/* Step: error */}
                {step === 'error' && (
                    <div className="space-y-4">
                        <div className="flex items-start gap-3 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                            <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                            <div className="space-y-1">
                                <p className="text-sm font-medium text-destructive">
                                    Authentication Failed
                                </p>
                                <p className="text-sm text-destructive/80">{errorMsg}</p>
                            </div>
                        </div>
                        <div className="flex gap-3 justify-end">
                            <Button variant="secondary" onClick={onClose}>
                                Cancel
                            </Button>
                            <Button
                                onClick={() =>
                                    isElectron ? setStep('password-fallback') : handlePasskeyAuth()
                                }
                            >
                                <RefreshCw className="w-4 h-4" />
                                Try Again
                            </Button>
                        </div>
                    </div>
                )}

                {/* Step: revealed */}
                {step === 'revealed' && (
                    <div className="space-y-4">
                        <div>
                            <label className="text-xs text-muted-foreground mb-1.5 block uppercase tracking-wider">
                                {fieldLabel[field]}
                            </label>
                            <div className="flex items-center gap-2 p-3 rounded-lg bg-secondary border border-border">
                                <code className="flex-1 text-sm font-mono break-all text-green-400 select-all min-w-0">
                                    {showValue
                                        ? revealedValue
                                        : '•'.repeat(Math.min(revealedValue.length, 24))}
                                </code>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setShowValue((v) => !v)}
                                    className="h-8 w-8 shrink-0"
                                    title={showValue ? 'Hide' : 'Show'}
                                >
                                    {showValue ? (
                                        <EyeOff className="w-4 h-4" />
                                    ) : (
                                        <Eye className="w-4 h-4" />
                                    )}
                                </Button>
                            </div>
                        </div>

                        <div className="flex gap-3 justify-end">
                            <Button variant="secondary" onClick={onClose}>
                                Close
                            </Button>
                            <Button
                                onClick={copyToClipboard}
                                className={
                                    copied ? 'bg-green-600 hover:bg-green-500 text-white' : ''
                                }
                            >
                                {copied ? (
                                    <>
                                        <Check className="w-4 h-4" /> Copied!
                                    </>
                                ) : (
                                    <>
                                        <Copy className="w-4 h-4" /> Copy
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
