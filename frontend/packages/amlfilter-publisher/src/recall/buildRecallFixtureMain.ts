// Refresh the frozen corpus fixture from the live OFAC feed.
//
//   pnpm --filter @amlfilter/publisher run build-recall-fixture
//
// Deliberately manual. The fixture is the gate's haystack, so refreshing it
// changes what every recall number means; that has to be an explicit commit with
// a visible provenance diff, never something a scheduled job does quietly.
//
// After running this, re-measure and rewrite the baseline:
//   pnpm --filter @amlfilter/publisher run measure-recall -- --write

import { mkdirSync, writeFileSync } from "node:fs";
import { CSL_BASE, CSL_FILE, ofacSource } from "../sources/ofacSource.ts";
import { OFAC_LIST_ID, SOURCE_UPDATED_AT_KEY } from "../sources/source.ts";
import { encodeFixture, type FixtureProvenance, sha256Hex } from "./fixture.ts";
import {
	CORPUS_FIXTURE,
	CORPUS_PROVENANCE,
	RECALL_FIXTURE_DIR,
} from "./paths.ts";

/** Stamped into every fixture record; identifies the snapshot, not a release. */
const FIXTURE_LIST_VERSION = "recall-fixture";

async function main(): Promise<void> {
	const raw = await ofacSource.fetchRaw();
	const csv = raw[CSL_FILE] ?? "";
	const lines = ofacSource.parse(raw, FIXTURE_LIST_VERSION);
	if (lines.length === 0) {
		throw new Error(
			"OFAC feed parsed to zero entities — refusing to freeze it",
		);
	}
	const provenance: FixtureProvenance = {
		listId: OFAC_LIST_ID,
		sourceUrl: `${CSL_BASE}/${CSL_FILE}`,
		fetchedAt: raw[SOURCE_UPDATED_AT_KEY] ?? new Date().toISOString(),
		sourceSha256: sha256Hex(csv),
		entities: lines.length,
	};
	mkdirSync(RECALL_FIXTURE_DIR, { recursive: true });
	writeFileSync(CORPUS_FIXTURE, encodeFixture(lines));
	writeFileSync(
		CORPUS_PROVENANCE,
		`${JSON.stringify(provenance, null, "\t")}\n`,
	);
	console.log(
		`froze ${lines.length} ${OFAC_LIST_ID} entities -> ${CORPUS_FIXTURE}`,
	);
}

await main();
