// Where the decision artifacts are written.
//
// GENERATED, NOT COMMITTED. `.decision-out/` is gitignored. The artifacts are
// rewritten by the same command that scores them, so the Python floors can never
// grade a run that describes a matcher no longer in the tree — the staleness
// window simply does not exist. The reviewable diff is the committed metrics and
// floors in eval/baselines/decision-baseline.json.

import { join } from "node:path";
import { PACKAGE_ROOT } from "../recall/paths.ts";

/** Directory the emitter writes into. Gitignored. */
export const DECISION_OUT_DIR = join(PACKAGE_ROOT, ".decision-out");

/** Per-(query, candidate) decision rows: the file the Python gate scores. */
export const DECISION_ARTIFACT = join(DECISION_OUT_DIR, "decision-pairs.jsonl");

/** The name-similarity study's raw pairs. */
export const PAIR_STUDY_ARTIFACT = join(DECISION_OUT_DIR, "pair-study.jsonl");
