// The material-change fingerprint: a synchronous, non-crypto FNV-1a hash over a
// canonicalized {profile, entity} struct. Two screens whose identity-bearing
// fields are equal (ignoring case, surrounding whitespace, and array order)
// produce the SAME fingerprint; any change to a name, alias, dob, country, or
// the customer profile produces a DIFFERENT one. This is what lets replaceMatches
// tell "the SAME hit, re-seen" from "the hit MATERIALLY changed" so a reviewer's
// disposition is only re-surfaced when the underlying facts actually moved.
//
// Stability is the contract here, not collision-resistance: this never gates a
// trust decision (the signed bundle does that), it only routes re-review.

/** The customer half of the fingerprint input — the screened identity. */
export interface FingerprintProfile {
	readonly name_canonical: string;
	readonly country: string | null;
}

/** The watchlist-entity half — the matched record's identity-bearing fields. */
export interface FingerprintEntity {
	readonly name_canonical: string;
	readonly aliases: ReadonlyArray<string>;
	readonly dob: ReadonlyArray<string>;
	readonly countries: ReadonlyArray<string>;
}

/** Lowercase + trim a single value so case/whitespace never move the hash. */
function norm(value: string): string {
	return value.trim().toLowerCase();
}

/** Normalize then sort a list so element ORDER never moves the hash. */
function normSorted(values: ReadonlyArray<string>): ReadonlyArray<string> {
	return values.map(norm).sort();
}

/**
 * Serialize with a FIXED key order. JSON.stringify of an object literal already
 * emits keys in insertion order, but spelling the structure out here makes the
 * canonical form explicit and refactor-proof.
 */
function canonical(
	profile: FingerprintProfile,
	entity: FingerprintEntity,
): string {
	return JSON.stringify({
		profile: {
			name_canonical: norm(profile.name_canonical),
			country: norm(profile.country ?? ""),
		},
		entity: {
			name_canonical: norm(entity.name_canonical),
			aliases: normSorted(entity.aliases),
			dob: normSorted(entity.dob),
			countries: normSorted(entity.countries),
		},
	});
}

/** FNV-1a (32-bit) over a UTF-16-as-bytes view of the string. Deterministic. */
function fnv1a(input: string): string {
	let hash = 0x811c9dc5;
	for (let i = 0; i < input.length; i += 1) {
		hash ^= input.charCodeAt(i) & 0xff;
		// FNV prime 16777619, kept in 32-bit space via Math.imul.
		hash = Math.imul(hash, 0x01000193);
	}
	// >>> 0 coerces to an unsigned 32-bit int before hex-encoding.
	return (hash >>> 0).toString(16).padStart(8, "0");
}

/** A stable hex fingerprint of the screened identity pair (see module header). */
export function materialFingerprint(
	profile: FingerprintProfile,
	entity: FingerprintEntity,
): string {
	return fnv1a(canonical(profile, entity));
}
