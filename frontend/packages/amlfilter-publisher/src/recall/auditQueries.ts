// Four hand-audited spelling-variant probes, pinned by entity id.
//
// The sampled recall segments say HOW OFTEN the product finds a differently
// spelled name. They do not say WHICH names, and an aggregate that moves by a
// point tells you nothing about whether the specific failure you just fixed is
// still fixed. These four are the named cases: each was verified ABSENT (or
// buried) against this exact frozen corpus at threshold 0.30 / k 25 before union
// retrieval existed, and each is now asserted by the gate.
//
// They are not a sample and they are not averaged with anything. A probe that
// stops returning its entity fails the gate on its own — no floor, no tolerance,
// because "did this exact name come back" has no platform noise in it.

import type { RankedScreen } from "./measure.ts";

/** One named probe: a query spelling and the entity it must retrieve. */
export interface AuditQuery {
	/** The name typed, exactly as a user would type it. */
	readonly query: string;
	/** The entity id that must appear in the results. */
	readonly expected: string;
	/** Why this case is here — the retrieval defect it pins. */
	readonly note: string;
}

/**
 * The pinned probes. Entity ids are from `ofac-sdn-corpus.jsonl.gz`; the gate
 * fails loudly if one no longer exists, so a corpus refresh that drops a
 * designation cannot silently turn a probe into a pass.
 */
export const AUDIT_QUERIES: readonly AuditQuery[] = [
	{
		query: "Aiman al-Zawahri",
		expected: "OFAC_SDN:2676",
		note: "Aiman/Ayman and Zawahri/Zawahiri are both vowel-level respellings; the entity is 'AL ZAWAHIRI, Dr. Ayman'. Reached by the shared Double-Metaphone key AMN on the given name.",
	},
	{
		query: "Musa Muhammad Abu Marzuk",
		expected: "OFAC_SDN:3754",
		note: "'ABU MARZOOK, Mousa Mohammed' publishes the alias 'MARZUK, Musa Abu'. Reached by the literal tokens musa/marzuk, which only exist in the index once aliases are indexed.",
	},
	{
		query: "Hassan Nasralla",
		expected: "OFAC_SDN:2686",
		note: "'NASRALLAH, Hasan' — a one-letter truncation. Was retrieved but buried at rank 13 by vector-only ranking.",
	},
	{
		query: "Ahmad Fuad Salim",
		expected: "OFAC_SDN:2676",
		note: "OFAC publishes 'SALIM, Ahmad Fuad' as an alias of Ayman al-Zawahiri. Nothing in the vector index knows that string, so only an alias-aware lexical index can reach it.",
	},
];

/** Where a probe's expected entity landed. `rank` is null when it never came back. */
export interface AuditProbeResult {
	readonly query: string;
	readonly expected: string;
	/** 1-based rank in the returned results, or null when absent. */
	readonly rank: number | null;
}

/** Screen every probe and record where its expected entity ranked. */
export async function runAuditQueries(
	screen: RankedScreen,
	probes: readonly AuditQuery[] = AUDIT_QUERIES,
): Promise<readonly AuditProbeResult[]> {
	const out: AuditProbeResult[] = [];
	for (const probe of probes) {
		const ranked = await screen(probe.query);
		const at = ranked.indexOf(probe.expected);
		out.push({
			query: probe.query,
			expected: probe.expected,
			rank: at === -1 ? null : at + 1,
		});
	}
	return out;
}

/** The probes whose expected entity did not come back at all. */
export function absentProbes(
	results: readonly AuditProbeResult[],
): readonly AuditProbeResult[] {
	return results.filter((r) => r.rank === null);
}

/** Render the probe table for the gate log — one line per probe. */
export function formatAuditProbes(
	results: readonly AuditProbeResult[],
): string {
	return results
		.map(
			(r) =>
				`  ${r.query.padEnd(26)} ${r.expected.padEnd(15)} ${r.rank === null ? "ABSENT" : `rank ${r.rank}`}`,
		)
		.join("\n");
}
