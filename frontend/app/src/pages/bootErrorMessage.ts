/**
 * The user-facing /screen boot-failure string. The watchlist now loads
 * same-origin (no separate bundle origin to name), so this surfaces only the
 * underlying cause — a fail-closed signature/format failure or a stalled model:
 *
 *   "Could not load the screening bundle: signature verification failed"
 *
 * Keeps the "could not load the screening bundle" substring the C1 cold-boot
 * alert assertion (screen-cold-blocked.spec.ts) matches.
 */
export function bootErrorMessage(error: unknown): string {
	const detail = error instanceof Error ? error.message : String(error);
	return `Could not load the screening bundle: ${detail}`;
}
