// The decompression bound, exercised against the REAL decoder.
//
// @hpcc-js/wasm-zstd 1.15.0 removed `decompressChunk`'s `outputSize` parameter
// ("Callers must not guess an output size"). Because JS drops extra arguments
// silently, the old two-argument call kept compiling and running while bounding
// nothing. These tests pin the replacement: the frame header is parsed and the
// declared size checked BEFORE any byte reaches the decoder.
//
// The bomb these numbers come from: `Zstd.compress(new Uint8Array(4 MiB))` is
// 147 compressed bytes. Under 1.13.4, `decompressChunk(bomb, LIMIT + 1)` capped
// output at 262145 bytes; under 1.15.0 the same call returns all 4194304.

/// <reference types="node" />

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Zstd } from "@hpcc-js/wasm-zstd";
import { beforeAll, describe, expect, it } from "vitest";
import {
	DecompressionLimitError,
	declaredContentSize,
	decompress,
	UndeclaredSizeError,
} from "./zstd";

const LIMIT = 256 * 1024;
// sync -> engine -> src -> amlfilter-browser -> packages -> frontend.
const HERE = dirname(fileURLToPath(import.meta.url));
const CHUNKS = join(
	HERE,
	"..",
	"..",
	"..",
	"..",
	"..",
	"app",
	"public",
	"bundle",
	"origin",
	"chunk",
);

let zstd: Awaited<ReturnType<typeof Zstd.load>>;

beforeAll(async () => {
	zstd = await Zstd.load();
});

/** A frame that declines to declare its size: streaming compression omits the
 * Frame_Content_Size field entirely (descriptor 0x00). */
function streamedFrame(byteLength: number): Uint8Array {
	zstd.resetCompression();
	const head = zstd.compressChunk(new Uint8Array(byteLength));
	const tail = zstd.compressEnd();
	const out = new Uint8Array(head.byteLength + tail.byteLength);
	out.set(head, 0);
	out.set(tail, head.byteLength);
	return out;
}

/** A structurally valid single frame that DECLARES `declaredSize` while its one
 * RLE block emits a single byte -- a frame whose header lies about its output. */
