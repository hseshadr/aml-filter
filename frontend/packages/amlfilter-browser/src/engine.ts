// @amlfilter/browser/engine — the reusable, domain-agnostic crypto tier.
//
// After the v3 pivot to a single signed JSON watchlist, the heavy chunked-CAS
// sync tier (OPFS store, GearCDC chunk reassembly, zstd, the sync Worker) is
// gone — the browser fetches ONE signed file and verifies it. What remains
// reusable, and what the publisher's round-trip test pins against, is the
// fail-closed Ed25519 primitive + content hash. This subpath exposes exactly
// those, with ZERO domain coupling (no screening, no embeddings, no OFAC).

// --- fail-closed crypto primitives (verify a detached signature, hash bytes) ---
export { SignatureError, sha256Hex, verifyEd25519 } from "./engine/crypto";
