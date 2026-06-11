import { describe, expect, it } from "vitest";
import { classifyTier, STRONG_TIER_FLOOR } from "./tiering";

describe("classifyTier (bands injected)", () => {
	const strong = 0.9;
	const possible = 0.6;

	it("classifies at/above the injected strong floor as STRONG (inclusive)", () => {
		expect(classifyTier(0.95, possible, strong)).toBe("STRONG");
		expect(classifyTier(strong, possible, strong)).toBe("STRONG");
	});

	it("classifies between possible and strong as POSSIBLE (inclusive lower edge)", () => {
		expect(classifyTier(0.89, possible, strong)).toBe("POSSIBLE");
		expect(classifyTier(possible, possible, strong)).toBe("POSSIBLE");
	});

	it("classifies below the possible threshold as WEAK", () => {
		expect(classifyTier(0.59, possible, strong)).toBe("WEAK");
		expect(classifyTier(0, possible, strong)).toBe("WEAK");
	});

	it("defaults the strong band to the exported floor", () => {
		expect(classifyTier(STRONG_TIER_FLOOR, 0.1)).toBe("STRONG");
	});
});
