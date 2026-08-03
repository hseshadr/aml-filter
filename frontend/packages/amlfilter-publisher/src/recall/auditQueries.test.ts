import { describe, expect, it } from "vitest";
import {
	AUDIT_QUERIES,
	type AuditQuery,
	absentProbes,
	formatAuditProbes,
	runAuditQueries,
} from "./auditQueries.ts";
import type { RankedScreen } from "./measure.ts";

const PROBES: readonly AuditQuery[] = [
	{ query: "Aiman al-Zawahri", expected: "E1", note: "vowel respelling" },
	{ query: "Ahmad Fuad Salim", expected: "E2", note: "alias-only" },
];

/** A ranker returning a fixed result list per query. */
function fakeScreen(byQuery: Record<string, readonly string[]>): RankedScreen {
	return (query: string) => Promise.resolve(byQuery[query] ?? []);
}

describe("audit probes — the four named spelling-variant cases", () => {
	it("records the 1-based rank of each probe's expected entity", async () => {
		const results = await runAuditQueries(
			fakeScreen({
				"Aiman al-Zawahri": ["X", "E1", "Y"],
				"Ahmad Fuad Salim": ["E2"],
			}),
			PROBES,
		);
		expect(results.map((r) => r.rank)).toEqual([2, 1]);
	});

	it("records null — not a large rank — when the entity never came back", async () => {
		const results = await runAuditQueries(
			fakeScreen({ "Aiman al-Zawahri": ["X", "Y"] }),
			PROBES,
		);
		expect(results[0]?.rank).toBeNull();
		expect(results[1]?.rank).toBeNull();
	});

	it("absentProbes reports exactly the probes that returned nothing", async () => {
		const results = await runAuditQueries(
			fakeScreen({
				"Aiman al-Zawahri": ["E1"],
				"Ahmad Fuad Salim": ["nope"],
			}),
			PROBES,
		);
		expect(absentProbes(results).map((r) => r.expected)).toEqual(["E2"]);
	});

	it("formats one line per probe, naming ABSENT explicitly", async () => {
		const results = await runAuditQueries(
			fakeScreen({ "Aiman al-Zawahri": ["E1"] }),
			PROBES,
		);
		const text = formatAuditProbes(results);
		expect(text.split("\n")).toHaveLength(2);
		expect(text).toContain("rank 1");
		expect(text).toContain("ABSENT");
	});

	it("ships the four pinned probes with a note on every one", () => {
		expect(AUDIT_QUERIES).toHaveLength(4);
		for (const probe of AUDIT_QUERIES) {
			expect(probe.expected).toMatch(/^OFAC_SDN:\d+$/);
			expect(probe.note.length).toBeGreaterThan(20);
		}
	});
});
