// The frozen corpus fixture: a committed snapshot of the OFAC SDN feed, stored
// as gzipped JSONL of the publisher's own `SourceLine` shape.
//
// WHY FROZEN, AND NOT THE LIVE FEED: a gate whose input changes daily is not a
// ratchet. OFAC republishes constantly; measuring against the live list would
// mean a recall number that moves when nothing in this repository changed, and a
// failure nobody could reproduce. The fixture is a dated snapshot with its
// source URL and byte hash recorded next to it, refreshed deliberately by
// running buildRecallFixtureMain.ts — never implicitly.
//
// WHY TEXT AND NOT VECTORS: the 19,181 float32 embeddings are ~29 MB. The names
// they are computed FROM are ~480 KB gzipped, and re-embedding them takes about
// eleven seconds. Storing the text and recomputing the vectors is both smaller
// and stricter: the gate then exercises the real embedder and the real index
// build, so a regression in either is visible to it.

import { createHash } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import type { SourceLine } from "../sources/source.ts";

/** Where a fixture came from, so the number can be traced to its data. */
export interface FixtureProvenance {
	readonly listId: string;
	/** The upstream URL the snapshot was taken from. */
	readonly sourceUrl: string;
	/** When the snapshot was taken (ISO-8601). */
	readonly fetchedAt: string;
	/** SHA-256 of the raw upstream bytes, before parsing. */
	readonly sourceSha256: string;
	readonly entities: number;
}

function asStringArray(value: unknown): readonly string[] {
	return Array.isArray(value) && value.every((v) => typeof v === "string")
		? (value as readonly string[])
		: [];
}

function asAliases(value: unknown): readonly { readonly name: string }[] {
	if (!Array.isArray(value)) {
		return [];
	}
	return value
		.map((a) => (a as { readonly name?: unknown }).name)
		.filter((n): n is string => typeof n === "string")
		.map((name) => ({ name }));
}

function requireString(
	record: Record<string, unknown>,
	key: string,
	lineNo: number,
): string {
	const value = record[key];
	if (typeof value !== "string") {
		throw new Error(
			`recall fixture line ${lineNo}: missing/invalid string field "${key}"`,
		);
	}
	return value;
}

function toSourceLine(value: unknown, lineNo: number): SourceLine {
	const record = value as Record<string, unknown>;
	const entityType = requireString(record, "entity_type", lineNo);
	if (entityType !== "PERSON" && entityType !== "ORGANIZATION") {
		throw new Error(
			`recall fixture line ${lineNo}: entity_type "${entityType}" is not PERSON or ORGANIZATION`,
		);
	}
	return {
		entity_id: requireString(record, "entity_id", lineNo),
		primary_name: requireString(record, "primary_name", lineNo),
		entity_type: entityType,
		aliases: asAliases(record.aliases),
		dob: asStringArray(record.dob),
		countries: asStringArray(record.countries),
		risk_category: requireString(record, "risk_category", lineNo),
		source_list: requireString(record, "source_list", lineNo),
		list_version: requireString(record, "list_version", lineNo),
	};
}

/** Serialize feed lines to the fixture's gzipped-JSONL bytes, key order fixed. */
export function encodeFixture(lines: readonly SourceLine[]): Uint8Array {
	const jsonl = lines
		.map((line) =>
			JSON.stringify({
				entity_id: line.entity_id,
				primary_name: line.primary_name,
				entity_type: line.entity_type,
				aliases: line.aliases.map((a) => ({ name: a.name })),
				dob: line.dob,
				countries: line.countries,
				risk_category: line.risk_category,
				source_list: line.source_list,
				list_version: line.list_version,
			}),
		)
		.join("\n");
	return gzipSync(Buffer.from(`${jsonl}\n`, "utf8"), { level: 9 });
}

/** Parse fixture bytes back into feed lines, rejecting a malformed record. */
export function decodeFixture(bytes: Uint8Array): readonly SourceLine[] {
	const text = gunzipSync(bytes).toString("utf8");
	const lines: SourceLine[] = [];
	const rows = text.split("\n");
	for (let i = 0; i < rows.length; i += 1) {
		const row = rows[i]?.trim();
		if (row === undefined || row === "") {
			continue;
		}
		lines.push(toSourceLine(JSON.parse(row), i + 1));
	}
	if (lines.length === 0) {
		throw new Error("recall fixture is empty");
	}
	return lines;
}

/** SHA-256 of arbitrary bytes, lowercase hex. */
export function sha256Hex(bytes: Uint8Array | string): string {
	return createHash("sha256").update(bytes).digest("hex");
}
