import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrate, SCHEMA_VERSION } from "./schema";
import { openMemoryDatabase, type SqlDatabase } from "./sqlite";

/** Stand up a v1-shaped DB by hand and record it as version 1 in the ledger, so
 *  migrate() sees current=1 and applies only the additive v2 step. This is the
 *  frozen v1 DDL — it intentionally lacks the v2 columns/table. */
function seedV1(db: SqlDatabase): void {
	db.exec("PRAGMA foreign_keys = ON");
	db.exec(
		`CREATE TABLE customers (
			customer_id TEXT PRIMARY KEY, customer_reference TEXT NOT NULL UNIQUE,
			name TEXT NOT NULL, country TEXT,
			onboarding_status TEXT NOT NULL DEFAULT 'DRAFT', kyc_risk_rating TEXT,
			id_documents TEXT NOT NULL DEFAULT '[]', onboarded_by TEXT NOT NULL DEFAULT 'local',
			created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
	);
	db.exec(
		`CREATE TABLE kyc_matches (
			match_id TEXT PRIMARY KEY,
			customer_id TEXT NOT NULL REFERENCES customers(customer_id) ON DELETE CASCADE,
			ofac_entity_id TEXT NOT NULL, match_score REAL NOT NULL, match_tier TEXT NOT NULL,
			list_version TEXT, sanctioned_name TEXT NOT NULL, source_list TEXT NOT NULL,
			reasons TEXT NOT NULL, explanation TEXT NOT NULL, detected_at TEXT NOT NULL,
			resolution_status TEXT NOT NULL DEFAULT 'PENDING', resolved_at TEXT,
			reviewer_id TEXT, review_notes TEXT, UNIQUE (customer_id, ofac_entity_id))`,
	);
	db.exec("CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
	db.exec(
		`CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)`,
	);
	db.exec(
		"INSERT INTO schema_migrations (version, applied_at) VALUES (1, 't')",
	);
}

describe("schema migrations", () => {
	let db: SqlDatabase;

	beforeEach(async () => {
		db = await openMemoryDatabase();
	});

	afterEach(() => {
		db.close();
	});

	it("creates schema v1 (customers, kyc_matches, settings)", () => {
		expect(migrate(db)).toBe(SCHEMA_VERSION);
		const names = db
			.selectObjects(
				"SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name",
			)
			.map((row) => row.name);
		expect(names).toContain("customers");
		expect(names).toContain("kyc_matches");
		expect(names).toContain("settings");
		expect(names).toContain("schema_migrations");
	});

	it("is idempotent — a second migrate is a no-op", () => {
		migrate(db);
		expect(migrate(db)).toBe(SCHEMA_VERSION);
		// One row per applied version (v1 + v2); a second migrate adds none.
		const rows = db.selectObjects(
			"SELECT COUNT(*) AS n FROM schema_migrations",
		);
		expect(rows[0]?.n).toBe(SCHEMA_VERSION);
	});

	it("applies v2 — review-state columns, match_events, and its indexes", () => {
		expect(migrate(db)).toBe(2);
		const columns = db
			.selectObjects("SELECT name FROM pragma_table_info('kyc_matches')")
			.map((row) => row.name);
		expect(columns).toContain("material_fingerprint");
		expect(columns).toContain("review_state");
		const tables = db
			.selectObjects(
				"SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name",
			)
			.map((row) => row.name);
		expect(tables).toContain("match_events");
		const indexes = db
			.selectObjects(
				"SELECT name FROM sqlite_schema WHERE type = 'index' ORDER BY name",
			)
			.map((row) => row.name);
		expect(indexes).toContain("idx_match_events_match");
		expect(indexes).toContain("idx_match_events_entity");
	});

	it("upgrades a v1-shaped DB additively, preserving existing rows", () => {
		// Stand up a v1 DB by hand (the frozen v1 DDL), seed a customer + match,
		// then migrate to HEAD and assert the new columns backfilled with the
		// documented defaults and the pre-existing row survived.
		seedV1(db);
		db.exec(
			`INSERT INTO customers (customer_id, customer_reference, name, created_at, updated_at)
			 VALUES ('c1', 'REF-1', 'Ivan', 't', 't')`,
		);
		db.exec(
			`INSERT INTO kyc_matches (match_id, customer_id, ofac_entity_id, match_score,
			   match_tier, sanctioned_name, source_list, reasons, explanation, detected_at)
			 VALUES ('m1', 'c1', 'e1', 0.9, 'STRONG', 'X', 'OFAC_SDN', '[]', 'x', 't')`,
		);
		expect(migrate(db)).toBe(2);
		const rows = db.selectObjects(
			"SELECT match_id, review_state, material_fingerprint FROM kyc_matches WHERE match_id = 'm1'",
		);
		expect(rows[0]?.review_state).toBe("CURRENT");
		expect(rows[0]?.material_fingerprint).toBeNull();
	});

	it("enforces foreign keys — a match for an unknown customer is rejected", () => {
		migrate(db);
		expect(() =>
			db.exec(
				`INSERT INTO kyc_matches (match_id, customer_id, ofac_entity_id, match_score,
				   match_tier, sanctioned_name, source_list, reasons, explanation, detected_at)
				 VALUES ('m1', 'missing', 'e1', 0.9, 'STRONG', 'X', 'OFAC_SDN', '[]', 'x', 't')`,
			),
		).toThrow(/FOREIGN KEY/i);
	});
});
