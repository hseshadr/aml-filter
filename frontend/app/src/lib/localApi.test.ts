import type {
	CustomerRow,
	ReviewRow,
	WorkstationStore,
} from "@amlfilter/workstation";
import { describe, expect, it, vi } from "vitest";
import {
	LocalApiClient,
	NotImplementedError,
	type WorkstationServices,
} from "./localApi";

function makeCustomerRow(): CustomerRow {
	return {
		customer_id: "c-1",
		customer_reference: "R-1",
		name: "Ann",
		country: "RU",
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
	};
}

function makeServices(): WorkstationServices {
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
		getSetting: vi.fn(),
		setSetting: vi.fn(),
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

describe("LocalApiClient non-slice methods fail loudly", () => {
	it("every non-slice method throws NotImplementedError", async () => {
		const client = new LocalApiClient(() =>
			Promise.reject(new Error("must not be called")),
		);
		const calls: ReadonlyArray<[string, () => Promise<unknown>]> = [
			["screen", () => client.screen({ name: "x" })],
			["getTenant", () => client.getTenant("t")],
			["createApiKey", () => client.createApiKey({})],
			["listApiKeys", () => client.listApiKeys()],
			["revokeApiKey", () => client.revokeApiKey("k")],
			["getUsage", () => client.getUsage()],
			["listLists", () => client.listLists()],
			["getAvailableLists", () => client.getAvailableLists()],
			["updateListConfig", () => client.updateListConfig("l", {})],
			[
				"addWhitelistCustomer",
				() => client.addWhitelistCustomer({ name: "x" }),
			],
			["listWhitelistCustomers", () => client.listWhitelistCustomers()],
			["getWhitelistCustomer", () => client.getWhitelistCustomer("e")],
			[
				"updateWhitelistCustomer",
				() => client.updateWhitelistCustomer("e", {}),
			],
			["deleteWhitelistCustomer", () => client.deleteWhitelistCustomer("e")],
			["getWhitelistMatches", () => client.getWhitelistMatches()],
			["resolveMatch", () => client.resolveMatch("m", "RESOLVED")],
			[
				"createSar",
				() =>
					client.createSar({
						customer_id: "c",
						match_id: "m",
						filer: { name: "n", institution: "i", contact: "c" },
					}),
			],
			["listSars", () => client.listSars()],
			["getSar", () => client.getSar("s")],
			["updateSar", () => client.updateSar("s", {})],
			["exportSar", () => client.exportSar("s", "pdf")],
			[
				"generateAttestation",
				() => client.generateAttestation({ customer_id: "c" }),
			],
			["listAttestations", () => client.listAttestations()],
			["getAttestation", () => client.getAttestation("a")],
			["verifyAttestation", () => client.verifyAttestation("a")],
			["exportAttestation", () => client.exportAttestation("a", "pdf")],
		];
		for (const [name, call] of calls) {
			await expect(call(), name).rejects.toBeInstanceOf(NotImplementedError);
			await expect(call(), name).rejects.toThrow(name);
		}
	});
});
