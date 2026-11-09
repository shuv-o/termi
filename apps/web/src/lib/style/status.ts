/**
 * The one status-tone vocabulary.
 *
 * Before this existed, every screen picked its own palette for the same idea:
 * "healthy" was `emerald-400` on the dashboard and `green-500` in the server
 * form, "warning" was split across `amber-400`, `yellow-400` and `orange-400`,
 * and "connecting" was `yellow-400` in one status component but `amber-400` in
 * the other. A user moving between pages saw the same state in three colours.
 *
 * Everything that expresses *state* — pills, dots, banners, toasts, metric
 * thresholds — maps to one of these five tones and takes its classes from here.
 * The underlying colours live in `globals.css` as `--success/--warning/--danger/
 * --info`, so a future re-theme is a four-line change.
 *
 * Deliberately NOT covered: the per-protocol accent palette in
 * `protocol-style.ts`. Those colours are categorical (SSH vs RDP vs VNC), not
 * a judgement about health, and keeping the two scales separate is what makes
 * a green "SSH" chip next to a green "online" pill read as intentional.
 */

export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

/** Foreground text/icon colour for a tone. */
export const toneText: Record<Tone, string> = {
    success: 'text-success',
    warning: 'text-warning',
    danger: 'text-danger',
    info: 'text-info',
    neutral: 'text-muted-foreground',
};

/** Solid dot, for status indicators. */
export const toneDot: Record<Tone, string> = {
    success: 'bg-success',
    warning: 'bg-warning',
    danger: 'bg-danger',
    info: 'bg-info',
    neutral: 'bg-muted-foreground/50',
};

/** Tinted surface + hairline border + text, for pills and badges. */
export const tonePill: Record<Tone, string> = {
    success: 'bg-success/10 border-success/25 text-success',
    warning: 'bg-warning/10 border-warning/25 text-warning',
    danger: 'bg-danger/10 border-danger/25 text-danger',
    info: 'bg-info/10 border-info/25 text-info',
    neutral: 'bg-secondary border-border text-muted-foreground',
};

/** Same idea as `tonePill`, a touch stronger — for full-width inline banners. */
export const toneBanner: Record<Tone, string> = {
    success: 'bg-success/10 border-success/30 text-success',
    warning: 'bg-warning/10 border-warning/30 text-warning',
    danger: 'bg-danger/10 border-danger/30 text-danger',
    info: 'bg-info/10 border-info/30 text-info',
    neutral: 'bg-secondary/60 border-border text-muted-foreground',
};

/**
 * Canonical load thresholds. These used to disagree: a dashboard card turned
 * amber at 70%, the "High CPU" fleet stat only counted servers at 80%, and the
 * alert banner only listed them at 90% — so the fleet could read "High CPU: 0"
 * while a card right below it was amber. One pair of numbers now drives all
 * three: amber is "high", red is "critical".
 */
export const USAGE_WARN_PCT = 80;
export const USAGE_CRIT_PCT = 90;

/** Tone for a "percentage used" metric (CPU, memory, disk). */
export function usageTone(
    pct: number,
    { warn = USAGE_WARN_PCT, crit = USAGE_CRIT_PCT } = {},
): Tone {
    if (pct >= crit) return 'danger';
    if (pct >= warn) return 'warning';
    return 'success';
}

/**
 * Tone for a round-trip latency reading, shared by the fleet stat and the
 * per-server views so "fast" means the same number everywhere.
 */
export function latencyTone(ms: number | null | undefined): Tone {
    if (ms == null) return 'neutral';
    if (ms >= 150) return 'danger';
    if (ms >= 50) return 'warning';
    return 'success';
}
