import type { Match, ScreenQuery, ScreenResponse } from "@amlfilter/browser";
import { EMPTY_IDENTIFIERS } from "@amlfilter/browser";
import { describe, expect, it, vi } from "vitest";
import type { NameScreener } from "./onboarding";
import { LAST_SYNCED_VERSION_KEY, RescanService } from "./rescan";
import { tierMatch } from "./tier_match";
import type {
	CreateCustomerPayload,
	CustomerPatch,
	CustomerRow,
	ReviewFilters,
	ReviewRow,
	TieredMatch,
	WorkstationStore,
} from "./types";

function makeMatch(overrides: Partial<Match> = {}): Match {
	return {
		entity_id: "DEMO_SDN:0001",
		score: 0.95,
		entity_type: "PERSON",
		risk_category: "SANCTION",
		source_list: "DEMO_SDN",
		list_version: "2026-05-01",
		primary_name: "Ivan Fakovich",
		aliases: [],
		countries: ["RU"],
		nationalities: [],
		dob: [],
		addresses: [],
		identifiers: EMPTY_IDENTIFIERS,
		reasons: [],
		explanation: "Match due to: strong vector similarity",
		...overrides,
	};
}

// A faithful in-memory WorkstationStore: it really stores customers, matches
// (keyed per customer by ofac_entity_id), and settings, and its replaceMatches
// mirrors the operations.ts semantics (delete-then-insert, disposition carry).
class FakeStore implements WorkstationStore {
	readonly customers: CustomerRow[] = [];
	readonly matches = new Map<string, Map<string, ReviewRow>>();
	readonly settings = new Map<string, string>();
	#seq = 0;

	open(): Promise<number> {
		return Promise.resolve(1);
	}

	seedCustomer(row: CustomerRow): void {
		this.customers.push(row);
		this.matches.set(row.customer_id, new Map());
	}

	createCustomer(_payload: CreateCustomerPayload): Promise<CustomerRow> {
		throw new Error("not used");
	}

	listCustomers(): Promise<ReadonlyArray<CustomerRow>> {
		return Promise.resolve([...this.customers]);
	}

	getCustomer(customerId: string): Promise<CustomerRow | null> {
		return Promise.resolve(
			this.customers.find((c) => c.customer_id === customerId) ?? null,
		);
	}

	updateCustomer(_id: string, _patch: CustomerPatch): Promise<CustomerRow> {
		throw new Error("not used");
	}

	deleteCustomer(_id: string): Promise<void> {
		throw new Error("not used");
	}

	recordMatches(
		customerId: string,
		matches: ReadonlyArray<TieredMatch>,
	): Promise<ReadonlyArray<ReviewRow>> {
		const bucket = this.#bucket(customerId);
		for (const m of matches) {
			bucket.set(m.ofac_entity_id, this.#toRow(customerId, m, "PENDING"));
		}
		return Promise.resolve([...bucket.values()]);
	}

	replaceMatches(
		customerId: string,
		matches: ReadonlyArray<TieredMatch>,
	): Promise<ReadonlyArray<ReviewRow>> {
		const prior = this.#bucket(customerId);
		const next = new Map<string, ReviewRow>();
		for (const m of matches) {
			const before = prior.get(m.ofac_entity_id);
			const status = before?.resolution_status ?? "PENDING";
			const row = this.#toRow(customerId, m, status);
			next.set(m.ofac_entity_id, {
				...row,
				reviewer_id: before?.reviewer_id ?? null,
				review_notes: before?.review_notes ?? null,
			});
		}
		this.matches.set(customerId, next);
		return Promise.resolve([...next.values()]);
	}

	listReviewMatches(
		_filters: ReviewFilters,
	): Promise<ReadonlyArray<ReviewRow>> {
		const all: ReviewRow[] = [];
		for (const bucket of this.matches.values()) {
			all.push(...bucket.values());
		}
		return Promise.resolve(all);
	}

	resolveMatch(): Promise<ReviewRow> {
		throw new Error("not used");
	}

	getSetting(key: string): Promise<string | null> {
		return Promise.resolve(this.settings.get(key) ?? null);
	}

	setSetting(key: string, value: string): Promise<void> {
		this.settings.set(key, value);
		return Promise.resolve();
	}

	#bucket(customerId: string): Map<string, ReviewRow> {
		const bucket = this.matches.get(customerId);
		if (bucket === undefined) {
			throw new Error(`customer ${customerId} not found`);
		}
		return bucket;
	}

	#toRow(
		customerId: string,
		m: TieredMatch,
		status: ReviewRow["resolution_status"],
	): ReviewRow {
		this.#seq += 1;
		const customer = this.customers.find((c) => c.customer_id === customerId);
		return {
			match_id: `m-${this.#seq}`,
			ofac_entity_id: m.ofac_entity_id,
			tier: m.tier,
			match_score: m.score,
			resolution_status: status,
			reviewer_id: null,
			review_notes: null,
			detected_at: "2026-06-19T00:00:00.000Z",
			customer_id: customerId,
			customer_reference: customer?.customer_reference ?? "R",
			customer_name: customer?.name ?? "Ann",
			sanctioned_name: m.sanctioned_name,
			source_list: m.source_list,
			list_version: m.list_version,
			reasons: m.reasons,
			explanation: m.explanation,
		};
	}
}

