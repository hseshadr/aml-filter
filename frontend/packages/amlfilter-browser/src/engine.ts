// @amlfilter/browser/engine — the reusable, domain-agnostic crypto tier: the
// fail-closed Ed25519 primitive, content hashing, canonical signing bytes, and
// the chunk decode+verify rule. ZERO domain coupling (no screening, no
// embeddings, no OFAC).
//
// Consumers: the publisher's round-trip test pins the signing primitives, and
// the publisher's post-publish origin gate (verifyPublishedOrigin) re-checks
// the LIVE origin after every deploy through the EXACT decode path the in-tab
// verifier enforces — bytes-on-the-wire → zstd decompress → content-address.

// --- canonical signing bytes (byte-matches edge-proc's canonical_bytes) ---
export { canonicalBytes, type JsonValue } from "./engine/canonical";

// --- fail-closed crypto primitives (verify a detached signature, hash bytes) ---
export { SignatureError, sha256Hex, verifyEd25519 } from "./engine/crypto";

// --- the Worker-boundary error envelope: carries a failure's TYPE, not just its
//     text, across structured clone (see engine/sync/errorEnvelope.ts for why) ---
export {
	type ErrorPayload,
	errorPayload,
	fromErrorResponse,
	rebuildError,
	toErrorResponse,
} from "./engine/sync/errorEnvelope";
// --- the client's chunk decode path (zstd decompress → sha256 == name) ---
export { decompressAndVerify, IntegrityError } from "./engine/sync/integrity";
