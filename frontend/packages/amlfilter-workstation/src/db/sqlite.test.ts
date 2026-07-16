import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	configurePersistentPrivacy,
	openMemoryDatabase,
	type SqlDatabase,
} from "./sqlite";

function pragmaDatabase(
	journalMode: string = "delete",
	secureDelete: number = 1,
): { readonly db: SqlDatabase; readonly executed: string[] } {
	const executed: string[] = [];
	return {
		executed,
		db: {
			exec: (sql) => executed.push(sql),
			selectObjects: (sql) => {
				executed.push(sql);
				return sql.includes("journal_mode")
					? [{ journal_mode: journalMode }]
					: [{ secure_delete: secureDelete }];
			},
			transaction: (fn) => fn(),
			close: () => undefined,
		},
	};
}

describe("persistent privacy pragmas", () => {
	it("enables secure deletion, truncates legacy WAL, and requires DELETE journaling", () => {
		const { db, executed } = pragmaDatabase();
		configurePersistentPrivacy(db);
		expect(executed).toEqual([
			"PRAGMA secure_delete = ON",
			"PRAGMA wal_checkpoint(TRUNCATE)",
			"PRAGMA journal_mode = DELETE",
			"PRAGMA secure_delete",
		]);
	});

	it.each([
		["wal", 1, /journal mode.*wal/i],
		["delete", 0, /secure_delete.*not enabled/i],
	])("fails closed for mode=%s secure_delete=%s", (mode, secure, message) => {
		const { db } = pragmaDatabase(mode as string, secure as number);
		expect(() => configurePersistentPrivacy(db)).toThrow(message as RegExp);
	});
});

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
