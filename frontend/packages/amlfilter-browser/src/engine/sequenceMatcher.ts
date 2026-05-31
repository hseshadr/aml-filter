// A faithful TS port of Python difflib.SequenceMatcher.ratio() — the exact
// trigram-similarity stand-in the backend's bundle screening path uses
// (aml_filter.bundle.screening._trigram_similarity ->
// SequenceMatcher(None, a, b).ratio()). Mirroring it here keeps the browser's
// `name_trigram` signal byte-identical to the no-Postgres server path.
//
// ratio = 2.0 * M / T, where T = len(a) + len(b) and M = total size of the
// matching blocks found by the Ratcliff/Obershelp recursive longest-match.
//
// difflib's "autojunk" heuristic only activates for b longer than 200 chars, so
// it never fires on names; this port omits it (documented divergence, unreachable
// for the screening inputs).

interface Match {
	readonly a: number;
	readonly b: number;
	readonly size: number;
}

/** Map each char of `b` to the ascending list of indices where it occurs. */
function buildB2J(b: string): ReadonlyMap<string, ReadonlyArray<number>> {
	const b2j = new Map<string, number[]>();
	for (let i = 0; i < b.length; i += 1) {
		const ch = b[i] as string;
		const existing = b2j.get(ch);
		if (existing === undefined) {
			b2j.set(ch, [i]);
		} else {
			existing.push(i);
		}
	}
	return b2j;
}

/** difflib.find_longest_match over a[alo:ahi] and b[blo:bhi]. */
function findLongestMatch(
	a: string,
	b2j: ReadonlyMap<string, ReadonlyArray<number>>,
	alo: number,
	ahi: number,
	blo: number,
	bhi: number,
): Match {
	let besti = alo;
	let bestj = blo;
	let bestsize = 0;
	let j2len = new Map<number, number>();
	for (let i = alo; i < ahi; i += 1) {
		const newj2len = new Map<number, number>();
		const indices = b2j.get(a[i] as string) ?? [];
		for (const j of indices) {
			if (j < blo) {
				continue;
			}
			if (j >= bhi) {
				break;
			}
			const k = (j2len.get(j - 1) ?? 0) + 1;
			newj2len.set(j, k);
			if (k > bestsize) {
				besti = i - k + 1;
				bestj = j - k + 1;
				bestsize = k;
			}
		}
		j2len = newj2len;
	}
	return { a: besti, b: bestj, size: bestsize };
}

/** Recursively collect all matching blocks (difflib.get_matching_blocks). */
function matchingBlockSizes(a: string, b: string): number {
	const b2j = buildB2J(b);
	const queue: Array<[number, number, number, number]> = [
		[0, a.length, 0, b.length],
	];
	let matched = 0;
	while (queue.length > 0) {
		const next = queue.pop();
		if (next === undefined) {
			break;
		}
		const [alo, ahi, blo, bhi] = next;
		const m = findLongestMatch(a, b2j, alo, ahi, blo, bhi);
		if (m.size === 0) {
			continue;
		}
		matched += m.size;
		if (alo < m.a && blo < m.b) {
			queue.push([alo, m.a, blo, m.b]);
		}
		if (m.a + m.size < ahi && m.b + m.size < bhi) {
			queue.push([m.a + m.size, ahi, m.b + m.size, bhi]);
		}
	}
	return matched;
}

/** Python SequenceMatcher(None, a, b).ratio() in [0, 1]. */
export function sequenceRatio(a: string, b: string): number {
	const total = a.length + b.length;
	if (total === 0) {
		return 1.0;
	}
	return (2.0 * matchingBlockSizes(a, b)) / total;
}
