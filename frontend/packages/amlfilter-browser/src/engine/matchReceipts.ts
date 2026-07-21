// Seal each returned match into a signed Avow score receipt.
//
// This is the wiring between the screening engine and scoreReceipt.ts: the
// engine computes a score exactly as before, and this module wraps that result
// — plus the context that makes it reproducible (engine version, screened list
// versions, and a hash of the actual inputs) — in an offline-verifiable
// envelope. Nothing here can change a score, a reason, or a tier boundary.
//
// Custody caveat (identical to scoreReceipt.ts): the signing seed lives in
// browser storage, so a receipt is tamper-EVIDENT, not proof the host was
// uncompromised at signing time.
//
// Availability: where the tab has no usable storage (a blocked-storage policy),
// there is no stable install key, so no receipt is produced and the screen
// still returns its matches. Receipts are additive provenance — they are NOT
// the fail-closed control that guards the signed watchlist bundle, and the
// screening path must not go dark because provenance is unavailable.

import { canonicalBytes, type JsonValue } from "./canonical";
import { sha256Hex } from "./crypto";
import type { Match, ScreenQuery } from "./domain";
import {
	defaultKeyStorage,
	type InstallKey,
	type KeyStorage,
	loadInstallKey,
} from "./installKey";
import { matchScoreSubject, signMatchReceipt } from "./scoreReceipt";
import { classifyTier } from "./tiering";
import { compositeVersion, ENGINE_VERSION } from "./version";

/** What the engine knows at seal time, beyond the match itself. */
export interface SealContext {
	readonly query: ScreenQuery;
	/** The screened lists' loaded versions, keyed by list id. */
	readonly listVersions: Readonly<Record<string, string>>;
	/**
	 * The score floor applied to a match's OWN list — its POSSIBLE tier boundary.
	 * A function, not a number, because per-list thresholds mean two matches in
	 * one response can sit against different floors.
	 */
	possibleThresholdFor(match: Match): number;
}

/** Seals scored matches into signed receipts. Injectable so tests can fix a key. */
export interface MatchReceiptSealer {
	seal(
		matches: ReadonlyArray<Match>,
		context: SealContext,
	): Promise<ReadonlyArray<Match>>;
}

/**
 * `sha256:<hex>` over the screened identity pair — the query as asked and the
 * matched entity's identity-bearing fields. Canonical (RFC-8785) bytes, so the
 * same screen re-run reproduces the same hash byte-for-byte.
 */
export async function inputsHash(
	match: Match,
	query: ScreenQuery,
): Promise<string> {
	const pair = {
		query: {
			name: query.name,
			dob: query.dob ?? null,
			country: query.country ?? null,
			entity_type: query.entityType ?? null,
		},
		entity: {
			entity_id: match.entity_id,
			primary_name: match.primary_name,
			source_list: match.source_list,
			list_version: match.list_version,
		},
	};
	return `sha256:${await sha256Hex(canonicalBytes(pair as JsonValue))}`;
}

/** Seal one match, returning it widened with its receipt. */
async function sealOne(
	match: Match,
	context: SealContext,
	key: InstallKey,
): Promise<Match> {
	const subject = matchScoreSubject(
		{
			score: match.score,
			tier: classifyTier(match.score, context.possibleThresholdFor(match)),
		},
		{
			engineVersion: ENGINE_VERSION,
			watchlistVersion: compositeVersion(context.listVersions),
			inputsHash: await inputsHash(match, context.query),
		},
	);
	return {
		...match,
		score_receipt: await signMatchReceipt(subject, key.seedHex),
	};
}

/**
 * The production sealer: resolves this install's signing key ONCE (memoized, so
 * a screen never re-derives the public key) and signs every returned match.
 */
export function createMatchReceiptSealer(
	storage: KeyStorage | null = defaultKeyStorage(),
): MatchReceiptSealer {
	let keyPromise: Promise<InstallKey> | null = null;
	return {
		async seal(matches, context) {
			if (storage === null || matches.length === 0) {
				return matches;
			}
			keyPromise ??= loadInstallKey(storage);
			const key = await keyPromise;
			return Promise.all(matches.map((m) => sealOne(m, context, key)));
		},
	};
}
