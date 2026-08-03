import { describe, expect, it } from "vitest";
import { sampleDeterministic } from "./sample.ts";

const ITEMS = Array.from({ length: 100 }, (_, i) => i);

describe("sampleDeterministic", () => {
	it("returns the requested size", () => {
		expect(sampleDeterministic(ITEMS, 10, 1)).toHaveLength(10);
	});

	it("returns the SAME items for the same seed", () => {
		expect(sampleDeterministic(ITEMS, 10, 42)).toEqual(
			sampleDeterministic(ITEMS, 10, 42),
		);
	});

	it("returns different items for a different seed", () => {
		expect(sampleDeterministic(ITEMS, 10, 42)).not.toEqual(
			sampleDeterministic(ITEMS, 10, 43),
		);
	});

	it("preserves the input's own order", () => {
		const picked = sampleDeterministic(ITEMS, 15, 7);
		expect([...picked].sort((a, b) => a - b)).toEqual([...picked]);
	});

	it("never repeats an item", () => {
		const picked = sampleDeterministic(ITEMS, 40, 3);
		expect(new Set(picked).size).toBe(40);
	});

	it("returns everything when the size meets or exceeds the population", () => {
		expect(sampleDeterministic(ITEMS, 100, 1)).toEqual(ITEMS);
		expect(sampleDeterministic(ITEMS, 500, 1)).toEqual(ITEMS);
	});

	it("returns nothing for a non-positive size", () => {
		expect(sampleDeterministic(ITEMS, 0, 1)).toEqual([]);
		expect(sampleDeterministic(ITEMS, -5, 1)).toEqual([]);
	});

	it("draws from across the whole population, not just the head", () => {
		// A broken partial shuffle that only ever swaps within the first `size`
		// slots would return 0..19 and pass every test above.
		const picked = sampleDeterministic(ITEMS, 20, 11);
		expect(Math.max(...picked)).toBeGreaterThan(50);
	});
});
