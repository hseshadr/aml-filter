// Parse a source-entities JSONL line and map it to the WatchlistEntity wire
// shape. The source carries a richer record (the backend's ingest shape); we
// project the fields the v3 contract needs and RECOMPUTE name_canonical via the
// shared canonicalize so the browser's normalizer and the published list agree.

import { canonicalize } from "@amlfilter/browser";
import type { WatchlistEntity } from "./types.ts";

/** One alias as it appears in a source line. */
interface SourceAlias {
	readonly name: string;
}

/** The subset of a source-entities JSONL record the publisher consumes. */
interface SourceEntity {
	readonly entity_id: string;
	readonly primary_name: string;
	readonly aliases?: readonly SourceAlias[];
	readonly dob?: readonly string[];
	readonly countries?: readonly string[];
	readonly risk_category: string;
	readonly source_list: string;
	readonly list_version: string;
}

function isStringArray(value: unknown): value is readonly string[] {
	return Array.isArray(value) && value.every((v) => typeof v === "string");
}

function readAliasNames(value: unknown): readonly string[] {
	if (!Array.isArray(value)) {
		return [];
	}
	return value
		.map((a) => (a as SourceAlias)?.name)
		.filter((n): n is string => typeof n === "string");
}

/** Narrow an arbitrary parsed JSON value to a SourceEntity, throwing on a
 * record missing the required identity/classification fields. */
function asSourceEntity(value: unknown, lineNo: number): SourceEntity {
	const r = value as Record<string, unknown>;
	const required = [
		"entity_id",
		"primary_name",
		"risk_category",
		"source_list",
		"list_version",
	];
	for (const key of required) {
		if (typeof r[key] !== "string") {
			throw new Error(
				`source line ${lineNo}: missing/invalid string field "${key}"`,
			);
		}
	}
	return r as unknown as SourceEntity;
}

/** Map one source record to the wire shape: recompute name_canonical, take the
 * first DOB (or null), sort countries, and flatten aliases to display names. */
export function toWatchlistEntity(
	value: unknown,
	lineNo: number,
): WatchlistEntity {
	const src = asSourceEntity(value, lineNo);
	const countries = isStringArray(src.countries)
		? [...src.countries].sort()
		: [];
	return {
		entity_id: src.entity_id,
		name_canonical: canonicalize(src.primary_name),
		aliases: readAliasNames(src.aliases),
		dob:
			isStringArray(src.dob) && src.dob.length > 0
				? (src.dob[0] ?? null)
				: null,
		countries,
		risk_category: src.risk_category,
		source_list: src.source_list,
		list_version: src.list_version,
	};
}

/** Parse a JSONL document into wire entities, skipping blank lines. */
export function parseEntities(jsonl: string): WatchlistEntity[] {
	const entities: WatchlistEntity[] = [];
	const lines = jsonl.split("\n");
	for (let i = 0; i < lines.length; i += 1) {
		const line = lines[i]?.trim();
		if (line === undefined || line === "") {
			continue;
		}
		entities.push(toWatchlistEntity(JSON.parse(line), i + 1));
	}
	return entities;
}
