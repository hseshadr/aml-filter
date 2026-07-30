// Shared fail-closed content-address rule: a chunk's name is sha256(plaintext).
// Both CacheStore implementations route ingest + read through these so the
// integrity boundary is identical (mirrors edge-proc cas.py _verify_or_remove).

import { sha256Hex } from "../crypto";
import {
	DecompressionLimitError,
	decompress,
	UndeclaredSizeError,
} from "./zstd";

/** FastCDC's producer contract forces plaintext cuts at 256 KiB. Compressed
 * bytes get 2× headroom for incompressible zstd overhead, but no more. */
export const MAX_DECOMPRESSED_CHUNK_BYTES = 256 * 1024;
export const MAX_COMPRESSED_CHUNK_BYTES = 512 * 1024;

/** A stored object failed its content-address / decompress check (fail-closed). */
export class IntegrityError extends Error {
	public constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = "IntegrityError";
	}
}

/** Decompress + verify sha256(plaintext) == chunkHash, else throw. Returns plaintext. */
export async function decompressAndVerify(
	chunkHash: string,
	compressed: Uint8Array,
): Promise<Uint8Array> {
	if (compressed.byteLength > MAX_COMPRESSED_CHUNK_BYTES) {
		throw new IntegrityError(
			`chunk ${chunkHash} exceeded the ${MAX_COMPRESSED_CHUNK_BYTES}-byte compressed byte limit`,
		);
	}
	let plaintext: Uint8Array;
	try {
		plaintext = await decompress(compressed, MAX_DECOMPRESSED_CHUNK_BYTES);
	} catch (cause) {
		if (cause instanceof DecompressionLimitError) {
			throw new IntegrityError(
				`chunk ${chunkHash} exceeded the ${MAX_DECOMPRESSED_CHUNK_BYTES}-byte decompressed byte limit`,
				{ cause },
			);
		}
		if (cause instanceof UndeclaredSizeError) {
			throw new IntegrityError(
				`chunk ${chunkHash} does not declare a decompressed size we can bound`,
				{ cause },
			);
		}
		throw new IntegrityError(`chunk ${chunkHash} failed to decompress`, {
			cause,
		});
	}
	if ((await sha256Hex(plaintext)) !== chunkHash) {
		throw new IntegrityError(`chunk ${chunkHash} failed content-address check`);
	}
	return plaintext;
}

/** Verify plaintext sha256 matches the chunk name, else throw. */
export async function verifyPlaintext(
	chunkHash: string,
	plaintext: Uint8Array,
): Promise<void> {
	if ((await sha256Hex(plaintext)) !== chunkHash) {
		throw new IntegrityError(`chunk ${chunkHash} failed content-address check`);
	}
}
