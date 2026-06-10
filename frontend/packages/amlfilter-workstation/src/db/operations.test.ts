import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	DuplicateReferenceError,
	InvalidResolutionError,
	NotFoundError,
} from "../errors";
import type { TieredMatch } from "../types";
import {
	createCustomer,
	deleteCustomer,
	getCustomer,
	getSetting,
	listCustomers,
	listReviewMatches,
	recordMatches,
	resolveMatch,
	setSetting,
	updateCustomer,
} from "./operations";
import { migrate } from "./schema";
import { openMemoryDatabase, type SqlDatabase } from "./sqlite";

let db: SqlDatabase;

beforeEach(async () => {
	db = await openMemoryDatabase();
	migrate(db);
});

afterEach(() => {
	db.close();
});

describe("createCustomer", () => {
	it("persists the row with PENDING_REVIEW and local defaults", () => {
		const row = createCustomer(db, {
			customer_reference: "REF-001",
			name: "Ivan Fakovich",
			country: "RU",
		});
		// The backend onboarding service inserts PENDING_REVIEW, not the DRAFT
		// column default (customers/service.py:108).
		expect(row.onboarding_status).toBe("PENDING_REVIEW");
		expect(row.onboarded_by).toBe("local");
		expect(row.id_documents).toEqual([]);
		expect(row.kyc_risk_rating).toBeNull();
		expect(row.customer_id).toMatch(/[0-9a-f-]{36}/);
		expect(getCustomer(db, row.customer_id)).toEqual(row);
	});

	it("rejects a duplicate customer_reference with the typed error", () => {
		createCustomer(db, { customer_reference: "REF-001", name: "A" });
		// Mirrors customers/service.py:67–78 (_reject_duplicate_reference).
		expect(() =>
			createCustomer(db, { customer_reference: "REF-001", name: "B" }),
		).toThrow(DuplicateReferenceError);
		expect(listCustomers(db)).toHaveLength(1);
	});

	it("round-trips id_documents as structured data", () => {
		const docs = [
			{
				doc_type: "PASSPORT",
				number: "X1",
				issuing_country: "RU",
				expiry: null,
			},
		];
		const row = createCustomer(db, {
			customer_reference: "REF-002",
			name: "A",
			id_documents: docs,
		});
		expect(row.id_documents).toEqual(docs);
	});
});

describe("updateCustomer / deleteCustomer", () => {
	it("patches status and risk rating, bumping updated_at fields only", () => {
		const row = createCustomer(db, { customer_reference: "R", name: "A" });
		const updated = updateCustomer(db, row.customer_id, {
			onboarding_status: "ACTIVE",
			kyc_risk_rating: "HIGH",
		});
		expect(updated.onboarding_status).toBe("ACTIVE");
		expect(updated.kyc_risk_rating).toBe("HIGH");
		expect(updated.customer_reference).toBe("R");
	});

	it("rejects an update that steals another customer's reference", () => {
		createCustomer(db, { customer_reference: "R1", name: "A" });
		const second = createCustomer(db, { customer_reference: "R2", name: "B" });
		expect(() =>
			updateCustomer(db, second.customer_id, { customer_reference: "R1" }),
		).toThrow(DuplicateReferenceError);
	});

	it("throws NotFoundError for an unknown customer", () => {
		expect(() =>
			updateCustomer(db, "nope", { kyc_risk_rating: "LOW" }),
		).toThrow(NotFoundError);
	});

	it("deleteCustomer removes the row", () => {
		const row = createCustomer(db, { customer_reference: "R", name: "A" });
		deleteCustomer(db, row.customer_id);
		expect(getCustomer(db, row.customer_id)).toBeNull();
	});
});

function makeTiered(overrides: Partial<TieredMatch> = {}): TieredMatch {
	return {
		ofac_entity_id: "DEMO_SDN:0001",
		score: 0.91,
		tier: "STRONG",
		sanctioned_name: "Ivan Fakovich",
		source_list: "DEMO_SDN",
		list_version: "2026-05-01",
		reasons: [
			{
				signal: "name_vector",
				value: 0.91,
				weight: 0.55,
				contribution: 0.5,
				description: "Vector similarity",
			},
		],
		explanation: "Match due to: strong vector similarity",
		...overrides,
	};
}

describe("recordMatches", () => {
	it("creates rows as PENDING with the customer denormalized (match_tracker.py:127)", () => {
		const customer = createCustomer(db, {
			customer_reference: "R",
			name: "Ann",
		});
		const rows = recordMatches(db, customer.customer_id, [makeTiered()]);
		expect(rows).toHaveLength(1);
		const row = rows[0];
		if (row === undefined) throw new Error("row missing");
		expect(row.resolution_status).toBe("PENDING");
		expect(row.tier).toBe("STRONG");
		expect(row.customer_reference).toBe("R");
		expect(row.customer_name).toBe("Ann");
		expect(row.sanctioned_name).toBe("Ivan Fakovich");
		expect(row.reasons[0]?.signal).toBe("name_vector");
	});

	it("re-screen of an existing pair resets a resolved match to PENDING with the new score/tier (match_tracker.py:88–104)", () => {
		const customer = createCustomer(db, {
			customer_reference: "R",
			name: "Ann",
		});
		const [first] = recordMatches(db, customer.customer_id, [makeTiered()]);
		if (first === undefined) throw new Error("row missing");
		resolveMatch(db, first.match_id, "FALSE_POSITIVE", "alice", "noise");

		const [again] = recordMatches(db, customer.customer_id, [
			makeTiered({ score: 0.7, tier: "POSSIBLE" }),
		]);
		if (again === undefined) throw new Error("row missing");
		expect(again.match_id).toBe(first.match_id); // same pair, same row
		expect(again.resolution_status).toBe("PENDING");
		expect(again.match_score).toBe(0.7);
		expect(again.tier).toBe("POSSIBLE");
	});

	it("deleting the customer cascades its matches", () => {
		const customer = createCustomer(db, {
			customer_reference: "R",
			name: "Ann",
		});
		recordMatches(db, customer.customer_id, [makeTiered()]);
		deleteCustomer(db, customer.customer_id);
		expect(listReviewMatches(db, {})).toHaveLength(0);
	});
});

