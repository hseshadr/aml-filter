// The `match_events` audit trail claims to be append-only. This file is the
// guard for that claim, and it tests the STORAGE ENGINE, not the application.
//
// Why that distinction is the whole point: every write in operations.ts happens
// to be an INSERT, but "the code we wrote today only inserts" is discipline, not
// enforcement. If SQLite accepts an UPDATE, the claim is false the moment anyone
// adds a code path — or opens a console — that issues one. So each test here
// fires raw SQL straight at the database, bypassing operations.ts entirely.
//
// Every refusal test also asserts the row is UNCHANGED afterwards. A statement
// that silently matches zero rows would "not throw" just like a refusal does;
// only reading the row back tells the two apart.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { TieredMatch } from "../types";
import {
	createCustomer,
	deleteCustomer,
	getMatchEvents,
	recordMatches,
	resolveMatch,
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
		material_fingerprint: "fp-default",
		...overrides,
	};
}

/** A customer with one match, dispositioned — so the ledger holds a real
 *  DETECTED + DISPOSITIONED trail with a reviewer's name and notes on it. */
function seedDispositionedMatch(): {
	customerId: string;
	matchId: string;
	eventId: string;
} {
	const customer = createCustomer(db, {
		customer_reference: "REF-AUDIT",
		name: "Ivan Fakovich",
	});
	const [match] = recordMatches(db, customer.customer_id, [makeTiered()]);
	if (match === undefined) throw new Error("match missing");
	resolveMatch(
		db,
		match.match_id,
		"TRUE_POSITIVE",
		"alice@example.test",
		"Confirmed against passport",
	);
	const events = getMatchEvents(db, match.match_id);
	const dispositioned = events.find((e) => e.event_type === "DISPOSITIONED");
	if (dispositioned === undefined) throw new Error("event missing");
	return {
		customerId: customer.customer_id,
		matchId: match.match_id,
		eventId: dispositioned.event_id,
	};
}

/** Read one raw ledger row back, so a refusal can be told apart from a no-op. */
function rawEvent(eventId: string): Record<string, unknown> | undefined {
	return db.selectObjects("SELECT * FROM match_events WHERE event_id = ?", [
		eventId,
	])[0];
}

describe("match_events is append-only — the database refuses UPDATE", () => {
	it("refuses to rewrite a disposition, leaving the row byte-for-byte unchanged", () => {
		const { eventId } = seedDispositionedMatch();
		const before = rawEvent(eventId);

		expect(() =>
			db.exec("UPDATE match_events SET to_status = ? WHERE event_id = ?", [
				"FALSE_POSITIVE",
				eventId,
			]),
		).toThrow(/append-only/i);

		// Not merely "no exception surfaced" — the row must still say TRUE_POSITIVE.
		expect(rawEvent(eventId)).toEqual(before);
		expect(rawEvent(eventId)?.to_status).toBe("TRUE_POSITIVE");
	});

	it("refuses to launder the reviewer's identity off an event", () => {
		const { eventId } = seedDispositionedMatch();

		expect(() =>
			db.exec("UPDATE match_events SET reviewer_id = NULL, notes = NULL", []),
		).toThrow(/append-only/i);

		expect(rawEvent(eventId)?.reviewer_id).toBe("alice@example.test");
		expect(rawEvent(eventId)?.notes).toBe("Confirmed against passport");
	});

	it("refuses to backdate an event's timestamp", () => {
		const { eventId } = seedDispositionedMatch();
		const before = rawEvent(eventId)?.at;

		expect(() =>
			db.exec("UPDATE match_events SET at = ? WHERE event_id = ?", [
				"1999-01-01T00:00:00.000Z",
				eventId,
			]),
		).toThrow(/append-only/i);

		expect(rawEvent(eventId)?.at).toBe(before);
	});

	it("refuses an INSERT OR REPLACE that would overwrite an existing event", () => {
		// REPLACE resolves a PK conflict by DELETEing the old row first. SQLite only
		// fires DELETE triggers for that implicit delete when recursive_triggers is
		// ON — so without that pragma this is a silent hole straight through the
		// guard: the old row vanishes and a forged one takes its event_id.
		const { customerId, eventId } = seedDispositionedMatch();
		const before = rawEvent(eventId);

		expect(() =>
			db.exec(
				`INSERT OR REPLACE INTO match_events
				   (event_id, match_id, customer_id, ofac_entity_id, event_type,
				    from_status, to_status, reviewer_id, notes, at)
				 VALUES (?, NULL, ?, 'DEMO_SDN:0001', 'DISPOSITIONED',
				    'PENDING', 'FALSE_POSITIVE', 'mallory', 'forged', '1999-01-01T00:00:00.000Z')`,
				[eventId, customerId],
			),
		).toThrow(/append-only/i);

		expect(rawEvent(eventId)).toEqual(before);
	});
});

