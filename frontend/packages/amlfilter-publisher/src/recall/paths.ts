// Where the recall artifacts live, resolved from this module rather than from
// the process working directory, so the gate behaves the same whether it is run
// from the package, from `frontend/`, or from CI.

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

/** The publisher package root (…/packages/amlfilter-publisher). */
export const PACKAGE_ROOT = join(HERE, "..", "..");

/** Directory holding the frozen corpus fixture and its provenance. */
export const RECALL_FIXTURE_DIR = join(PACKAGE_ROOT, "fixtures", "recall");

/** The frozen OFAC SDN corpus snapshot. */
export const CORPUS_FIXTURE = join(
	RECALL_FIXTURE_DIR,
	"ofac-sdn-corpus.jsonl.gz",
);

/** Provenance for the snapshot above (source URL, fetch instant, byte hash). */
export const CORPUS_PROVENANCE = join(RECALL_FIXTURE_DIR, "provenance.json");

/** The committed measured baseline the gate compares against. */
export const RECALL_BASELINE = join(RECALL_FIXTURE_DIR, "recall-baseline.json");

/** Model mirror shared with the app (contains Xenova/all-MiniLM-L6-v2/…). */
export const DEFAULT_MODELS_DIR = join(
	PACKAGE_ROOT,
	"..",
	"..",
	"app",
	"public",
	"models",
);
