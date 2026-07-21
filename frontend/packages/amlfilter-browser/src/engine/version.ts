// Version stamps shared by the runtime and the score-receipt sealer.
//
// These live in their own module because the sealer runs INSIDE
// MultiListScreeningEngine, and runtime.ts imports multiEngine.ts — so the
// engine cannot import the runtime back without a cycle.

/**
 * The screening-engine version stamped into every signed score receipt: it is
 * what tells a reviewer WHICH scorer produced a score they are re-checking.
 * Pinned to the package version and guarded by version.test.ts, so a release
 * bump that forgets this constant fails CI rather than silently mis-stamping.
 */
export const ENGINE_VERSION = "4.0.0";

/**
 * The composite version stamp: each list's `id@version`, sorted by id and
 * joined with `|`. Derived from the per-list LOADED versions (not the catalog's
 * generatedAt) so a no-op republish that only bumps generatedAt does NOT churn
 * the stamp; a bumped per-list version or a list add/remove DOES. Pure +
 * exported so the app can compare fetchPublishedVersion() against version().
 */
export function compositeVersion(
	versions: Readonly<Record<string, string>>,
): string {
	return Object.keys(versions)
		.sort()
		.map((id) => `${id}@${versions[id]}`)
		.join("|");
}