describe("match_events is append-only — the database refuses DELETE", () => {
	it("refuses to erase a single event while its customer is still on the books", () => {
		const { eventId } = seedDispositionedMatch();

		expect(() =>
			db.exec("DELETE FROM match_events WHERE event_id = ?", [eventId]),
		).toThrow(/append-only/i);

		expect(rawEvent(eventId)).toBeDefined();
	});

	it("refuses to truncate the whole ledger", () => {
		const { matchId } = seedDispositionedMatch();
		const before = getMatchEvents(db, matchId).length;
		expect(before).toBeGreaterThan(0);

		expect(() => db.exec("DELETE FROM match_events", [])).toThrow(
			/append-only/i,
		);

		expect(getMatchEvents(db, matchId)).toHaveLength(before);
	});
});

describe("match_events is append-only — appends and the erasure path still work", () => {
	it("still accepts new events, so the guard is append-ONLY and not simply broken", () => {
		const { matchId } = seedDispositionedMatch();
		const before = getMatchEvents(db, matchId).length;

		// Changing one's mind about a match is an APPEND, never an edit: the
		// original TRUE_POSITIVE event stays on the record and the correction is
		// added after it. That is the whole point of an append-only trail.
		resolveMatch(
			db,
			matchId,
			"FALSE_POSITIVE",
			"bob@example.test",
			"Corrected",
		);

		const after = getMatchEvents(db, matchId);
		expect(after.length).toBe(before + 1);
		expect(after.at(-1)?.to_status).toBe("FALSE_POSITIVE");
		// The superseded decision is still readable — it was not overwritten.
		expect(after.map((e) => e.to_status)).toContain("TRUE_POSITIVE");
	});

	it("accepts a direct INSERT of a well-formed event", () => {
		const { customerId } = seedDispositionedMatch();

		expect(() =>
			db.exec(
				`INSERT INTO match_events
				   (event_id, match_id, customer_id, ofac_entity_id, event_type,
				    from_status, to_status, reviewer_id, notes, at)
				 VALUES ('ev-new', NULL, ?, 'DEMO_SDN:0001', 'SUPPRESSED',
				    NULL, NULL, NULL, NULL, '2026-01-01T00:00:00.000Z')`,
				[customerId],
			),
		).not.toThrow();

		expect(rawEvent("ev-new")).toBeDefined();
	});

	it("still lets the privacy boundary erase a deleted customer's whole trail", () => {
		// Customer deletion is the one sanctioned removal: it is all-or-nothing and
		// it destroys the customer too. The guard must not break the right to erasure.
		const { customerId, matchId } = seedDispositionedMatch();
		expect(getMatchEvents(db, matchId)).not.toHaveLength(0);

		deleteCustomer(db, customerId);

		expect(
			db.selectObjects("SELECT * FROM match_events WHERE customer_id = ?", [
				customerId,
			]),
		).toEqual([]);
	});
});
