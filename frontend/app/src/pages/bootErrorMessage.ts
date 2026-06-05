/**
 * The user-facing /screen boot-failure string. Names the bundle origin so a
 * port collision / wrong VITE_BUNDLE_BASE_URL is obvious from the banner alone
 * — e.g. a foreign edge on the same port whose bundle fails verification:
 *
 *   "Could not load the screening bundle from http://localhost:8081: signature
 *    verification failed"
 *
 * Keeps the "could not load the screening bundle" substring the C1 cold-boot
 * alert assertion (screen-cold-blocked.spec.ts) matches.
 */
export function bootErrorMessage(origin: string, error: unknown): string {
	const detail = error instanceof Error ? error.message : String(error);
	const from = origin === "" ? "" : ` from ${origin}`;
	return `Could not load the screening bundle${from}: ${detail}`;
}
