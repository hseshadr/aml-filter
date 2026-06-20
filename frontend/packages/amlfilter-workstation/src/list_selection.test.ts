import { describe, expect, it } from "vitest";
import {
	ENABLED_WATCHLISTS_KEY,
	loadEnabledLists,
	saveEnabledLists,
	toListThresholds,
} from "./list_selection";
import type { ScreeningConfig } from "./screening_config";
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

const CATALOG = ["OFAC_SDN", "EU_CONSOLIDATED", "UN_CONSOLIDATED", "UK_OFSI"];

describe("loadEnabledLists", () => {
	it("defaults to ALL catalog ids when unset", async () => {
		const enabled = await loadEnabledLists(fakeStore(), CATALOG);
		expect(enabled).toEqual(CATALOG);
	});

	it("round-trips a saved selection", async () => {
		const store = fakeStore();
		await saveEnabledLists(store, ["OFAC_SDN", "UK_OFSI"]);
		expect(await loadEnabledLists(store, CATALOG)).toEqual([
			"OFAC_SDN",
			"UK_OFSI",
		]);
	});

	it("persists and reloads an empty selection (disable everything) as empty, not the default", async () => {
		const store = fakeStore();
		await saveEnabledLists(store, []);
		expect(await loadEnabledLists(store, CATALOG)).toEqual([]);
	});

	it("intersects the stored selection with the live catalog (drops vanished ids)", async () => {
		const store = fakeStore();
		await saveEnabledLists(store, ["OFAC_SDN", "GONE_LIST"]);
		expect(await loadEnabledLists(store, CATALOG)).toEqual(["OFAC_SDN"]);
	});

	it("falls back to ALL catalog ids when the stored value is malformed", async () => {
		const store = fakeStore();
		await store.setSetting(ENABLED_WATCHLISTS_KEY, "{not json");
		expect(await loadEnabledLists(store, CATALOG)).toEqual(CATALOG);
	});

	it("falls back to ALL catalog ids when the stored value is not a string array", async () => {
		const store = fakeStore();
		await store.setSetting(ENABLED_WATCHLISTS_KEY, JSON.stringify({ a: 1 }));
		expect(await loadEnabledLists(store, CATALOG)).toEqual(CATALOG);
	});
});

describe("toListThresholds", () => {
	function config(
		sensitivity: ScreeningConfig["sensitivity"],
		overrides: ScreeningConfig["overrides"] = {},
	): ScreeningConfig {
		return { sensitivity, overrides };
	}

	it("maps the global sensitivity to the default floor", () => {
		expect(toListThresholds(config("strict"), CATALOG).default).toBe(0.75);
		expect(toListThresholds(config("balanced"), CATALOG).default).toBe(0.65);
		expect(toListThresholds(config("lenient"), CATALOG).default).toBe(0.55);
	});

	it("emits a per-list floor for each catalog id that has an override", () => {
		const t = toListThresholds(
			config("balanced", { OFAC_SDN: "strict", UK_OFSI: "lenient" }),
			CATALOG,
		);
		expect(t.default).toBe(0.65);
		expect(t.perList).toEqual({ OFAC_SDN: 0.75, UK_OFSI: 0.55 });
	});

	it("ignores override entries for lists not in the catalog", () => {
		const t = toListThresholds(
			config("balanced", { GONE_LIST: "strict" }),
			CATALOG,
		);
		expect(t.perList).toEqual({});
	});

	it("emits no perList entries when there are no overrides", () => {
		const t = toListThresholds(config("strict"), CATALOG);
		expect(t.perList).toEqual({});
	});
});
