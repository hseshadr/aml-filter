import i18n from "../i18n";

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
	return i18n.t("errors:boot.couldNotLoad", { detail });
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
	const base = i18n.t("errors:device.unsupported");
	if (missing.length === 0) {
		return base;
	}
	return i18n.t("errors:device.missingSuffix", {
		base,
		missing: missing.join(", "),
	});
}
