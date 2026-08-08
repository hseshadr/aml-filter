import {
	EMPTY_IDENTIFIERS,
	type Match,
	type ScreenResponse,
} from "@amlfilter/browser";
import { describe, expect, it } from "vitest";
import { emitSegment, screenOne } from "./emit.ts";

function match(
	id: string,
	score: number,
	lexical: number,
	primary: string,
): Match {
	return {
		entity_id: id,
		score,
		entity_type: "PERSON",
		risk_category: "SANCTION",
		source_list: "OFAC_SDN",
		list_version: "v1",
		primary_name: primary,
		aliases: [],
		countries: [],
		nationalities: [],
		dob: [],
		addresses: [],
		identifiers: EMPTY_IDENTIFIERS,
		reasons: [
			{
				signal: "name_trigram",
				value: lexical,
				weight: 0.2,
				contribution: 0,
				description: "",
			},
		],
		explanation: "",
	} as Match;
}

function respond(matches: readonly Match[]): ScreenResponse {
	return {
		request_id: "r",
		matches: [...matches],
		list_versions_used: {},
		execution_time_ms: 0,
	} as ScreenResponse;
}

describe("screenOne", () => {
	it("records rank, score, lexical and token containment for every match", async () => {
		const screen = async () =>
			respond([match("OFAC_SDN:1", 0.82, 0.71, "IVANOV, Vladimir")]);
		const row = await screenOne(
			{ query: "Vladimir Ivanov", expected: new Set(["OFAC_SDN:1"]) },
			"alias",
			7,
			screen,
		);
		expect(row.id).toBe(7);
		expect(row.segment).toBe("alias");
		expect(row.candidates).toEqual([
			{
				entityId: "OFAC_SDN:1",
				rank: 1,
				retrieved: true,
				score: 0.82,
				lexical: 0.71,
				tokenContainment: true,
				expected: true,
				kept: ["lenient", "balanced", "strict"],
				primary: ["lenient", "balanced", "strict"],
			},
		]);
	});

	it("records the levels at which the user would have been shown the entity", async () => {
		// Score 0.35 clears every floor except Strict's 0.40, and sits under
		// Balanced's 0.40 display line — so Balanced keeps it but groups it.
		const screen = async () =>
			respond([match("OFAC_SDN:1", 0.35, 0.9, "IVANOV, Vladimir")]);
		const row = await screenOne(
			{ query: "Vladimir Ivanov", expected: new Set(["OFAC_SDN:1"]) },
			"alias",
			0,
			screen,
		);
		expect(row.candidates[0]?.kept).toEqual(["lenient", "balanced"]);
		expect(row.candidates[0]?.primary).toEqual(["lenient"]);
	});

	it("labels a returned entity that is not an acceptable answer as not expected", async () => {
		const screen = async () =>
			respond([match("OFAC_SDN:9", 0.5, 0.4, "PETROV, Sergei")]);
		const row = await screenOne(
			{ query: "Vladimir Ivanov", expected: new Set(["OFAC_SDN:1"]) },
			"alias",
			0,
			screen,
		);
		expect(row.candidates[0]?.expected).toBe(false);
	});

	it("EMITS A ROW for an expected entity the engine never returned", async () => {
		// Without this row the miss is invisible: nothing came back, so nothing
		// would be scored, and a false negative would silently not exist.
		const screen = async () => respond([]);
		const row = await screenOne(
			{ query: "Vladimir Ivanov", expected: new Set(["OFAC_SDN:1"]) },
			"alias",
			0,
			screen,
		);
		expect(row.candidates).toEqual([
			{
				entityId: "OFAC_SDN:1",
				rank: null,
				retrieved: false,
				score: 0,
				lexical: 0,
				tokenContainment: false,
				expected: true,
				kept: [],
				primary: [],
			},
		]);
	});

	it("does not double-count an expected entity that WAS returned", async () => {
		const screen = async () =>
			respond([match("OFAC_SDN:1", 0.9, 0.9, "IVANOV, Vladimir")]);
		const row = await screenOne(
			{ query: "Vladimir Ivanov", expected: new Set(["OFAC_SDN:1"]) },
			"alias",
			0,
			screen,
		);
		expect(row.candidates).toHaveLength(1);
		expect(row.candidates[0]?.retrieved).toBe(true);
	});

	it("emits a clean query with no expected entities and no synthetic rows", async () => {
		const screen = async () =>
			respond([match("OFAC_SDN:2", 0.31, 0.2, "PETROV, Sergei")]);
		const row = await screenOne(
			{ query: "ivanov sergei", expected: new Set() },
			"clean-hard",
			0,
			screen,
		);
		expect(row.expected).toEqual([]);
		expect(row.candidates).toHaveLength(1);
		expect(row.candidates[0]?.expected).toBe(false);
	});
});

describe("emitSegment", () => {
	it("keys queries consecutively from startId and reports progress", async () => {
		const seen: number[] = [];
		const rows = await emitSegment({
			segment: "canonical",
			targets: [
				{ query: "a b", expected: new Set() },
				{ query: "c d", expected: new Set() },
			],
			screen: async () => respond([]),
			startId: 100,
			onProgress: (done) => seen.push(done),
		});
		expect(rows.map((r) => r.id)).toEqual([100, 101]);
		expect(seen).toEqual([1, 2]);
	});
});
