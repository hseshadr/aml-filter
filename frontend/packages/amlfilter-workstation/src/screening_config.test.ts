import { describe, expect, it } from "vitest";
import {
	loadScreeningConfig,
	resolveThreshold,
	SCREENING_SENSITIVITY_KEY,
	SCREENING_THRESHOLD_OVERRIDES_KEY,
	saveScreeningConfig,
} from "./screening_config";
import type { WorkstationStore } from "./types";

/** A throwaway in-memory settings store — only get/setSetting are exercised. */
function fakeStore(): WorkstationStore {
	const settings = new Map<string, string>();
	return {
		getSetting: (key: string) => Promise.resolve(settings.get(key) ?? null),
		setSetting: (key: string, value: string) => {
			settings.set(key, value);
			return Promise.resolve();
		},
	} as unknown as WorkstationStore;
}

describe("resolveThreshold", () => {
	it("maps each sensitivity to its preset threshold", () => {
		expect(resolveThreshold("strict", {})).toBe(0.75);
		expect(resolveThreshold("balanced", {})).toBe(0.65);
		expect(resolveThreshold("lenient", {})).toBe(0.55);
	});

	it("balanced preserves today's 0.65 floor exactly", () => {
		expect(resolveThreshold("balanced", {})).toBe(0.65);
	});

	it("a per-list override takes precedence over the global sensitivity", () => {
		expect(
			resolveThreshold("balanced", { OFAC_SDN: "strict" }, "OFAC_SDN"),
		).toBe(0.75);
	});

	it("falls back to the global sensitivity when no override matches the list", () => {
		expect(
			resolveThreshold("strict", { EU_CONSOLIDATED: "lenient" }, "OFAC_SDN"),
		).toBe(0.75);
	});

	it("uses the global sensitivity when no source list is given", () => {
		expect(resolveThreshold("lenient", { OFAC_SDN: "strict" })).toBe(0.55);
	});
});

describe("loadScreeningConfig", () => {
	it("defaults to balanced with no overrides when unset", async () => {
		const config = await loadScreeningConfig(fakeStore());
		expect(config).toEqual({ sensitivity: "balanced", overrides: {} });
	});

	it("round-trips a saved config", async () => {
		const store = fakeStore();
		await saveScreeningConfig(store, {
			sensitivity: "strict",
			overrides: { OFAC_SDN: "lenient" },
		});
		expect(await loadScreeningConfig(store)).toEqual({
			sensitivity: "strict",
			overrides: { OFAC_SDN: "lenient" },
		});
	});

	it("ignores a malformed persisted sensitivity, falling back to balanced", async () => {
		const store = fakeStore();
		await store.setSetting(SCREENING_SENSITIVITY_KEY, "wildly-invalid");
		await store.setSetting(SCREENING_THRESHOLD_OVERRIDES_KEY, "{not json");
		const config = await loadScreeningConfig(store);
		expect(config).toEqual({ sensitivity: "balanced", overrides: {} });
	});

	it("drops override entries whose value is not a known sensitivity", async () => {
		const store = fakeStore();
		await store.setSetting(
			SCREENING_THRESHOLD_OVERRIDES_KEY,
			JSON.stringify({ OFAC_SDN: "strict", BAD: "nope" }),
		);
		const config = await loadScreeningConfig(store);
		expect(config.overrides).toEqual({ OFAC_SDN: "strict" });
	});
});
