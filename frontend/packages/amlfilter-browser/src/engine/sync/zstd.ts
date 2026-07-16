// One-shot zstd decompression of verbatim chunk bytes, via @hpcc-js/wasm-zstd.
// The producer serves the exact zstd file; the consumer decompresses without
// re-compressing (mirrors edge-proc's put_chunk_compressed ingest path).

import { Zstd } from "@hpcc-js/wasm-zstd";

let instance: Awaited<ReturnType<typeof Zstd.load>> | null = null;

async function load(): Promise<Awaited<ReturnType<typeof Zstd.load>>> {
	if (instance === null) {
		instance = await Zstd.load();
	}
	return instance;
}

export class DecompressionLimitError extends Error {
	public constructor(limitBytes: number) {
		super(
			`zstd output exceeded the ${limitBytes}-byte decompressed byte limit`,
		);
		this.name = "DecompressionLimitError";
	}
}

/** Decompress into a fixed-size streaming buffer. Allocating `limit + 1` lets
 * us distinguish an allowed maximum-sized chunk from a zstd expansion bomb
 * without first allocating the frame's attacker-controlled declared size. */
export async function decompress(
	bytes: Uint8Array,
	limitBytes: number,
): Promise<Uint8Array> {
	const zstd = await load();
	zstd.reset();
	const plaintext = zstd.decompressChunk(bytes, limitBytes + 1);
	if (plaintext.byteLength > limitBytes) {
		throw new DecompressionLimitError(limitBytes);
	}
	return plaintext;
}
