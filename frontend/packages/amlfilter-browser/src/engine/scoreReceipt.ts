// Avow score receipt — seal an in-tab risk/match score into a signed,
// offline-verifiable Avow receipt. The screening engine still computes its own
// score and tier exactly as before; this module only wraps that result in the
// `@edgeproc/avow` envelope (RFC-8785 canonical bytes + Ed25519), so a reviewer
// (or an auditor) can later verify "this score, for this watchlist version, was
// produced by this installation" without trusting any server.
//
// Key-custody honesty: the signing seed is held in the browser (see the
// workstation's installKey.ts). Same-origin script can read it — this is a
// tamper-EVIDENT provenance record, not a hardware-backed key boundary. It
// proves a receipt was not altered after signing; it does not prove the host
// was uncompromised at signing time.
//
// Where this module is proven:
//   • ./scoreReceipt.test.ts — unit suite. Runs under the `node` environment,
//     NOT the package-wide jsdom one: jsdom adds a second JavaScript realm that
//     no browser has, and @noble/ed25519 hashes via `subtle.digest(SHA-512,
//     m.buffer)` — a bare ArrayBuffer that Node 22's WebCrypto rejects when it
//     is cross-realm. That file's header documents the full diagnosis.
//   • app/tests/score-receipt-browser.spec.ts — real headless Chromium. Because
//     the unit suite deliberately leaves jsdom, browser behaviour must be shown
//     somewhere real; that spec drives sign -> verify -> tamper-reject ->
//     wrong-key-reject in an actual page.
//
// NOT YET PROVEN: no product code imports this module, so no user-journey e2e
// lane exercises receipt signing. Until the screening path calls it, treat
// "the receipt works" as a module-level claim, not an end-to-end one.

import {
	type JsonValue,
	type SignedReceipt,
	signPayload,
	verifySignature,
} from "@edgeproc/avow";

/** The three screening tiers (mirrors @amlfilter/workstation MatchTier). */
export type MatchTier = "STRONG" | "POSSIBLE" | "WEAK";

/** The app-computed match result being attested — score plus its tier. */
export interface MatchScoreInput {
	readonly score: number;
	readonly tier: MatchTier;
}

/** The screening context that makes a score reproducible and auditable. */
export interface ScoreReceiptContext {
	readonly engineVersion: string;
	readonly watchlistVersion: string;
	/** `sha256:<hex>` over the screened identity pair (the scoring inputs). */
	readonly inputsHash: string;
}

/**
 * The signed subject. A `type` (not `interface`) so it carries an implicit
 * index signature and satisfies `@edgeproc/avow`'s `JsonValue` bound.
 */
export type MatchScoreSubject = {
	readonly kind: "aml.match_score";
	readonly engine: "amlfilter-sequenceMatcher";
	readonly engine_version: string;
	readonly watchlist_version: string;
	readonly inputs_hash: string;
	readonly score: number;
	readonly tier: MatchTier;
};

// Compile-time proof the subject is a valid Avow payload.
type _AssertJson = MatchScoreSubject extends JsonValue ? true : never;
const _assertJson: _AssertJson = true;
void _assertJson;

/** Build the deterministic score subject from a match result + its context. */
export function matchScoreSubject(
	match: MatchScoreInput,
	context: ScoreReceiptContext,
): MatchScoreSubject {
	return {
		kind: "aml.match_score",
		engine: "amlfilter-sequenceMatcher",
		engine_version: context.engineVersion,
		watchlist_version: context.watchlistVersion,
		inputs_hash: context.inputsHash,
		score: match.score,
		tier: match.tier,
	};
}

/** Hash + Ed25519-sign the score subject into a verifiable receipt. */
export function signMatchReceipt(
	subject: MatchScoreSubject,
	seedHex: string,
): Promise<SignedReceipt<MatchScoreSubject>> {
	return signPayload(subject, seedHex);
}

/** Fail-closed verify of a score receipt against a pinned signer key. */
export function verifyMatchReceipt(
	receipt: SignedReceipt<MatchScoreSubject>,
	expectedPublicKey: string,
): Promise<void> {
	return verifySignature(receipt, expectedPublicKey);
}
