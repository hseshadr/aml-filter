import { describe, expect, it } from "vitest";
import { phoneticKeys, tokenSetSimilarity } from "./fuzzyText";

describe("phoneticKeys — the Double Metaphone seam", () => {
	it("collapses the vowel variants sanctions lists are full of", () => {
		expect(phoneticKeys("aiman")).toEqual(phoneticKeys("ayman"));
		expect(phoneticKeys("muhammad")).toEqual(phoneticKeys("mohammed"));
		expect(phoneticKeys("hassan")).toEqual(phoneticKeys("hasan"));
	});

	it("returns BOTH keys when the algorithm produced a second pronunciation", () => {
		const keys = phoneticKeys("marzuk");
		expect(keys.length).toBe(2);
		expect(keys[0]).not.toBe(keys[1]);
		// Marzuk and Marzook share both keys — this is the pair that makes the
		// "Musa Muhammad Abu Marzuk" probe reachable.
		expect(phoneticKeys("marzook")).toEqual(keys);
	});

	it("returns one key when primary and secondary agree", () => {
		expect(phoneticKeys("hassan")).toHaveLength(1);
	});

	it("returns nothing for an empty token", () => {
		expect(phoneticKeys("")).toEqual([]);
	});

	it("returns nothing for a token with no pronounceable letters", () => {
		expect(phoneticKeys("123")).toEqual([]);
	});

	// Stated honestly rather than oversold: DM splits consonant variants, so it
	// is a widener, never the decision. If this ever starts passing, the claim in
	// fuzzyText.ts's header is stale and must be rewritten.
	it("does NOT collapse consonant variants — Zawahiri and Zawahri differ", () => {
		expect(phoneticKeys("zawahiri")).not.toEqual(phoneticKeys("zawahri"));
	});

	it("does NOT collapse Chinese romanisations — Zhang and Chang differ", () => {
		expect(phoneticKeys("zhang")).not.toEqual(phoneticKeys("chang"));
	});
});

describe("tokenSetSimilarity — the fuzzball seam", () => {
	it("scores 1.0 for the same tokens in a different order", () => {
		expect(tokenSetSimilarity("salim ahmad fuad", "ahmad fuad salim")).toBe(1);
	});

	it("tolerates one side carrying extra words", () => {
		expect(
			tokenSetSimilarity("musa muhammad abu marzuk", "musa abu marzuk"),
		).toBe(1);
	});

	it("ranks a near spelling above an unrelated name", () => {
		const near = tokenSetSimilarity("hassan nasralla", "nasrallah hasan");
		const far = tokenSetSimilarity("hassan nasralla", "acme trading company");
		expect(near).toBeGreaterThan(far);
		expect(near).toBeGreaterThan(0.8);
	});

	it("stays inside [0, 1]", () => {
		expect(tokenSetSimilarity("abc", "xyz")).toBeGreaterThanOrEqual(0);
		expect(tokenSetSimilarity("abc", "abc")).toBeLessThanOrEqual(1);
	});

	it("scores 0 when either side is empty rather than throwing", () => {
		expect(tokenSetSimilarity("", "ayman")).toBe(0);
		expect(tokenSetSimilarity("ayman", "")).toBe(0);
	});
});
