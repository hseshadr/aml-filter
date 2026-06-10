// Pure SQL operations over the SqlDatabase facade — the worker dispatches one
// RPC kind to one function here. Semantics are PORTS of the observed backend
// contract, cited per function. Tested against real in-memory SQLite.

import { DuplicateReferenceError, NotFoundError } from "../errors";
import type {
	CreateCustomerPayload,
	CustomerPatch,
	CustomerRow,
	IdDocument,
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
