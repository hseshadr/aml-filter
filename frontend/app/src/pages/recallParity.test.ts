// Pins the two numbers the recall harness measures with.
//
// Recall is reported for the parameters the live /screen page actually sends —
// `threshold: LEVEL.balanced.floor` and `k: SEARCH_K` — not the engine's own
// defaults. Those two values live here, in the app, while the harness that
// measures with them lives in another package:
//
//   frontend/packages/amlfilter-publisher/src/recall/screenParams.ts
//
// One rule in two packages diverges silently unless something asserts the
// numbers. If this test fails, the app changed a search parameter: update
// screenParams.ts to match and re-measure the baseline
// (`pnpm --filter @amlfilter/publisher run measure-recall -- --write`), because
// the committed recall floors describe the OLD parameters until you do.
//
// Asserted against literals on purpose. `expect(SEARCH_K).toBe(SEARCH_K)` would
// pass at any value and guard nothing.

import { describe, expect, it } from "vitest";
import { SEARCH_K } from "./ScreenPage";
import { LEVEL } from "./strictness";

describe("recall harness parity", () => {
	it("still asks the engine for 25 matches", () => {
		expect(SEARCH_K).toBe(25);
	});

	it("still sends a Balanced engine floor of 0.30", () => {
		expect(LEVEL.balanced.floor).toBe(0.3);
	});

	it("still defaults the /screen strictness control to Balanced", () => {
		// The harness measures the DEFAULT experience. If the page's default stop
		// moved, the measured number would describe a level nobody starts on.
		expect(LEVEL.balanced.level).toBe("balanced");
	});
});
