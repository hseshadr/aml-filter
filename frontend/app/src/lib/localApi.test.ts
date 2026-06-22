import type {
	CustomerRow,
	MatchEvent,
	ReviewRow,
	WorkstationStore,
} from "@amlfilter/workstation";
import {
	SCREENING_SENSITIVITY_KEY,
	SCREENING_THRESHOLD_OVERRIDES_KEY,
} from "@amlfilter/workstation";
import { describe, expect, it, vi } from "vitest";
import { LocalApiClient, type WorkstationServices } from "./localApi";

function makeCustomerRow(): CustomerRow {
	return {
		customer_id: "c-1",
		customer_reference: "R-1",
		name: "Ann",
		country: "RU",
		dob: null,
		onboarding_status: "PENDING_REVIEW",
		kyc_risk_rating: null,
		id_documents: [],
		onboarded_by: "local",
		created_at: "2026-06-09T00:00:00.000Z",
		updated_at: "2026-06-09T00:00:00.000Z",
	};
}

function makeReviewRow(): ReviewRow {
	return {
		match_id: "m-1",
		ofac_entity_id: "DEMO_SDN:0001",
		tier: "STRONG",
		match_score: 0.91,
		resolution_status: "PENDING",
		reviewer_id: null,
		review_notes: null,
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

function makeMatchEvent(): MatchEvent {
	return {
		event_id: "e-1",
		match_id: "m-1",
		customer_id: "c-1",
		ofac_entity_id: "DEMO_SDN:0001",
		event_type: "DETECTED",
		from_status: null,
		to_status: "PENDING",
		reviewer_id: null,
		notes: null,
		at: "2026-06-09T00:00:00.000Z",
	};
}

function makeServices(): WorkstationServices {
	// Back getSetting/setSetting with a real in-memory Map so loadScreeningConfig
	// / saveScreeningConfig round-trip for real (the changed-vs-unchanged logic in
	// setScreeningConfig runs against actual persisted state, not a stub).
	const settings = new Map<string, string>();
	const store = {
		open: vi.fn(),
		createCustomer: vi.fn(),
		listCustomers: vi.fn().mockResolvedValue([makeCustomerRow()]),
		getCustomer: vi.fn().mockResolvedValue(makeCustomerRow()),
		updateCustomer: vi.fn().mockResolvedValue(makeCustomerRow()),
		deleteCustomer: vi.fn().mockResolvedValue(undefined),
		recordMatches: vi.fn(),
		listReviewMatches: vi.fn().mockResolvedValue([makeReviewRow()]),
		resolveMatch: vi.fn(),
		getMatchEvents: vi.fn().mockResolvedValue([makeMatchEvent()]),
		getSetting: vi.fn(
			async (key: string): Promise<string | null> => settings.get(key) ?? null,
		),
		setSetting: vi.fn(async (key: string, value: string): Promise<void> => {
			settings.set(key, value);
		}),
	} as unknown as WorkstationStore;
	return {
		store,
		onboarding: {
			onboard: vi.fn().mockResolvedValue({
				customer: makeCustomerRow(),
				matches: [makeReviewRow()],
			}),
		} as unknown as WorkstationServices["onboarding"],
		tracker: {
			record: vi.fn(),
			listForReview: vi.fn(),
			resolve: vi.fn().mockResolvedValue({
				...makeReviewRow(),
				resolution_status: "FALSE_POSITIVE",
				reviewer_id: "Avery Analyst",
			}),
		} as unknown as WorkstationServices["tracker"],
		rescan: {
			rescanAll: vi.fn().mockResolvedValue({
				customersScanned: 3,
				newHits: 2,
				clearedHits: 1,
			}),
		} as unknown as WorkstationServices["rescan"],
	};
}

describe("LocalApiClient slice methods", () => {
	it("onboardCustomer maps to CustomerOnboardResponse with match_entity_ids", async () => {
		const services = makeServices();
		const client = new LocalApiClient(() => Promise.resolve(services));
		const result = await client.onboardCustomer({
			customer_reference: "R-1",
			name: "Ann",
			country: "RU",
		});
		expect(result.customer_id).toBe("c-1");
		expect(result.tenant_id).toBe("local");
		expect(result.screening_entity_id).toBeNull();
		expect(result.match_entity_ids).toEqual(["DEMO_SDN:0001"]);
	});

	it("getCustomer throws a not-found error for an unknown id", async () => {
		const services = makeServices();
		vi.mocked(services.store.getCustomer).mockResolvedValue(null);
		const client = new LocalApiClient(() => Promise.resolve(services));
		await expect(client.getCustomer("missing")).rejects.toThrow(
			/Customer missing not found/,
		);
	});

	it("listReviewMatches maps rows to the ReviewMatch wire shape", async () => {
		const services = makeServices();
		const client = new LocalApiClient(() => Promise.resolve(services));
		const rows = await client.listReviewMatches({
			tier: "STRONG",
			resolution_status: "PENDING",
		});
		expect(services.store.listReviewMatches).toHaveBeenCalledWith({
			tier: "STRONG",
			resolutionStatus: "PENDING",
			reviewState: undefined,
			needsReview: undefined,
			limit: undefined,
			offset: undefined,
		});
		expect(rows[0]).toMatchObject({
			match_id: "m-1",
			tier: "STRONG",
			match_type: "WHITELIST_VS_BLACKLIST",
			customer_reference: "R-1",
			sanctioned_name: "Ivan Fakovich",
			source_list: "DEMO_SDN",
			review_state: "CURRENT",
		});
	});

	it("listReviewMatches passes reviewState/needsReview through to the store", async () => {
		const services = makeServices();
		const client = new LocalApiClient(() => Promise.resolve(services));
		await client.listReviewMatches({
			reviewState: "CHANGED",
			needsReview: true,
		});
		expect(services.store.listReviewMatches).toHaveBeenCalledWith({
			tier: undefined,
			resolutionStatus: undefined,
			reviewState: "CHANGED",
			needsReview: true,
			limit: undefined,
			offset: undefined,
		});
	});

	it("getMatchEvents returns the store's events as a mutable array", async () => {
		const services = makeServices();
		const client = new LocalApiClient(() => Promise.resolve(services));
		const events = await client.getMatchEvents("m-1");
		expect(services.store.getMatchEvents).toHaveBeenCalledWith("m-1");
		expect(events).toEqual([
			{
				event_id: "e-1",
				match_id: "m-1",
				customer_id: "c-1",
				ofac_entity_id: "DEMO_SDN:0001",
				event_type: "DETECTED",
				from_status: null,
				to_status: "PENDING",
				reviewer_id: null,
				notes: null,
				at: "2026-06-09T00:00:00.000Z",
			},
		]);
		// Returned array is mutable (a copy), not the readonly store array.
		expect(Array.isArray(events)).toBe(true);
		events.push(makeMatchEvent());
		expect(events).toHaveLength(2);
	});

	it("getScreeningConfig defaults to balanced / no overrides on a fresh store", async () => {
		const services = makeServices();
		const client = new LocalApiClient(() => Promise.resolve(services));
		const config = await client.getScreeningConfig();
		expect(config).toEqual({ sensitivity: "balanced", overrides: {} });
	});

	it("getScreeningConfig round-trips a saved config", async () => {
		const services = makeServices();
		const client = new LocalApiClient(() => Promise.resolve(services));
		await client.setScreeningConfig({
			sensitivity: "strict",
			overrides: { DEMO_SDN: "lenient" },
		});
		const config = await client.getScreeningConfig();
		expect(config).toEqual({
			sensitivity: "strict",
			overrides: { DEMO_SDN: "lenient" },
		});
	});

	it("setScreeningConfig persists then rescans when the config CHANGED", async () => {
		const services = makeServices();
		const client = new LocalApiClient(() => Promise.resolve(services));
		const summary = await client.setScreeningConfig({
			sensitivity: "strict",
			overrides: {},
		});
		expect(services.store.setSetting).toHaveBeenCalledWith(
			SCREENING_SENSITIVITY_KEY,
			"strict",
		);
		expect(services.store.setSetting).toHaveBeenCalledWith(
			SCREENING_THRESHOLD_OVERRIDES_KEY,
			"{}",
		);
		expect(services.rescan.rescanAll).toHaveBeenCalledTimes(1);
		expect(summary).toEqual({
			customersScanned: 3,
			newHits: 2,
			clearedHits: 1,
		});
	});

	it("setScreeningConfig is a no-op (no persist, no rescan) when UNCHANGED", async () => {
		const services = makeServices();
		const client = new LocalApiClient(() => Promise.resolve(services));
		// The fresh store already resolves to balanced / {}; setting the same is a no-op.
		const summary = await client.setScreeningConfig({
			sensitivity: "balanced",
			overrides: {},
		});
		expect(services.store.setSetting).not.toHaveBeenCalled();
		expect(services.rescan.rescanAll).not.toHaveBeenCalled();
		expect(summary).toEqual({
			customersScanned: 0,
			newHits: 0,
			clearedHits: 0,
		});
	});

	it("resolveReviewMatch routes through the tracker (settings stamping lives there)", async () => {
		const services = makeServices();
		const client = new LocalApiClient(() => Promise.resolve(services));
		const updated = await client.resolveReviewMatch("m-1", "FALSE_POSITIVE", {
			review_notes: "noise",
		});
		expect(services.tracker.resolve).toHaveBeenCalledWith(
			"m-1",
			"FALSE_POSITIVE",
			{ reviewerId: undefined, notes: "noise" },
		);
		expect(updated.resolution_status).toBe("FALSE_POSITIVE");
		expect(updated.reviewer_id).toBe("Avery Analyst");
	});

	it("setApiKey/clearApiKey are inert (auth machinery is removed)", () => {
		const client = new LocalApiClient(() => Promise.reject(new Error("no")));
		expect(() => client.setApiKey("k")).not.toThrow();
		expect(() => client.clearApiKey()).not.toThrow();
	});
});
