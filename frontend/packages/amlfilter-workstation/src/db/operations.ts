// Pure SQL operations over the SqlDatabase facade — the worker dispatches one
// RPC kind to one function here. Semantics are PORTS of the observed backend
// contract, cited per function. Tested against real in-memory SQLite.

import {
	DuplicateReferenceError,
	InvalidResolutionError,
	NotFoundError,
} from "../errors";
import type {
	CreateCustomerPayload,
	CustomerPatch,
	CustomerRow,
	IdDocument,
	MatchTier,
	ResolutionStatus,
	ReviewFilters,
	ReviewRow,
	TieredMatch,
} from "../types";
import type { SqlDatabase, SqlValue } from "./sqlite";

function nowIso(): string {
	return new Date().toISOString();
}

function asString(value: SqlValue | undefined): string {
	if (typeof value !== "string") {
		throw new Error(`expected string column, got ${typeof value}`);
	}
	return value;
}

function asNullableString(value: SqlValue | undefined): string | null {
	return typeof value === "string" ? value : null;
}

function asNumber(value: SqlValue | undefined): number {
	if (typeof value !== "number") {
		throw new Error(`expected numeric column, got ${typeof value}`);
	}
	return value;
}

function toCustomerRow(record: Record<string, SqlValue>): CustomerRow {
	return {
		customer_id: asString(record.customer_id),
		customer_reference: asString(record.customer_reference),
		name: asString(record.name),
		country: asNullableString(record.country),
		onboarding_status: asString(record.onboarding_status),
		kyc_risk_rating: asNullableString(record.kyc_risk_rating),
		id_documents: JSON.parse(asString(record.id_documents)) as IdDocument[],
		onboarded_by: asString(record.onboarded_by),
		created_at: asString(record.created_at),
		updated_at: asString(record.updated_at),
	};
}

function assertReferenceFree(db: SqlDatabase, reference: string): void {
	const existing = db.selectObjects(
		"SELECT customer_id FROM customers WHERE customer_reference = ?",
		[reference],
	);
	if (existing.length > 0) {
		// Same message shape as customers/service.py:76–78.
		throw new DuplicateReferenceError(
			`customer_reference '${reference}' already exists`,
		);
	}
}

function isUniqueReferenceViolation(error: unknown): boolean {
	return (
		error instanceof Error &&
		error.message.includes(
			"UNIQUE constraint failed: customers.customer_reference",
		)
	);
}

function requireCustomer(db: SqlDatabase, customerId: string): CustomerRow {
	const row = getCustomer(db, customerId);
	if (row === null) {
		throw new NotFoundError(`customer ${customerId} not found`);
	}
	return row;
}

/** Insert a customer; PENDING_REVIEW on create (customers/service.py:108). */
export function createCustomer(
	db: SqlDatabase,
	payload: CreateCustomerPayload,
): CustomerRow {
	assertReferenceFree(db, payload.customer_reference);
	const now = nowIso();
	const customerId = crypto.randomUUID();
	try {
		db.exec(
			`INSERT INTO customers (customer_id, customer_reference, name, country,
			   onboarding_status, kyc_risk_rating, id_documents, onboarded_by, created_at, updated_at)
			 VALUES (?, ?, ?, ?, 'PENDING_REVIEW', NULL, ?, ?, ?, ?)`,
			[
				customerId,
				payload.customer_reference,
				payload.name,
				payload.country ?? null,
				JSON.stringify(payload.id_documents ?? []),
				payload.onboarded_by ?? "local",
				now,
				now,
			],
		);
	} catch (error) {
		// Check-then-insert race: keep the typed contract even when the SELECT
		// guard missed — same mapping as customers/service.py _persist_customer.
		if (isUniqueReferenceViolation(error)) {
			throw new DuplicateReferenceError(
				`customer_reference '${payload.customer_reference}' already exists`,
			);
		}
		throw error;
	}
	return requireCustomer(db, customerId);
}

export function listCustomers(db: SqlDatabase): CustomerRow[] {
	return db
		.selectObjects(
			"SELECT * FROM customers ORDER BY created_at DESC, customer_id DESC",
		)
		.map(toCustomerRow);
}