describe("listReviewMatches", () => {
	it("filters by tier and resolution status, strongest first (review.py:117–139)", () => {
		const customer = createCustomer(db, {
			customer_reference: "R",
			name: "Ann",
		});
		recordMatches(db, customer.customer_id, [
			makeTiered({ ofac_entity_id: "e-strong", score: 0.9, tier: "STRONG" }),
			makeTiered({ ofac_entity_id: "e-weak", score: 0.3, tier: "WEAK" }),
			makeTiered({
				ofac_entity_id: "e-possible",
				score: 0.7,
				tier: "POSSIBLE",
			}),
		]);
		const all = listReviewMatches(db, {});
		expect(all.map((r) => r.ofac_entity_id)).toEqual([
			"e-strong",
			"e-possible",
			"e-weak",
		]);
		expect(listReviewMatches(db, { tier: "STRONG" })).toHaveLength(1);

		const [strong] = listReviewMatches(db, { tier: "STRONG" });
		if (strong === undefined) throw new Error("row missing");
		resolveMatch(db, strong.match_id, "TRUE_POSITIVE");
		expect(listReviewMatches(db, { resolutionStatus: "PENDING" })).toHaveLength(
			2,
		);
	});
});

describe("resolveMatch", () => {
	it("applies resolution + reviewer + notes and stamps resolved_at", () => {
		const customer = createCustomer(db, {
			customer_reference: "R",
			name: "Ann",
		});
		const [row] = recordMatches(db, customer.customer_id, [makeTiered()]);
		if (row === undefined) throw new Error("row missing");
		const resolved = resolveMatch(
			db,
			row.match_id,
			"FALSE_POSITIVE",
			"alice",
			"noise",
		);
		expect(resolved.resolution_status).toBe("FALSE_POSITIVE");
		expect(resolved.reviewer_id).toBe("alice");
		expect(resolved.review_notes).toBe("noise");
	});

	it("re-resolution overwrites unconditionally — no PENDING-only guard (match_tracker.py:251–266)", () => {
		const customer = createCustomer(db, {
			customer_reference: "R",
			name: "Ann",
		});
		const [row] = recordMatches(db, customer.customer_id, [makeTiered()]);
		if (row === undefined) throw new Error("row missing");
		resolveMatch(db, row.match_id, "FALSE_POSITIVE", "alice", "noise");
		const flipped = resolveMatch(db, row.match_id, "TRUE_POSITIVE");
		expect(flipped.resolution_status).toBe("TRUE_POSITIVE");
		// reviewer/notes only overwritten when provided (the Python None-guard).
		expect(flipped.reviewer_id).toBe("alice");
		expect(flipped.review_notes).toBe("noise");
	});

	it("rejects values outside the API regex (review.py:148)", () => {
		const customer = createCustomer(db, {
			customer_reference: "R",
			name: "Ann",
		});
		const [row] = recordMatches(db, customer.customer_id, [makeTiered()]);
		if (row === undefined) throw new Error("row missing");
		expect(() => resolveMatch(db, row.match_id, "PENDING")).toThrow(
			InvalidResolutionError,
		);
		expect(() => resolveMatch(db, row.match_id, "nonsense")).toThrow(
			InvalidResolutionError,
		);
	});

	it("throws NotFoundError for an unknown match id", () => {
		expect(() => resolveMatch(db, "nope", "RESOLVED")).toThrow(NotFoundError);
	});
});

describe("settings", () => {
	it("returns null when unset, then round-trips and overwrites", () => {
		expect(getSetting(db, "analyst_name")).toBeNull();
		setSetting(db, "analyst_name", "Avery Analyst");
		expect(getSetting(db, "analyst_name")).toBe("Avery Analyst");
		setSetting(db, "analyst_name", "Blake");
		expect(getSetting(db, "analyst_name")).toBe("Blake");
	});
});

// Review-carryforward hardening (Task-4/5 reviews), beyond the plan text.

describe("recordMatches atomicity", () => {
	it("a mid-batch insert failure rolls back the whole match set", () => {
		const customer = createCustomer(db, {
			customer_reference: "R",
			name: "Ann",
		});
		// Fault injection: NOT NULL violation on the second row of the batch.
		const broken = makeTiered({
			ofac_entity_id: "e-broken",
			sanctioned_name: null as unknown as string,
		});
		expect(() =>
			recordMatches(db, customer.customer_id, [makeTiered(), broken]),
		).toThrow();
		// A partial screening write is a compliance hazard — all or nothing.
		expect(listReviewMatches(db, {})).toHaveLength(0);
	});
});

describe("createCustomer check-then-insert race", () => {
	it("maps a db-level UNIQUE reference violation to DuplicateReferenceError", () => {
		createCustomer(db, { customer_reference: "REF-RACE", name: "A" });
		// Simulate the race: the SELECT guard sees no row, yet the INSERT still
		// collides on the UNIQUE constraint (customers/service.py _persist_customer).
		const racy: SqlDatabase = {
			...db,
			selectObjects: (sql, bind) =>
				sql.includes("customer_reference = ?")
					? []
					: db.selectObjects(sql, bind),
		};
		expect(() =>
			createCustomer(racy, { customer_reference: "REF-RACE", name: "B" }),
		).toThrow(DuplicateReferenceError);
	});
});
