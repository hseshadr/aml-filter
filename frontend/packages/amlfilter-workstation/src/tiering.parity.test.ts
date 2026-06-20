// Tiering regression guard: the TS classifyTier is the source of truth for the
// review-tier verdict. The golden under __fixtures__ is a FROZEN, committed
// regression snapshot of that classifier's verdicts. This test asserts the live
// classifier still reproduces the committed snapshot, so any unintended drift in
// the tier boundaries or verdicts fails CI.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { classifyTier } from "./tiering";
import type { MatchTier } from "./types";

interface TieringGoldenCase {
	readonly name: string;
	readonly score: number;
	readonly possible_threshold: number;
	/** null = the case asserts the DEFAULT strong band on both sides. */
	readonly strong: number | null;
	readonly expected_tier: MatchTier;
}

function tieringGolden(): ReadonlyArray<TieringGoldenCase> {
	const here = dirname(fileURLToPath(import.meta.url));
	return JSON.parse(
		readFileSync(join(here, "__fixtures__", "tiering", "golden.json"), "utf-8"),
	) as TieringGoldenCase[];
}

describe("tiering parity — TS port reproduces the Python golden", () => {
	for (const c of tieringGolden()) {
		it(c.name, () => {
			const tier =
				c.strong === null
					? classifyTier(c.score, c.possible_threshold)
					: classifyTier(c.score, c.possible_threshold, c.strong);
			expect(tier).toBe(c.expected_tier);
		});
	}
});