export function getCustomer(
	db: SqlDatabase,
	customerId: string,
): CustomerRow | null {
	const rows = db.selectObjects(
		"SELECT * FROM customers WHERE customer_id = ?",
		[customerId],
	);
	const first = rows[0];
	return first === undefined ? null : toCustomerRow(first);
}

export function updateCustomer(
	db: SqlDatabase,
	customerId: string,
	patch: CustomerPatch,
): CustomerRow {
	const existing = requireCustomer(db, customerId);
	if (
		patch.customer_reference !== undefined &&
		patch.customer_reference !== existing.customer_reference
	) {
		assertReferenceFree(db, patch.customer_reference);
	}
	// The COALESCE patch is intentionally additive — it cannot null-out a set column.
	db.exec(
		`UPDATE customers SET
		   onboarding_status  = COALESCE(?, onboarding_status),
		   kyc_risk_rating    = COALESCE(?, kyc_risk_rating),
		   customer_reference = COALESCE(?, customer_reference),
		   updated_at         = ?
		 WHERE customer_id = ?`,
		[
			patch.onboarding_status ?? null,
			patch.kyc_risk_rating ?? null,
			patch.customer_reference ?? null,
			nowIso(),
			customerId,
		],
	);
	return requireCustomer(db, customerId);
}

export function deleteCustomer(db: SqlDatabase, customerId: string): void {
	requireCustomer(db, customerId);
	db.exec("DELETE FROM customers WHERE customer_id = ?", [customerId]);
}

// Mirrors the validation the server applies at api/v1/review.py:148.
const RESOLUTION_PATTERN = /^(FALSE_POSITIVE|TRUE_POSITIVE|RESOLVED)$/;

const REVIEW_SELECT = `
	SELECT m.match_id, m.ofac_entity_id, m.match_score, m.match_tier,
	       m.resolution_status, m.reviewer_id, m.review_notes, m.detected_at,
	       m.reasons, m.explanation, m.sanctioned_name, m.source_list,
	       m.list_version,
	       c.customer_id AS customer_id,
	       c.customer_reference AS customer_reference,
	       c.name AS customer_name
	FROM kyc_matches m
	JOIN customers c ON c.customer_id = m.customer_id`;

function toReviewRow(record: Record<string, SqlValue>): ReviewRow {
	return {
		match_id: asString(record.match_id),
		ofac_entity_id: asString(record.ofac_entity_id),
		tier: asString(record.match_tier) as MatchTier,
		match_score: asNumber(record.match_score),
		resolution_status: asString(record.resolution_status) as ResolutionStatus,
		reviewer_id: asNullableString(record.reviewer_id),
		review_notes: asNullableString(record.review_notes),
		detected_at: asString(record.detected_at),
		customer_id: asString(record.customer_id),
		customer_reference: asString(record.customer_reference),
		customer_name: asString(record.customer_name),
		sanctioned_name: asString(record.sanctioned_name),
		source_list: asString(record.source_list),
		list_version: asNullableString(record.list_version),
		reasons: JSON.parse(asString(record.reasons)) as ReviewRow["reasons"],
		explanation: asString(record.explanation),
	};
}

/**
 * Upsert screened matches for a customer. New pairs start PENDING
 * (match_tracker.py:127); an existing pair is refreshed with the new
 * score/tier and RESET to PENDING even if previously resolved
 * (match_tracker.py:88–104). Returns the affected rows as review rows.
 */