function rleFrame(declaredSize: number): Uint8Array {
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

function concat(...parts: readonly Uint8Array[]): Uint8Array {
	const total = parts.reduce((n, p) => n + p.byteLength, 0);
	const out = new Uint8Array(total);
	let at = 0;
	for (const part of parts) {
		out.set(part, at);
		at += part.byteLength;
	}
	return out;
}

describe("declaredContentSize", () => {
	it("reads the declared size of every chunk in the committed demo bundle", () => {
		const names = readdirSync(CHUNKS);
		expect(names.length).toBeGreaterThan(0);
		for (const name of names) {
			const bytes = new Uint8Array(readFileSync(join(CHUNKS, name)));
			// The producer's real output must be accepted, and its declaration
			// must be the truth: equal to what the decoder actually emits.
			expect(declaredContentSize(bytes)).toBe(
				zstd.decompress(bytes).byteLength,
			);
		}
	});

	it("reads every Frame_Content_Size field width", () => {
		// 1-byte field, then the 2-byte form (stores size - 256), then 4-byte.
		for (const size of [0, 1, 255, 256, 257, 65791, 65792, LIMIT]) {
			expect(declaredContentSize(zstd.compress(new Uint8Array(size)))).toBe(
				size,
			);
		}
	});

	it("returns null for bytes that are not a zstd frame", () => {
		expect(declaredContentSize(new Uint8Array(0))).toBeNull();
		expect(declaredContentSize(new Uint8Array(64))).toBeNull();
		expect(
			declaredContentSize(new TextEncoder().encode("not zstd at all")),
		).toBeNull();
	});

	it("returns null for a frame that omits its Frame_Content_Size", () => {
		expect(declaredContentSize(streamedFrame(5000))).toBeNull();
	});

	it("returns null for concatenated frames", () => {
		// decompressChunk decodes BOTH frames in one call, so the first frame's
		// declaration does not bound the output. No bound => refused.
		const one = zstd.compress(new Uint8Array(1024));
		expect(declaredContentSize(one)).toBe(1024);
		expect(declaredContentSize(concat(one, one))).toBeNull();
	});

	it("returns null for a frame with trailing bytes", () => {
		const frame = zstd.compress(new Uint8Array(1024));
		expect(declaredContentSize(concat(frame, new Uint8Array([0])))).toBeNull();
	});

	it("returns null for a truncated frame", () => {
		const frame = zstd.compress(new Uint8Array(200_000));
		expect(
			declaredContentSize(frame.slice(0, frame.byteLength - 1)),
		).toBeNull();
	});

	it("reads the 8-byte Frame_Content_Size a huge declaration uses", () => {
		// The widest field, and the one a serious bomb would use: single-segment,
		// Frame_Content_Size_flag=3, declaring 8 GiB in a 17-byte frame.
		const bytes = new Uint8Array(17);
		const view = new DataView(bytes.buffer);
		view.setUint32(0, 0xfd2f_b528, true);
		view.setUint8(4, 0xe0); // flag=3 (8 bytes) | Single_Segment
		view.setBigUint64(5, 8n * 1024n * 1024n * 1024n, true);
		const header = (1 << 3) | (1 << 1) | 1; // Block_Size=1 | RLE | Last_Block
		view.setUint8(13, header & 0xff);
		view.setUint8(14, (header >>> 8) & 0xff);
		view.setUint8(15, (header >>> 16) & 0xff);

		expect(declaredContentSize(bytes)).toBe(8 * 1024 * 1024 * 1024);
	});

	it("accounts for the trailing Content_Checksum when one is present", () => {
		// Frames written with a content checksum (zstd --check) carry 4 extra
		// trailing bytes. They belong to the frame, so the span check must expect
		// them -- otherwise every checksummed chunk would look like it had
		// trailing garbage and be refused.
		const bytes = new Uint8Array(17);
		const view = new DataView(bytes.buffer);
		view.setUint32(0, 0xfd2f_b528, true);
		view.setUint8(4, 0xa4); // flag=2 (4-byte FCS) | Single_Segment | Content_Checksum
		view.setUint32(5, 64, true);
		const header = (1 << 3) | (1 << 1) | 1; // Block_Size=1 | RLE | Last_Block
		view.setUint8(9, header & 0xff);
		view.setUint8(10, (header >>> 8) & 0xff);
		view.setUint8(11, (header >>> 16) & 0xff);

		expect(declaredContentSize(bytes)).toBe(64);
		// Without the 4 checksum bytes the frame no longer spans the input.
		expect(declaredContentSize(bytes.slice(0, 13))).toBeNull();
	});

	it("returns null when the descriptor sets its reserved bits", () => {
		// Bits 4 and 3 of Frame_Header_Descriptor are "unused" and "reserved".
		// A frame that sets them is not one we agree to interpret.
		const bytes = rleFrame(64);
		bytes[4] = 0xa0 | 0b0001_1000;
		expect(declaredContentSize(bytes)).toBeNull();
	});

	it("returns null when the header stops inside its Frame_Content_Size", () => {
		// Descriptor 0xA0 promises a 4-byte FCS at offset 5, so the frame needs
		// at least 9 bytes to carry its own declaration.
		expect(declaredContentSize(rleFrame(64).slice(0, 7))).toBeNull();
	});

	it("returns null when a Block_Header runs past the end", () => {
		expect(declaredContentSize(rleFrame(64).slice(0, 11))).toBeNull();
	});

	it("returns null for a reserved Block_Type", () => {
		const bytes = rleFrame(64);
		// Block_Size=1 | Block_Type=3 (reserved) | Last_Block=1.
		const header = (1 << 3) | (3 << 1) | 1;
		bytes[9] = header & 0xff;
		bytes[10] = (header >>> 8) & 0xff;
		bytes[11] = (header >>> 16) & 0xff;
		expect(declaredContentSize(bytes)).toBeNull();
	});
});

describe("decompress bound", () => {
	it("round-trips a chunk exactly at the limit", async () => {
		const compressed = zstd.compress(new Uint8Array(LIMIT));
		await expect(decompress(compressed, LIMIT)).resolves.toHaveLength(LIMIT);
	});

	it("rejects a hostile frame before it reaches the decoder", async () => {
		// 4 MiB declared in ~147 compressed bytes. The declaration alone is
		// grounds for refusal; nothing is decoded.
		const bomb = zstd.compress(new Uint8Array(4 * 1024 * 1024));
		expect(bomb.byteLength).toBeLessThan(1024);
		expect(declaredContentSize(bomb)).toBe(4 * 1024 * 1024);

		await expect(decompress(bomb, LIMIT)).rejects.toBeInstanceOf(
			DecompressionLimitError,
		);
	});

	it("refuses an over-limit declaration without consulting the decoder", async () => {
		// Structurally valid single frame -- so the frame walk passes it -- that
		// declares 4 MiB while its one RLE block emits a single byte. Only the
		// DECLARATION can reject this: hand these bytes to the real decoder and
		// it reports "Data corruption detected", a different error entirely. The
		// error class is therefore proof the declaration was checked first.
		const lying = rleFrame(4 * 1024 * 1024);
		expect(declaredContentSize(lying)).toBe(4 * 1024 * 1024);
		expect(() => zstd.decompress(lying)).toThrow(/corruption/i);

		await expect(decompress(lying, LIMIT)).rejects.toBeInstanceOf(
			DecompressionLimitError,
		);
	});

	it("rejects one byte over the limit", async () => {
		const compressed = zstd.compress(new Uint8Array(LIMIT + 1));
		await expect(decompress(compressed, LIMIT)).rejects.toBeInstanceOf(
			DecompressionLimitError,
		);
	});

	it("refuses concatenated frames even when their total is under the limit", async () => {
		// The single-frame binding, isolated: 8 KiB of output is well within the
		// limit, so ONLY the "exactly one frame" rule can reject this. Without
		// that rule the same shape scales -- 512 KiB of repeated 147-byte bombs
		// decodes to ~14.9 GB in one decompressChunk call.
		const one = zstd.compress(new Uint8Array(1024));
		const eight = concat(one, one, one, one, one, one, one, one);
		expect(eight.byteLength).toBeLessThan(LIMIT);

		await expect(decompress(eight, LIMIT)).rejects.toBeInstanceOf(
			UndeclaredSizeError,
		);
	});

	it("refuses a frame that declines to declare its size", async () => {
		await expect(decompress(streamedFrame(5000), LIMIT)).rejects.toBeInstanceOf(
			UndeclaredSizeError,
		);
	});

	it("refuses non-zstd bytes", async () => {
		await expect(
			decompress(new TextEncoder().encode("not zstd"), LIMIT),
		).rejects.toBeInstanceOf(UndeclaredSizeError);
	});
});
