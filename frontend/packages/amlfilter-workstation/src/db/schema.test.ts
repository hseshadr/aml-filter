import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrate, SCHEMA_VERSION } from "./schema";
import { openMemoryDatabase, type SqlDatabase } from "./sqlite";

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
		const rows = db.selectObjects(
			"SELECT COUNT(*) AS n FROM schema_migrations",
		);
		expect(rows[0]?.n).toBe(1);
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
