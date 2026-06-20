import { describe, expect, it, vi } from "vitest";
import { ANALYST_NAME_KEY, LocalMatchTracker } from "./review";
import type { ReviewRow, WorkstationStore } from "./types";

function makeReviewRow(): ReviewRow {
	return {
		match_id: "m-1",
		ofac_entity_id: "e-1",
		tier: "STRONG",
		match_score: 0.9,
		resolution_status: "FALSE_POSITIVE",
		reviewer_id: "Avery Analyst",
		review_notes: "noise",
		detected_at: "2026-06-09T00:00:00.000Z",
		customer_id: "c-1",
		customer_reference: "R-1",
		customer_name: "Ann",
		sanctioned_name: "Ivan Fakovich",
		source_list: "DEMO_SDN",
		list_version: "2026-05-01",
		reasons: [],
		explanation: "x",
		review_state: "CURRENT",
	};
}

function makeStore(): WorkstationStore {
	return {
		open: vi.fn(),
		createCustomer: vi.fn(),
		listCustomers: vi.fn(),
		getCustomer: vi.fn(),
		updateCustomer: vi.fn(),
		deleteCustomer: vi.fn(),
		recordMatches: vi.fn().mockResolvedValue([makeReviewRow()]),
		listReviewMatches: vi.fn().mockResolvedValue([makeReviewRow()]),
		resolveMatch: vi.fn().mockResolvedValue(makeReviewRow()),
		getSetting: vi.fn().mockResolvedValue(null),
		setSetting: vi.fn(),
	} as unknown as WorkstationStore;
}

describe("LocalMatchTracker.resolve", () => {
	it("stamps the analyst name from settings when no reviewer is given (spec §9.5)", async () => {
		const store = makeStore();
		vi.mocked(store.getSetting).mockResolvedValue("Avery Analyst");
		const tracker = new LocalMatchTracker(store);
		await tracker.resolve("m-1", "FALSE_POSITIVE", { notes: "noise" });
		expect(store.getSetting).toHaveBeenCalledWith(ANALYST_NAME_KEY);
		expect(store.resolveMatch).toHaveBeenCalledWith(
			"m-1",
			"FALSE_POSITIVE",
			"Avery Analyst",
			"noise",
		);
	});

	it("an explicit reviewer wins over the stored analyst name", async () => {
		const store = makeStore();
		vi.mocked(store.getSetting).mockResolvedValue("Avery Analyst");
		const tracker = new LocalMatchTracker(store);
		await tracker.resolve("m-1", "TRUE_POSITIVE", { reviewerId: "blake" });
		expect(store.resolveMatch).toHaveBeenCalledWith(
			"m-1",
			"TRUE_POSITIVE",
			"blake",
			undefined,
		);
	});

	it("passes undefined when neither a reviewer nor a setting exists", async () => {
		const store = makeStore();
		const tracker = new LocalMatchTracker(store);
		await tracker.resolve("m-1", "RESOLVED", {});
		expect(store.resolveMatch).toHaveBeenCalledWith(
			"m-1",
			"RESOLVED",
			undefined,
			undefined,
		);
	});
});

describe("LocalMatchTracker delegation", () => {
	it("record and listForReview delegate to the store", async () => {
		const store = makeStore();
		const tracker = new LocalMatchTracker(store);
		await tracker.record("c-1", []);
		expect(store.recordMatches).toHaveBeenCalledWith("c-1", []);
		await tracker.listForReview({ tier: "STRONG" });
		expect(store.listReviewMatches).toHaveBeenCalledWith({ tier: "STRONG" });
	});
});
