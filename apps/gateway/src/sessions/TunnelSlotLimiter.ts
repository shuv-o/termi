/**
 * Per-user cap on concurrent port-forward tunnels. Each tunnel opens its own
 * unpooled SSH connection (unlike interactive sessions), so this is a
 * resource backstop against a runaway or malicious bridge script, not an
 * entitlement.
 */
export class TunnelSlotLimiter {
    private readonly counts = new Map<string, number>();

    constructor(private readonly maxPerUser: number) {}

    /** Reserves a slot for the user if under the cap. Returns whether it was granted. */
    tryAcquire(userId: string): boolean {
        const count = this.counts.get(userId) ?? 0;
        if (count >= this.maxPerUser) return false;
        this.counts.set(userId, count + 1);
        return true;
    }

    /** Releases one slot. Safe to call even if the user holds none. */
    release(userId: string): void {
        const count = this.counts.get(userId) ?? 0;
        if (count <= 1) this.counts.delete(userId);
        else this.counts.set(userId, count - 1);
    }

    activeCount(userId: string): number {
        return this.counts.get(userId) ?? 0;
    }
}
