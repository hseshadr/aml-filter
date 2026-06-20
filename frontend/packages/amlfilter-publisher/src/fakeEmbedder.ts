// A deterministic, model-free embedder for tests: each text maps to a fixed
// 384-d Float32 vector derived from a cheap string hash. No 23 MB weights, no
// onnxruntime — just enough to exercise the pack/serialize/sign pipeline with
// byte-stable output. (Production uses createNodeEmbedder.)

import { EMBEDDING_DIM, type Embedder } from "@amlfilter/browser";

/** FNV-1a 32-bit hash — small, deterministic, dependency-free. */
function fnv1a(text: string): number {
	let hash = 0x811c9dc5;
	for (let i = 0; i < text.length; i += 1) {
		hash ^= text.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return hash >>> 0;
}

/** Build a fake embedder whose vectors depend only on the input text. */
export function createFakeEmbedder(): Embedder {
	return {
		embed(text: string): Promise<Float32Array> {
			const seed = fnv1a(text);
			const vector = new Float32Array(EMBEDDING_DIM);
			let state = seed === 0 ? 1 : seed;
			for (let i = 0; i < EMBEDDING_DIM; i += 1) {
				// xorshift32 -> [0,1), shifted to a small signed value.
				state ^= state << 13;
				state ^= state >>> 17;
				state ^= state << 5;
				state >>>= 0;
				vector[i] = (state / 0xffffffff) * 2 - 1;
			}
			return Promise.resolve(vector);
		},
	};
}
