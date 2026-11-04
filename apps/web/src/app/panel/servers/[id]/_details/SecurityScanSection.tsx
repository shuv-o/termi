'use client';

import { useCallback, useState } from 'react';
import {
    AlertTriangle,
    CheckCircle2,
    ChevronDown,
    CircleHelp,
    Loader2,
    ScanSearch,
    ShieldCheck,
    XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { getCachedData, mutateCache, revalidate } from '@/lib/hooks/useCachedFetch';
import { HardenDialog } from './HardenDialog';
import { formatRelativeTime } from '@/lib/format';
import type { CheckStatus, SecurityCheck, SecurityReport } from '@/lib/services/hardening/evaluate';
import { cn } from '@/lib/utils';

const STATUS_ICON: Record<CheckStatus, typeof CheckCircle2> = {
    pass: CheckCircle2,
    warn: AlertTriangle,
    fail: XCircle,
    unknown: CircleHelp,
};
const STATUS_TONE: Record<CheckStatus, string> = {
    pass: 'text-success',
    warn: 'text-warning',
    fail: 'text-danger',
    unknown: 'text-muted-foreground',
};
const ORDER: CheckStatus[] = ['fail', 'warn', 'unknown', 'pass'];
const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 };

function gradeTone(score: number) {
    return score >= 90 ? 'text-success' : score >= 60 ? 'text-warning' : 'text-danger';
}

function CheckRow({ check }: { check: SecurityCheck }) {
    const Icon = STATUS_ICON[check.status];
    const needsFix = check.status === 'fail' || check.status === 'warn';
    return (
        <li className="flex gap-3 px-4 py-3">
            <Icon
                className={cn('mt-0.5 h-4 w-4 shrink-0', STATUS_TONE[check.status])}
                aria-hidden
            />
            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                    <p className="text-sm font-medium">{check.title}</p>
                    {needsFix && check.severity === 'high' && (
                        <span className="text-[11px] font-medium text-danger">High risk</span>
                    )}
                    <span className="sr-only">{check.status}</span>
                </div>
                <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">
                    {check.detail}
                </p>
                {needsFix && check.fix && (
                    <p className="mt-1.5 text-[13px] leading-snug text-foreground/85">
                        <span className="text-muted-foreground">Fix: </span>
                        {check.fix}
                    </p>
                )}
            </div>
        </li>
    );
}

/**
 * Read-only security scan: runs a script over SSH that inspects the server's
 * SSH settings, firewall, brute-force protection, updates and open ports, and
 * explains what to fix. Nothing on the server is changed.
 */
