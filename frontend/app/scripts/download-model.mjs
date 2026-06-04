// Prebuild: self-host the MiniLM embedder weights so /screen never depends on
// huggingface.co at runtime.
//
// The in-browser /screen demo (the @amlfilter/browser tier) embeds the query
// with transformers.js model `Xenova/all-MiniLM-L6-v2`. In the browser the ONNX
// runtime device is `wasm`, whose default dtype in @huggingface/transformers is
// `q8` → the `_quantized` suffix → it requests `onnx/model_quantized.onnx`
// (~23 MB). With `env.allowLocalModels = true` + `env.localModelPath = "/models/"`,
// transformers.js resolves every file as
//   `/models/Xenova/all-MiniLM-L6-v2/<file>`
// i.e. pathJoin(localModelPath, modelId, file) — so the layout this script writes
// under app/public/models/ matches the runtime's request URLs byte-for-byte.
//
// This script is run by the app's `prebuild` npm hook, so `pnpm build` always
// materializes the weights into the SPA's public/ before Vite copies it into
// dist/. The weights are git-ignored (see app/.gitignore) — a portfolio reader
// runs `pnpm build` and the files appear locally; they are never committed.
//
// Idempotent: a file already present at its expected non-zero size is skipped.
// Fail-loud: any HTTP error, short/empty body, or size mismatch aborts the build
// with a non-zero exit — a silent CDN fallback at runtime is exactly what we are
// eliminating, so a half-populated local mirror must never pass quietly.

import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** The transformers.js model id; its files live under this path on the HF hub. */
export const MODEL_ID = "Xenova/all-MiniLM-L6-v2";

/** The HF hub origin the prebuild (NOT the runtime) downloads weights from. */
export const HF_BASE = "https://huggingface.co";

/**
 * The exact files transformers.js requests for a feature-extraction pipeline on
 * the wasm (browser) device, with their published byte sizes. The ONNX export is
 * `model_quantized.onnx` because wasm defaults to the `q8` dtype. Sizes are the
 * hub's real content lengths and double as a fail-loud integrity floor.
 */
export const MODEL_FILES = Object.freeze([
	Object.freeze({ path: "config.json", size: 650 }),
	Object.freeze({ path: "tokenizer.json", size: 711661 }),
	Object.freeze({ path: "tokenizer_config.json", size: 366 }),
	Object.freeze({ path: "special_tokens_map.json", size: 125 }),
	Object.freeze({ path: "onnx/model_quantized.onnx", size: 22972370 }),
]);

/** Where the mirrored weights land: app/public/models/<MODEL_ID>/<file>. */
export function modelDir() {
	const here = dirname(fileURLToPath(import.meta.url));
	return join(here, "..", "public", "models", MODEL_ID);
}

/** The hub URL a given model-relative file is fetched from. */
export function sourceUrl(filePath) {
	return `${HF_BASE}/${MODEL_ID}/resolve/main/${filePath}`;
}

/**
 * Decide whether a file must be (re)downloaded. A file is skipped only when it
 * already exists AND its on-disk size is at least its expected size — a short
 * (truncated/partial) file is treated as missing so it is refetched. Pure and
 * I/O-free: the caller supplies the observed size (or undefined if absent).
 */
export function needsDownload(expectedSize, actualSize) {
	if (actualSize === undefined) {
		return true;
	}
	return actualSize < expectedSize;
}

async function fileSize(absPath) {
	try {
		return (await stat(absPath)).size;
	} catch {
		return undefined;
	}
}

async function downloadOne(file, destDir) {
	const dest = join(destDir, file.path);
	const observed = await fileSize(dest);
	if (!needsDownload(file.size, observed)) {
		console.log(`  skip   ${file.path} (${observed} bytes)`);
		return;
	}
	const url = sourceUrl(file.path);
	const res = await fetch(url);
	if (!res.ok) {
		throw new Error(`GET ${url} -> HTTP ${res.status} ${res.statusText}`);
	}
	const bytes = new Uint8Array(await res.arrayBuffer());
	if (bytes.byteLength < file.size) {
		throw new Error(
			`${file.path}: got ${bytes.byteLength} bytes, expected >= ${file.size}`,
		);
	}
	await mkdir(dirname(dest), { recursive: true });
	await writeFile(dest, bytes);
	console.log(`  fetch  ${file.path} (${bytes.byteLength} bytes)`);
}

/** Download every model file into `destDir`, skipping ones already present. */
export async function downloadModel(destDir) {
	console.log(`Self-hosting ${MODEL_ID} weights into ${destDir}`);
	await mkdir(destDir, { recursive: true });
	for (const file of MODEL_FILES) {
		await downloadOne(file, destDir);
	}
	console.log("Model weights ready (local, no runtime CDN dependency).");
}

const invokedDirectly =
	process.argv[1] !== undefined &&
	fileURLToPath(import.meta.url) === process.argv[1];

if (invokedDirectly) {
	downloadModel(modelDir()).catch((err) => {
		console.error(`\nModel download FAILED: ${err.message}`);
		process.exit(1);
	});
}
