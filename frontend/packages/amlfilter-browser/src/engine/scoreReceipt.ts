// Avow score receipt — seal an in-tab risk/match score into a signed,
// offline-verifiable Avow receipt. The screening engine still computes its own
// score and tier exactly as before; this module only wraps that result in the
// `@edgeproc/avow` envelope (RFC-8785 canonical bytes + Ed25519), so a reviewer
// (or an auditor) can later verify "this score, for this watchlist version, was
// produced by this installation" without trusting any server.
//
// Key-custody honesty: the signing seed is held in the browser (see
// ./installKey). Same-origin script can read it — this is a
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
//   • The production screening path seals through this module: matchReceipts.ts
//     (createMatchReceiptSealer) signs every returned match, and the user-facing
//     journey — seal → display → verify → rekey-fail-closed — is proven over the
//     minified build by app/tests/e2e-c1/receipt-badge.spec.ts.

import {
	type JsonValue,
	type SignedReceipt,
	signPayload,
	verifySignature,
} from "@edgeproc/avow";

import type { MatchTier } from "./tiering";

/** Re-exported so a receipt consumer needs only this module. ONE definition
 * lives in ./tiering; @amlfilter/workstation re-exports that same one. */
export type { MatchTier };

/** The app-computed match result being attested — score plus its tier. */
export interface MatchScoreInput {
	readonly score: number;
	readonly tier: MatchTier;
}

/** Coded error: a score outside the engine's legitimate [0, 1] output range. */
export class ScoreOutOfRange extends RangeError {
	constructor(value: number) {
		super(
			`score receipt: score must be a finite number in [0, 1], got ${value}`,
		);
		this.name = "ScoreOutOfRange";
	}
}

/** Coded error: an inputs hash that is not a complete lowercase SHA-256 digest. */
export class InputsHashInvalid extends TypeError {
	constructor(value: string) {
		super(`score receipt: inputs_hash must be "sha256:<hex>", got "${value}"`);
		this.name = "InputsHashInvalid";
	}
}

declare const attestedScoreBrand: unique symbol;

/**
 * A score this engine can legitimately attest: a finite number in [0, 1].
 * The scorer clamps its final score into exactly that range (scoring.ts), so
 * anything outside it is a bug or hostile data — never a value to sign.
 */
export type AttestedScore = number & { readonly [attestedScoreBrand]: true };

/** The only digest scheme a score receipt may carry. */
export type Sha256Hash = `sha256:${string}`;

/** Runtime wire invariant for the `Sha256Hash` compile-time brand. */
const SHA256_HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;

/**
 * Validate a raw score into an `AttestedScore`, or THROW `ScoreOutOfRange`.
 * Throwing (not clamping) is deliberate: the engine cannot produce an
 * out-of-range score, so clamping here would silently sign a fabricated value.
 */
export function attestedScore(value: number): AttestedScore {
	if (!Number.isFinite(value) || value < 0 || value > 1) {
		throw new ScoreOutOfRange(value);
	}
	return value as AttestedScore;
}

/** The screening context that makes a score reproducible and auditable. */
export interface ScoreReceiptContext {
	readonly engineVersion: string;
	readonly watchlistVersion: string;
	/** `sha256:<hex>` over the screened identity pair (the scoring inputs). */
	readonly inputsHash: Sha256Hash;
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
	readonly inputs_hash: Sha256Hash;
	readonly score: AttestedScore;
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
		score: attestedScore(match.score),
		tier: match.tier,
	};
}

/**
 * The subject invariants, re-checked on the VERIFY side. The seal-time guard
 * cannot protect a verifier: a buggy or rogue sealer can validly SIGN an
 * out-of-range subject, and its signature would check out. So bounds are
 * enforced at both ends — reject before the signature even gets a say.
 */
function assertAttestable(payload: MatchScoreSubject): void {
	attestedScore(payload.score);
	if (!SHA256_HASH_PATTERN.test(payload.inputs_hash)) {
		throw new InputsHashInvalid(payload.inputs_hash);
	}
}

/** Hash + Ed25519-sign the score subject into a verifiable receipt. */
export function signMatchReceipt(
	subject: MatchScoreSubject,
	seedHex: string,
): Promise<SignedReceipt<MatchScoreSubject>> {
	return signPayload(subject, seedHex);
}

/** Fail-closed verify of a score receipt against a pinned signer key. */
export async function verifyMatchReceipt(
	receipt: SignedReceipt<MatchScoreSubject>,
	expectedPublicKey: string,
): Promise<void> {
	assertAttestable(receipt.payload);
	return verifySignature(receipt, expectedPublicKey);
}