export function SecurityScanSection({
    serverId,
    serverName,
}: {
    serverId: string;
    serverName: string;
}) {
    // The last report lives in the shared cache, so leaving the page and coming
    // back still shows it without re-running the scan.
    const cacheKey = `security-scan:${serverId}`;
    const [report, setReport] = useState<SecurityReport | null>(
        () => getCachedData<{ report: SecurityReport }>(cacheKey)?.report ?? null,
    );
    const [scanning, setScanning] = useState(false);
    const [error, setError] = useState('');
    const [showPassed, setShowPassed] = useState(false);
    const [hardenOpen, setHardenOpen] = useState(false);

    const scan = useCallback(async () => {
        setScanning(true);
        setError('');
        try {
            const res = await fetch(`/api/servers/${serverId}/security-scan`, { method: 'POST' });
            const json = await res.json();
            if (!json.success) {
                setError(json.error || 'The scan failed');
                return;
            }
            mutateCache<{ report: SecurityReport }>(cacheKey, { report: json.data.report });
            setReport(json.data.report);
        } catch {
            setError('Could not reach Termi to run the scan');
        } finally {
            setScanning(false);
        }
    }, [serverId, cacheKey]);

    const sorted = report
        ? [...report.checks].sort(
              (a, b) =>
                  ORDER.indexOf(a.status) - ORDER.indexOf(b.status) ||
                  SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
          )
        : [];
    const open = sorted.filter((c) => c.status !== 'pass');
    const passed = sorted.filter((c) => c.status === 'pass');
    const failCount = sorted.filter((c) => c.status === 'fail').length;
    const warnCount = sorted.filter((c) => c.status === 'warn').length;

    return (
        <div>
            <div className="mb-3 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground/80">
                    <ShieldCheck className="h-4 w-4 text-primary" />
                    Security
                </h2>
                <div className="flex items-center gap-2">
                    {report && failCount + warnCount > 0 && (
                        <Button size="sm" onClick={() => setHardenOpen(true)} disabled={scanning}>
                            <ShieldCheck /> Fix automatically
                        </Button>
                    )}
                    <Button variant="secondary" size="sm" onClick={scan} disabled={scanning}>
                        {scanning ? (
                            <>
                                <Loader2 className="animate-spin" /> Scanning…
                            </>
                        ) : (
                            <>
                                <ScanSearch /> {report ? 'Scan again' : 'Scan server'}
                            </>
                        )}
                    </Button>
                </div>
            </div>

            {report && (
                <HardenDialog
                    serverId={serverId}
                    serverName={serverName}
                    report={report}
                    open={hardenOpen}
                    onOpenChange={setHardenOpen}
                    onFinished={() => {
                        // The login may have changed: refresh the server, then
                        // re-scan so the score reflects what was fixed.
                        revalidate(`/api/servers/${serverId}`, `/api/servers/${serverId}`);
                        void scan();
                    }}
                />
            )}

            {error && (
                <Card className="mb-3 flex items-start gap-3 border-danger/25 bg-danger/5 p-4">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
                    <p className="text-sm text-danger">{error}</p>
                </Card>
            )}

            {!report ? (
                <Card className="p-5">
                    <p className="text-sm font-medium">Check how exposed this server is</p>
                    <p className="mt-1 max-w-[62ch] text-[13px] text-muted-foreground">
                        Looks at password and root logins, brute-force protection, the firewall,
                        open ports and automatic updates, then explains what to fix. The scan only
                        reads — it changes nothing on the server. It sees more when the login user
                        has passwordless sudo.
                    </p>
                </Card>
            ) : (
                <Card className="overflow-hidden">
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-border p-4">
                        <div className="flex items-baseline gap-2">
                            <span
                                className={cn(
                                    'text-[32px] font-semibold leading-none tracking-[-0.02em] tabular-nums',
                                    gradeTone(report.score),
                                )}
                            >
                                {report.score}
                            </span>
                            <span className="text-sm text-muted-foreground">/ 100</span>
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium">
                                {failCount + warnCount === 0
                                    ? 'Nothing needs attention'
                                    : [
                                          failCount && `${failCount} to fix`,
                                          warnCount && `${warnCount} to review`,
                                      ]
                                          .filter(Boolean)
                                          .join(', ')}
                            </p>
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                {report.os.name}, as {report.loginUser || 'unknown user'}
                                {report.privilege === 'sudo' && ' (sudo)'}. Scanned{' '}
                                {formatRelativeTime(report.scannedAt)}.
                            </p>
                        </div>
                    </div>

                    {report.limited && (
                        <p className="flex items-start gap-2 border-b border-border bg-warning/5 px-4 py-2.5 text-xs text-warning">
                            <CircleHelp className="mt-px h-3.5 w-3.5 shrink-0" />
                            Some checks need root or passwordless sudo, so they are marked as
                            unknown
                            {report.sshConfigSource === 'files' &&
                                ' and SSH settings were read from the config files rather than the running server'}
                            .
                        </p>
                    )}

                    {open.length > 0 && (
                        <ul className="divide-y divide-border">
                            {open.map((c) => (
                                <CheckRow key={c.id} check={c} />
                            ))}
                        </ul>
                    )}

                    {passed.length > 0 && (
                        <div className={open.length > 0 ? 'border-t border-border' : ''}>
                            <button
                                type="button"
                                onClick={() => setShowPassed((v) => !v)}
                                aria-expanded={showPassed}
                                className="flex w-full items-center gap-2 px-4 py-3 text-left text-[13px] text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
                            >
                                <CheckCircle2 className="h-4 w-4 text-success" />
                                {passed.length} check{passed.length === 1 ? '' : 's'} passed
                                <ChevronDown
                                    className={cn(
                                        'ml-auto h-4 w-4 transition-transform',
                                        showPassed && 'rotate-180',
                                    )}
                                />
                            </button>
                            {showPassed && (
                                <ul className="divide-y divide-border border-t border-border">
                                    {passed.map((c) => (
                                        <CheckRow key={c.id} check={c} />
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}

                    {report.ports.length > 0 && (
                        <div className="border-t border-border px-4 py-3">
                            <p className="mb-2 text-xs text-muted-foreground">Listening ports</p>
                            <div className="flex flex-wrap gap-1.5">
                                {report.ports.map((p) => (
                                    <span
                                        key={`${p.address}:${p.port}`}
                                        title={
                                            p.public
                                                ? 'Listens on every interface'
                                                : `Only on ${p.address}`
                                        }
                                        className={cn(
                                            'data rounded-full border px-2 py-0.5 text-[11px]',
                                            p.public
                                                ? 'border-input text-foreground/85'
                                                : 'border-border text-muted-foreground',
                                        )}
                                    >
                                        {p.port}
                                        {p.process && (
                                            <span className="font-sans text-muted-foreground">
                                                {' '}
                                                {p.process}
                                            </span>
                                        )}
                                        {!p.public && <span className="font-sans"> (local)</span>}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </Card>
            )}
        </div>
    );
}
