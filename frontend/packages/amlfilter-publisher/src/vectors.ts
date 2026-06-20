// Pack per-entity embeddings into the v3 `vectors` payload: one row-major
// little-endian Float32 buffer of length entities*dim, base64-encoded.
//
// Node is little-endian on every supported platform; the in-tab consumer
// reinterprets the SAME byte order via `new Float32Array(decode(base64)).buffer`,
// so a plain Float32Array -> Buffer -> base64 round-trips byte-for-byte. We assert
// the host endianness defensively so a (hypothetical) big-endian publisher fails
// loud rather than emitting a silently byte-swapped list.

import { endianness } from "node:os";
import { EMBEDDING_DIM, type Embedder } from "@amlfilter/browser";

/** Embed each canonical name and pack the rows into one Float32Array(n*dim). */
export async function packVectors(
	embedder: Embedder,
	names: readonly string[],
): Promise<Float32Array> {
	const packed = new Float32Array(names.length * EMBEDDING_DIM);
	for (let i = 0; i < names.length; i += 1) {
		const row = await embedder.embed(names[i] ?? "");
		if (row.length !== EMBEDDING_DIM) {
			throw new Error(
				`row ${i}: embedding has ${row.length} dims; expected ${EMBEDDING_DIM}`,
			);
		}
		packed.set(row, i * EMBEDDING_DIM);
	}
	return packed;
}

/** Base64-encode a Float32Array as its raw little-endian byte buffer. */
export function vectorsToBase64(packed: Float32Array): string {
	if (endianness() !== "LE") {
		throw new Error(
			"publisher requires a little-endian host (vectors are emitted LE)",
		);
	}
	return Buffer.from(
		packed.buffer,
		packed.byteOffset,
		packed.byteLength,
	).toString("base64");
}
