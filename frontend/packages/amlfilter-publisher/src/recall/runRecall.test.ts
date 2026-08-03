// End-to-end harness test on a tiny corpus with the fake embedder: frozen bytes
// -> production projection -> production bundle loader -> production engine ->
// report. Proves the wiring works without the 23 MB model; the real numbers come
// from the CLI run against the committed fixture.

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canonicalize, type Embedder } from "@amlfilter/browser";
import { describe, expect, it } from "vitest";
import { createFakeEmbedder } from "../fakeEmbedder.ts";
import type { SourceLine } from "../sources/source.ts";
import { AUDIT_QUERIES } from "./auditQueries.ts";
import { encodeFixture } from "./fixture.ts";
import { recallAt, segmentOf } from "./report.ts";
import { runRecall } from "./runRecall.ts";

/**
 * A stand-in embedder with the two properties this test depends on, neither of
 * which the shared `createFakeEmbedder` has:
 *
 *  - L2-NORMALIZED. `VectorIndex` treats stored rows as unit-length (cosine ==
 *    dot product) and renormalizes only the query, so unnormalized rows make an
 *    entity score badly against its own name.
 *  - CANONICAL-FORM STABLE. The index is built from `name_canonical` while a
 *    query arrives as raw text; a raw hash of "Ayman al-Zawahiri" is orthogonal
 *    to a hash of "ayman al-zawahiri", so the same name would not match itself.
 *    Hashing the canonical form gives the one real-embedder property asserted
 *    below: the same name maps to the same vector.
 *
 * It is deliberately NOT a semantic model — spelling variants stay orthogonal
 * here. Alias recall is therefore never asserted in this file; the real alias
 * numbers come from the CLI run against the committed fixture and MiniLM.
 */
function createCanonicalFakeEmbedder(): Embedder {
	const inner = createFakeEmbedder();
	return {
		async embed(text: string): Promise<Float32Array> {
			const vector = await inner.embed(canonicalize(text));
			let sumSq = 0;
			for (const value of vector) {
				sumSq += value * value;
			}
			const norm = Math.sqrt(sumSq);
			return norm === 0 ? vector : vector.map((v) => v / norm);
		},
	};
}

function line(
	id: string,
	primary: string,
	aliases: readonly string[],
): SourceLine {
	return {
		entity_id: id,
		primary_name: primary,
		entity_type: "PERSON",
		aliases: aliases.map((name) => ({ name })),
		dob: [],
		countries: [],
		risk_category: "SANCTION",
		source_list: "OFAC_SDN",
		list_version: "recall-fixture",
	};
}

const FEED: readonly SourceLine[] = [
	line("OFAC_SDN:1", "Ayman al-Zawahiri", ["Aiman al-Zawahri"]),
	line("OFAC_SDN:2", "Hassan Nasrallah", ["Hasan Nasralla"]),
	line("OFAC_SDN:3", "Musa Abu Marzuk", ["Mousa Abu Marzook"]),
	line("OFAC_SDN:4", "Acme Trading Company", []),
];

function writeFixture(feed: readonly SourceLine[] = FEED): string {
	const dir = mkdtempSync(join(tmpdir(), "recall-"));
	const path = join(dir, "corpus.jsonl.gz");
	writeFileSync(path, encodeFixture(feed));
	return path;
}

describe("runRecall", () => {
	it("measures both segments and records the corpus it measured", async () => {
		const report = await runRecall({
			fixturePath: writeFixture(),
			perSegment: null,
			seed: 1,
			embedder: createCanonicalFakeEmbedder(),
			now: () => new Date("2026-08-03T00:00:00.000Z"),
		});
		expect(report.corpus.entities).toBe(4);
		expect(report.corpus.listId).toBe("OFAC_SDN");
		expect(report.measuredAt).toBe("2026-08-03T00:00:00.000Z");
		expect(report.segments.map((s) => s.kind)).toEqual(["alias", "canonical"]);
	});

	it("screens with the live /screen parameters, not the engine defaults", async () => {
		const report = await runRecall({
			fixturePath: writeFixture(),
			perSegment: null,
			seed: 1,
			embedder: createCanonicalFakeEmbedder(),
		});
		expect(report.screen).toEqual({ threshold: 0.3, k: 25 });
	});

	// The canonical segment is the floor case: querying an entity's own indexed
	// name must return that entity. If this is not 1.0 the index itself is broken.
	it("finds every entity by its own primary name", async () => {
		const report = await runRecall({
			fixturePath: writeFixture(),
			perSegment: null,
			seed: 1,
			embedder: createCanonicalFakeEmbedder(),
		});
		const canonical = segmentOf(report, "canonical");
		expect(canonical.queries).toBe(4);
		expect(recallAt(canonical, 25)).toBe(1);
		expect(canonical.absent).toBe(0);
	});

	it("records how many labelled queries existed before sampling", async () => {
		const report = await runRecall({
			fixturePath: writeFixture(),
			perSegment: null,
			seed: 1,
			embedder: createCanonicalFakeEmbedder(),
		});
		expect(report.sample.availableAlias).toBe(3);
		expect(report.sample.availableCanonical).toBe(4);
		expect(report.sample.perSegment).toBeNull();
	});

	it("screens only the sampled queries when a sample size is given", async () => {
		const report = await runRecall({
			fixturePath: writeFixture(),
			perSegment: 2,
			seed: 7,
			embedder: createCanonicalFakeEmbedder(),
		});
		expect(segmentOf(report, "alias").queries).toBe(2);
		expect(report.sample.perSegment).toBe(2);
	});

	it("reports the fixture's own hash, so a number is traceable to its data", async () => {
		const path = writeFixture();
		const first = await runRecall({
			fixturePath: path,
			perSegment: null,
			seed: 1,
			embedder: createCanonicalFakeEmbedder(),
		});
		const other = await runRecall({
			fixturePath: writeFixture(FEED.slice(0, 3)),
			perSegment: null,
			seed: 1,
			embedder: createCanonicalFakeEmbedder(),
		});
		expect(first.corpus.fixtureSha256).toMatch(/^[0-9a-f]{64}$/);
		expect(other.corpus.fixtureSha256).not.toBe(first.corpus.fixtureSha256);
	});

	// The probes are screened against whatever corpus is loaded. On this 4-entity
	// stand-in none of the real OFAC ids exist, so every probe is absent — the
	// point asserted here is that the run REPORTS them, not that they hit.
	it("screens the pinned audit probes and reports one row per probe", async () => {
		const report = await runRecall({
			fixturePath: writeFixture(),
			perSegment: null,
			seed: 1,
			embedder: createCanonicalFakeEmbedder(),
		});
		expect(report.audit.map((a) => a.query)).toEqual(
			AUDIT_QUERIES.map((q) => q.query),
		);
		expect(report.audit.every((a) => a.rank === null)).toBe(true);
	});

	it("forwards progress to the caller", async () => {
		let last = 0;
		await runRecall({
			fixturePath: writeFixture(),
			perSegment: null,
			seed: 1,
			embedder: createCanonicalFakeEmbedder(),
			onProgress: (done) => {
				last = done;
			},
		});
		expect(last).toBeGreaterThan(0);
	});
});
