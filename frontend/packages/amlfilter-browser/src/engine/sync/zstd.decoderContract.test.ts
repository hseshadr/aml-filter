// What `decompress` demands OF THE DECODER, proven with a scriptable stand-in.
//
// Two of the three gates cannot be driven from real bytes, because libzstd
// already refuses to emit more content than a frame declares and the frame walk
// in `declaredContentSize` already rejects truncated input. Stubbing the decoder
// is what makes them non-vacuous: it lets us break the property (a decoder that
// over-produces, a decoder that reports a truncated frame) and watch the guard
// hold. That failure mode is not hypothetical -- it is exactly what 1.15.0's
// dropped `outputSize` parameter turned the old code into.
//
// It also gives the pre-decode claim its direct proof: for a refused frame the
// decoder records ZERO calls, so no attacker byte was ever handed to WASM.

import { beforeEach, describe, expect, it, vi } from "vitest";

const decoder = {
	/** Every buffer handed to decompressChunk, in order. Empty => nothing decoded. */
	calls: [] as Uint8Array[],
	/** What decompressChunk returns. */
	output: new Uint8Array(0),
	/** When set, decompressEnd throws it (libzstd reports truncated frames here). */
	endError: null as Error | null,
	resets: 0,
};

vi.mock("@hpcc-js/wasm-zstd", () => ({
	Zstd: {
		load: async () => ({
			resetDecompression: () => {
				decoder.resets += 1;
			},
			decompressChunk: (bytes: Uint8Array) => {
				decoder.calls.push(bytes);
				return decoder.output;
			},
			decompressEnd: () => {
				if (decoder.endError !== null) {
					throw decoder.endError;
				}
			},
		}),
	},
}));

const { DecompressionLimitError, decompress, UndeclaredSizeError } =
	await import("./zstd");

const LIMIT = 256 * 1024;

/** A minimal, structurally valid single zstd frame: single-segment, a 4-byte
 * Frame_Content_Size declaring `declaredSize`, and one RLE block. Its body is
 * never really decoded here -- the decoder above is a stand-in. */
function frame(declaredSize: number): Uint8Array {
	const bytes = new Uint8Array(13);
	const view = new DataView(bytes.buffer);
	view.setUint32(0, 0xfd2f_b528, true);
	view.setUint8(4, 0xa0); // Frame_Content_Size_flag=2 (4 bytes) | Single_Segment
	view.setUint32(5, declaredSize, true);
	// Block_Header: Block_Size=1 | Block_Type=RLE(1) | Last_Block=1.
	const header = (1 << 3) | (1 << 1) | 1;
	view.setUint8(9, header & 0xff);
	view.setUint8(10, (header >>> 8) & 0xff);
	view.setUint8(11, (header >>> 16) & 0xff);
	return bytes;
}

beforeEach(() => {
	decoder.calls = [];
	decoder.output = new Uint8Array(0);
	decoder.endError = null;
	decoder.resets = 0;
});

describe("nothing reaches the decoder unless it is already bounded", () => {
	it("hands the decoder ZERO bytes when the frame declares more than the limit", async () => {
		await expect(
			decompress(frame(4 * 1024 * 1024), LIMIT),
		).rejects.toBeInstanceOf(DecompressionLimitError);
		expect(decoder.calls).toHaveLength(0);
		expect(decoder.resets).toBe(0);
	});

	it("hands the decoder ZERO bytes when the input is not one declaring frame", async () => {
		const two = new Uint8Array(26);
		two.set(frame(64), 0);
		two.set(frame(64), 13);

		await expect(decompress(two, LIMIT)).rejects.toBeInstanceOf(
			UndeclaredSizeError,
		);
		expect(decoder.calls).toHaveLength(0);
	});

	it("decodes a frame whose declaration is within the limit", async () => {
		decoder.output = new Uint8Array(64);

		await expect(decompress(frame(64), LIMIT)).resolves.toHaveLength(64);
		expect(decoder.calls).toHaveLength(1);
		expect(decoder.resets).toBe(1);
	});
});

describe("the decoder's own completion report is honoured", () => {
	it("propagates a truncated-frame report instead of returning partial output", async () => {
		// libzstd surfaces truncation from decompressEnd(), AFTER decompressChunk
		// has already returned a short buffer without complaint.
		decoder.output = new Uint8Array(10);
		decoder.endError = new Error(
			"decompressEnd failed: truncated Zstandard input",
		);

		await expect(decompress(frame(64), LIMIT)).rejects.toThrow(
			/truncated Zstandard input/,
		);
	});
});

describe("the output length is re-checked after decoding", () => {
	it("rejects output over the limit even though the frame declared it was under", async () => {
		// A decoder that emits more than the frame declared is the failure this
		// gate exists for -- and is precisely what the silently-ignored
		// `outputSize` argument allowed.
		decoder.output = new Uint8Array(LIMIT + 1);

		await expect(decompress(frame(64), LIMIT)).rejects.toBeInstanceOf(
			DecompressionLimitError,
		);
	});

	it("accepts output of exactly the limit", async () => {
		decoder.output = new Uint8Array(LIMIT);

		await expect(decompress(frame(64), LIMIT)).resolves.toHaveLength(LIMIT);
	});
});