export function recordMatches(
	db: SqlDatabase,
	customerId: string,
	matches: ReadonlyArray<TieredMatch>,
): ReviewRow[] {
	requireCustomer(db, customerId);
	const detectedAt = nowIso();
	// One screening = one atomic write: a partially persisted match set is a
	// compliance hazard, so a mid-batch failure rolls back the whole set.
	db.transaction(() => {
		for (const match of matches) {
			db.exec(
				`INSERT INTO kyc_matches (match_id, customer_id, ofac_entity_id, match_score,
			   match_tier, list_version, sanctioned_name, source_list, reasons,
			   explanation, detected_at, resolution_status)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')
			 ON CONFLICT (customer_id, ofac_entity_id) DO UPDATE SET
			   match_score = excluded.match_score,
			   match_tier = excluded.match_tier,
			   list_version = excluded.list_version,
			   sanctioned_name = excluded.sanctioned_name,
			   source_list = excluded.source_list,
			   reasons = excluded.reasons,
			   explanation = excluded.explanation,
			   detected_at = excluded.detected_at,
			   resolution_status = 'PENDING'`,
				[
					crypto.randomUUID(),
					customerId,
					match.ofac_entity_id,
					match.score,
					match.tier,
					match.list_version,
					match.sanctioned_name,
					match.source_list,
					JSON.stringify(match.reasons),
					match.explanation,
					detectedAt,
				],
			);
		}
	});
	// Re-read scoped to the customer (no board pagination): the LIMIT 100
	// board query would truncate fresh lower-scored rows out of the return.
	const ids = new Set(matches.map((m) => m.ofac_entity_id));
	return db
		.selectObjects(
			`${REVIEW_SELECT} WHERE m.customer_id = ? ORDER BY m.match_score DESC`,
			[customerId],
		)
		.map(toReviewRow)
		.filter((row) => ids.has(row.ofac_entity_id));
}

/** Review-board rows: a plain JOIN suffices locally (no entity fan-out). */
export function listReviewMatches(
	db: SqlDatabase,
	filters: ReviewFilters,
): ReviewRow[] {
	const clauses: string[] = [];
	const bind: SqlValue[] = [];
	if (filters.tier !== undefined) {
		clauses.push("m.match_tier = ?");
		bind.push(filters.tier);
	}
	if (filters.resolutionStatus !== undefined) {
		clauses.push("m.resolution_status = ?");
		bind.push(filters.resolutionStatus);
	}
	const where = clauses.length > 0 ? ` WHERE ${clauses.join(" AND ")}` : "";
	// Strongest first, paginated — mirrors review.py:139.
	bind.push(filters.limit ?? 100, filters.offset ?? 0);
	return db
		.selectObjects(
			`${REVIEW_SELECT}${where} ORDER BY m.match_score DESC LIMIT ? OFFSET ?`,
			bind,
		)
		.map(toReviewRow);
}

function reviewRowById(db: SqlDatabase, matchId: string): ReviewRow {
	const rows = db
		.selectObjects(`${REVIEW_SELECT} WHERE m.match_id = ?`, [matchId])
		.map(toReviewRow);
	const first = rows[0];
	if (first === undefined) {
		throw new NotFoundError(`match ${matchId} not found`);
	}
	return first;
}

/**
 * Resolve a match — the OBSERVED backend contract, ported as-is:
 * regex-validated resolution (review.py:148), unconditional overwrite of
 * status + resolved_at, reviewer/notes only overwritten when provided
 * (match_tracker.py:251–266). No PENDING-only transition guard exists
 * on either side.
 */
export function resolveMatch(
	db: SqlDatabase,
	matchId: string,
	resolution: string,
	reviewerId?: string,
	notes?: string,
): ReviewRow {
	if (!RESOLUTION_PATTERN.test(resolution)) {
		throw new InvalidResolutionError(
			`invalid resolution_status '${resolution}'`,
		);
	}
	reviewRowById(db, matchId);
	db.exec(
		`UPDATE kyc_matches SET
		   resolution_status = ?,
		   resolved_at = ?,
		   reviewer_id = COALESCE(?, reviewer_id),
		   review_notes = COALESCE(?, review_notes)
		 WHERE match_id = ?`,
		[resolution, nowIso(), reviewerId ?? null, notes ?? null, matchId],
	);
	return reviewRowById(db, matchId);
}

export function getSetting(db: SqlDatabase, key: string): string | null {
	const rows = db.selectObjects("SELECT value FROM settings WHERE key = ?", [
		key,
	]);
	return asNullableString(rows[0]?.value);
}

export function setSetting(db: SqlDatabase, key: string, value: string): void {
	db.exec(
		"INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
		[key, value],
	);
}
