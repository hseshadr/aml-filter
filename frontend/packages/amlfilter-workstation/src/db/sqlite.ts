// SQLite access facade over the OFFICIAL @sqlite.org/sqlite-wasm build. The
// worker opens the opfs-sahpool database (persistent, no COOP/COEP needed);
// unit tests open ":memory:" through the SAME build, so the SQL under test is
// the SQL that ships. The module's own TS types are loose in places, so this
// file is the single typed boundary (structural interfaces + one cast).

import sqlite3InitModule from "@sqlite.org/sqlite-wasm";

export type SqlValue = string | number | null;

/** The narrow database surface the rest of the package consumes. */
export interface SqlDatabase {
	exec(sql: string, bind?: ReadonlyArray<SqlValue>): void;
	selectObjects(
		sql: string,
		bind?: ReadonlyArray<SqlValue>,
	): Array<Record<string, SqlValue>>;
	close(): void;
}

interface Oo1Db {
	exec(opts: { sql: string; bind?: SqlValue[] }): unknown;
	selectObjects(
		sql: string,
		bind?: SqlValue[],
	): Array<Record<string, SqlValue>>;
	close(): void;
}

interface SqliteModule {
	readonly oo1: { readonly DB: new (filename: string) => Oo1Db };
	installOpfsSAHPoolVfs(opts: { name: string }): Promise<SahPoolUtil>;
}

/** The sahpool utility — exposes the persistent OPFS-backed DB constructor. */
export interface SahPoolUtil {
	readonly OpfsSAHPoolDb: new (filename: string) => Oo1Db;
}

/**
 * The published .d.mts intentionally declares init() with NO parameters
 * (sqlite-wasm PR #129), but the Emscripten factory accepts a module config
 * at runtime — so the one cast lives here, on the init function.
 */
type SqliteInit = (opts?: {
	print?: (...args: ReadonlyArray<unknown>) => void;
	printErr?: (...args: ReadonlyArray<unknown>) => void;
}) => Promise<SqliteModule>;

async function loadSqlite(): Promise<SqliteModule> {
	const init = sqlite3InitModule as unknown as SqliteInit;
	return init({
		print: () => undefined,
		printErr: () => undefined,
	});
}

function wrapDb(db: Oo1Db): SqlDatabase {
	return {
		exec: (sql, bind) => {
			db.exec({ sql, bind: bind === undefined ? undefined : [...bind] });
		},
		selectObjects: (sql, bind) =>
			db.selectObjects(sql, bind === undefined ? undefined : [...bind]),
		close: () => db.close(),
	};
}

/** An in-memory database — the unit-test seam (Node-safe, no OPFS). */
export async function openMemoryDatabase(): Promise<SqlDatabase> {
	const sqlite3 = await loadSqlite();
	return wrapDb(new sqlite3.oo1.DB(":memory:"));
}

/**
 * The persistent opfs-sahpool database — worker-only (sync access handles).
 * Rejects when another tab already holds the handle pool; callers surface
 * that as a clear "already open in another tab" message.
 */
export async function openPersistentDatabase(
	poolName: string,
	filename: string,
): Promise<SqlDatabase> {
	const sqlite3 = await loadSqlite();
	const pool = await sqlite3.installOpfsSAHPoolVfs({ name: poolName });
	return wrapDb(new pool.OpfsSAHPoolDb(filename));
}
