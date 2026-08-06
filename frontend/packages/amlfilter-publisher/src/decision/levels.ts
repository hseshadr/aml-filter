// The strictness levels the DECISION harness measures at — the ones users
// actually get.
//
// THE LIVE THRESHOLD IS NOT THE PRESET. `PRESETS` in the browser engine
// (engine/scoring.ts) carries 0.75 / 0.65 / 0.55, and no user has ever been
// screened at any of them: frontend/app/src/pages/ScreenPage.tsx always passes
// `threshold: LEVEL[strictness].floor`, so the engine's preset threshold is dead
// code on the live path. Measuring at 0.65 would report precision and recall for
// a configuration that does not exist in production.
//
// These three records are a literal mirror of `LEVEL` in
// frontend/app/src/pages/strictness.ts. They are duplicated here, in another
// package, for the same reason screenParams.ts duplicates the recall parameters:
// the harness must not import the app (the app is a private, browser-typed
// package). One rule in two packages diverges silently unless something asserts
// it, so frontend/app/src/pages/decisionParity.test.ts imports THIS file and
// this package's `decide.ts` and drives both implementations over the same
// cases. If that test fails, the app moved a threshold and this file has not
// followed — update it and re-measure the baseline.

/** One strictness level, exactly as the app defines it. */
export interface DecisionLevel {
	readonly level: "lenient" | "balanced" | "strict";
	/** Combined-score floor sent to `engine.screen` as `threshold`. Range 0–1. */
	readonly floor: number;
	/** Minimum name_trigram a match must clear (unless a token matches). Range 0–1. */
	readonly minLexical: number;
	/** Score below which a KEPT match renders under the collapsed disclosure. */
	readonly displayFloor: number;
}

/**
 * Mirror of `STRICTNESS_LEVELS` / `LEVEL` in the app.
 *
 * Balanced is the default every user starts on and is therefore the level the
 * committed floors gate; the other two are measured and reported beside it so a
 * change that trades one level against another is visible rather than averaged
 * away.
 */
export const DECISION_LEVELS: readonly [
	DecisionLevel,
	DecisionLevel,
	DecisionLevel,
] = [
	{ level: "lenient", floor: 0.3, minLexical: 0.0, displayFloor: 0.0 },
	{ level: "balanced", floor: 0.3, minLexical: 0.35, displayFloor: 0.4 },
	{ level: "strict", floor: 0.4, minLexical: 0.5, displayFloor: 0.0 },
];

/**
 * The retrieval parameters the emitter screens with.
 *
 * `k` is the live `SEARCH_K`, so retrieval breadth is byte-identical to
 * production (the engine over-fetches `k * 2` vector hits, then unions in the
 * lexical/phonetic candidates). `threshold` is 0 ON PURPOSE and is the one
 * deliberate difference: the emitter must see candidates the live floor would
 * have cut, or a true match scoring 0.28 would be invisible and the false
 * NEGATIVE it represents would never be counted. Every level's decision is then
 * re-applied to the emitted rows, so one screening run yields all three.
 *
 * Sorting and the top-k slice happen after scoring, so the rows emitted here are
 * a strict superset of what any level would have shown.
 */
export const EMIT_SCREEN_PARAMS: {
	readonly threshold: number;
	readonly k: number;
} = { threshold: 0, k: 25 };
