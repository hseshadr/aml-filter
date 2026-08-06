// Deterministic sampling for the recall gate.
//
// Measuring every alias query against the full list takes minutes; the CI gate
// runs on every pull request, so it measures a SAMPLE of the queries against the
// FULL corpus. Sampling queries is unbiased — the haystack is untouched, so a
// retrieved rank is the real rank among all 19k entities. Shrinking the corpus
// instead would inflate recall and report a number nobody experiences.
//
// The sample must be reproducible or the gate is not a ratchet: the same seed
// and the same fixture must always select the same queries, so a recall change
// between two runs is a change in the RANKER, never a change in the questions.
// Hence an explicit seeded PRNG rather than Math.random.

/**
 * mulberry32 — a small, fast, fully specified 32-bit PRNG. Chosen over
 * `Math.random` for the only property that matters here: an identical sequence
 * from an identical seed, across engines and platforms.
 *
 * Exported so the decision harness's negative generator (../decision/negatives)
 * draws from the SAME generator this sampler does. Two seeded PRNGs in one
 * repository is two definitions of "reproducible".
 */
export function mulberry32(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/**
 * A seeded, uniform sample of `size` items, in a stable order.
 *
 * A partial Fisher-Yates shuffle over a copy: every item has the same selection
 * probability, and the result is re-sorted back into the input's own order so
 * the report reads in feed order rather than shuffle order. Asking for at least
 * as many items as exist returns all of them, unshuffled.
 */
export function sampleDeterministic<T>(
	items: readonly T[],
	size: number,
	seed: number,
): readonly T[] {
	if (size >= items.length) {
		return items;
	}
	if (size <= 0) {
		return [];
	}
	const indices = items.map((_, i) => i);
	const random = mulberry32(seed);
	for (let i = 0; i < size; i += 1) {
		const j = i + Math.floor(random() * (indices.length - i));
		const a = indices[i] as number;
		const b = indices[j] as number;
		indices[i] = b;
		indices[j] = a;
	}
	return indices
		.slice(0, size)
		.sort((a, b) => a - b)
		.map((i) => items[i] as T);
}