function customerRow(id: string, name: string): CustomerRow {
	return {
		customer_id: id,
		customer_reference: `REF-${id}`,
		name,
		country: "RU",
		onboarding_status: "PENDING_REVIEW",
		kyc_risk_rating: null,
		id_documents: [],
		onboarded_by: "local",
		created_at: "2026-06-19T00:00:00.000Z",
		updated_at: "2026-06-19T00:00:00.000Z",
	};
}

function screenerFor(
	byName: Record<string, ReadonlyArray<Match>>,
): NameScreener {
	return {
		screen: vi.fn(
			async (query: ScreenQuery): Promise<ScreenResponse> => ({
				request_id: "req",
				matches: [...(byName[query.name] ?? [])],
				list_versions_used: { DEMO_SDN: "v" },
				execution_time_ms: 1,
			}),
		),
	};
}

describe("RescanService.syncWatchlist", () => {
	it("does NOT re-screen when the stored version equals the current version", async () => {
		const store = new FakeStore();
		store.seedCustomer(customerRow("c-1", "Ivan Fakovich"));
		await store.setSetting(LAST_SYNCED_VERSION_KEY, "v1");
		const screener = screenerFor({ "Ivan Fakovich": [makeMatch()] });
		const service = new RescanService(store, screener, 0.65);

		const result = await service.syncWatchlist("v1");

		expect(result.changed).toBe(false);
		expect(result.version).toBe("v1");
		expect(result.customersScanned).toBe(0);
		expect(screener.screen).not.toHaveBeenCalled();
	});

	it("re-screens every customer and persists the new version when it changed", async () => {
		const store = new FakeStore();
		store.seedCustomer(customerRow("c-1", "Ivan Fakovich"));
		store.seedCustomer(customerRow("c-2", "Anna Other"));
		await store.setSetting(LAST_SYNCED_VERSION_KEY, "v1");
		const screener = screenerFor({ "Ivan Fakovich": [makeMatch()] });
		const service = new RescanService(store, screener, 0.65);

		const result = await service.syncWatchlist("v2");

		expect(result.changed).toBe(true);
		expect(result.version).toBe("v2");
		expect(result.customersScanned).toBe(2);
		expect(screener.screen).toHaveBeenCalledTimes(2);
		expect(await store.getSetting(LAST_SYNCED_VERSION_KEY)).toBe("v2");
	});

	it("counts a newly-appearing match as a new hit", async () => {
		const store = new FakeStore();
		store.seedCustomer(customerRow("c-1", "Ivan Fakovich"));
		// No prior matches; the rescan surfaces one => one new hit.
		const screener = screenerFor({ "Ivan Fakovich": [makeMatch()] });
		const service = new RescanService(store, screener, 0.65);

		const result = await service.syncWatchlist("v1");

		expect(result.newHits).toBe(1);
		expect(result.clearedHits).toBe(0);
	});

	it("counts a vanished prior match as a cleared hit", async () => {
		const store = new FakeStore();
		store.seedCustomer(customerRow("c-1", "Ivan Fakovich"));
		await store.recordMatches("c-1", [
			tierMatch(makeMatch({ entity_id: "stale" }), 0.65),
		]);
		// The new watchlist no longer matches this customer at all.
		const screener = screenerFor({ "Ivan Fakovich": [] });
		const service = new RescanService(store, screener, 0.65);

		const result = await service.syncWatchlist("v2");

		expect(result.clearedHits).toBe(1);
		expect(result.newHits).toBe(0);
		expect(await store.listReviewMatches({})).toHaveLength(0);
	});
});

describe("RescanService.screenCustomer", () => {
	it("replaces only the target customer's matches", async () => {
		const store = new FakeStore();
		store.seedCustomer(customerRow("c-1", "Ivan Fakovich"));
		store.seedCustomer(customerRow("c-2", "Anna Other"));
		await store.recordMatches("c-2", [
			tierMatch(makeMatch({ entity_id: "other" }), 0.65),
		]);
		const screener = screenerFor({
			"Ivan Fakovich": [makeMatch({ entity_id: "new-one" })],
		});
		const service = new RescanService(store, screener, 0.65);

		const rows = await service.screenCustomer("c-1");

		expect(rows.map((r) => r.ofac_entity_id)).toEqual(["new-one"]);
		// c-2 untouched.
		const c2 = await store.listReviewMatches({});
		expect(c2.filter((r) => r.customer_id === "c-2")).toHaveLength(1);
	});

	it("throws for an unknown customer", async () => {
		const store = new FakeStore();
		const service = new RescanService(store, screenerFor({}), 0.65);
		await expect(service.screenCustomer("nope")).rejects.toThrow(/nope/);
	});
});
