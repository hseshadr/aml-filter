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

/**
 * The /screen unsupported-device string. Shown when the up-front capability
 * preflight (engineSupport) finds this browser can't run the local engine —
 * an older iOS Safari / locked-down WebView missing OPFS, module Workers, or
 * synchronous file access. This is a graceful dead-end, not a hang: no Retry,
 * because retrying can't add a missing browser capability. Names the missing
 * features when known so a technical visitor can see why. Maps to the future
 * canonical `bundle.device_unsupported` error code.
 */
export function deviceUnsupportedMessage(
	missing: ReadonlyArray<string>,
): string {
	const base =
		"This device or browser can’t run the local engine. Everything runs in " +
		"your browser, so it needs a recent desktop browser — try Chrome, Edge, " +
		"Firefox, or Safari 17+.";
	if (missing.length === 0) {
		return base;
	}
	return `${base} (Missing: ${missing.join(", ")}.)`;
}
