// The screen parameters the recall harness measures with.
//
// These are deliberately NOT the engine's own defaults. `ScreeningEngine.screen`
// falls back to the "balanced" PRESET threshold of 0.65, which no user ever
// drives: the live /screen page sends `threshold: LEVEL[strictness].floor` and
// `k: SEARCH_K` (frontend/app/src/pages/ScreenPage.tsx), with strictness
// defaulting to "balanced" — floor 0.30, k 25. Measuring at 0.65 returns an
// empty result list for almost every query and would report a recall number for
// a configuration nobody runs.
//
// The two literals below are pinned on the app side by
// frontend/app/src/pages/strictness.recallParity.test.ts, which names this file.
// One rule in two packages diverges silently unless something asserts they are
// the same number, so that test is the seam that fails when the app moves its
// floor without this harness moving with it.

/** One screen call's retrieval parameters. */
export interface ScreenParams {
	/** Combined-score floor handed to `engine.screen` as `threshold`. */
	readonly threshold: number;
	/** Result count handed to `engine.screen` as `k`. */
	readonly k: number;
}

/** What the live /screen page sends on a default (Balanced) search. */
export const RECALL_SCREEN_PARAMS: ScreenParams = {
	threshold: 0.3,
	k: 25,
};

/**
 * The cut-offs recall is reported at. `k` (25) is the largest meaningful one:
 * the engine returns at most `k` matches, so a query whose true entity is not in
 * those 25 is invisible to the user no matter why — pruned by retrieval, or kept
 * but scored under the threshold. Recall@25 is therefore "did the product show
 * it at all", which is the promise being measured.
 */
export const RECALL_CUTOFFS: readonly number[] = [1, 10, 25];
