// Cross-language tiering parity: the TS classifyTier (a port of the Python
// aml_filter.scoring.tiers.classify_tier) must reproduce the Python source-of-
// truth verdicts. The golden is emitted by the canonical Python classifier
// (backend/scripts/gen_tiering_golden.py); regenerate it after any tiering
// change on either side (`backend $ uv run poe tiering-golden`).

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
