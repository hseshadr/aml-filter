import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DuplicateReferenceError, NotFoundError } from "../errors";
import {
	createCustomer,
	deleteCustomer,
	getCustomer,
	listCustomers,
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
