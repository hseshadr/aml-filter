import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openMemoryDatabase, type SqlDatabase } from "./sqlite";

describe("sqlite facade transactions", () => {
	let db: SqlDatabase;

	beforeEach(async () => {
		db = await openMemoryDatabase();
		db.exec("CREATE TABLE t (id TEXT PRIMARY KEY)");
	});

	afterEach(() => {
		db.close();
	});

	it("rolls back every write when a statement inside the transaction throws", () => {
		expect(() =>
			db.transaction(() => {
				db.exec("INSERT INTO t (id) VALUES ('a')");
				db.exec("INSERT INTO t (id) VALUES ('a')"); // PK violation
			}),
		).toThrow(/UNIQUE/i);
		const rows = db.selectObjects("SELECT COUNT(*) AS n FROM t");
		expect(rows[0]?.n).toBe(0);
	});

	it("commits all writes when the transaction body succeeds", () => {
		db.transaction(() => {
			db.exec("INSERT INTO t (id) VALUES ('a')");
			db.exec("INSERT INTO t (id) VALUES ('b')");
		});
		const rows = db.selectObjects("SELECT COUNT(*) AS n FROM t");
		expect(rows[0]?.n).toBe(2);
	});
});
