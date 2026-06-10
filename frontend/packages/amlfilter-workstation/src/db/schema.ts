// Schema v1 — mirrors the verified backend rows (spec §5 sketch) with the
// local deltas the page contracts force: no tenant_id (single implicit local
// tenant → uniqueness on customer_reference alone); name/country live on the
// customer (the server keeps them on the linked WHITELIST Entity, which has
// no local equivalent); kyc_matches carries sanctioned_name + source_list
// because the review board renders them and there is no local entity table
// to join (the only entity store is the read-only signed bundle).

import type { SqlDatabase } from "./sqlite";

export const SCHEMA_VERSION = 1;

const MIGRATION_V1: ReadonlyArray<string> = [
	`CREATE TABLE customers (
		customer_id        TEXT PRIMARY KEY,
		customer_reference TEXT NOT NULL UNIQUE,
		name               TEXT NOT NULL,
		country            TEXT,
		onboarding_status  TEXT NOT NULL DEFAULT 'DRAFT',
		kyc_risk_rating    TEXT,
		id_documents       TEXT NOT NULL DEFAULT '[]',
		onboarded_by       TEXT NOT NULL DEFAULT 'local',
		created_at         TEXT NOT NULL,
		updated_at         TEXT NOT NULL
	)`,
	`CREATE TABLE kyc_matches (
		match_id          TEXT PRIMARY KEY,
		customer_id       TEXT NOT NULL REFERENCES customers(customer_id) ON DELETE CASCADE,
		ofac_entity_id    TEXT NOT NULL,
		match_score       REAL NOT NULL,
		match_tier        TEXT NOT NULL,
		list_version      TEXT,
		sanctioned_name   TEXT NOT NULL,
		source_list       TEXT NOT NULL,
		reasons           TEXT NOT NULL,
		explanation       TEXT NOT NULL,
		detected_at       TEXT NOT NULL,
		resolution_status TEXT NOT NULL DEFAULT 'PENDING',
		resolved_at       TEXT,
		reviewer_id       TEXT,
		review_notes      TEXT,
		UNIQUE (customer_id, ofac_entity_id)
	)`,
	"CREATE INDEX idx_kyc_matches_review ON kyc_matches (resolution_status, match_tier)",
	"CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
];

function currentVersion(db: SqlDatabase): number {
	db.exec(
		`CREATE TABLE IF NOT EXISTS schema_migrations (
			version INTEGER PRIMARY KEY,
			applied_at TEXT NOT NULL
		)`,
	);
	const rows = db.selectObjects(
		"SELECT MAX(version) AS v FROM schema_migrations",
	);
	const v = rows[0]?.v;
	return typeof v === "number" ? v : 0;
}

/** Bring the database to schema HEAD; per-connection pragmas included. */
export function migrate(db: SqlDatabase): number {
	db.exec("PRAGMA foreign_keys = ON");
	if (currentVersion(db) < 1) {
		for (const sql of MIGRATION_V1) {
			db.exec(sql);
		}
		db.exec(
			"INSERT INTO schema_migrations (version, applied_at) VALUES (1, ?)",
			[new Date().toISOString()],
		);
	}
	return SCHEMA_VERSION;
}
