// publishWatchlist — the v3 signed-watchlist producer.
//
// Pipeline: read JSONL -> map to wire entities (recompute name_canonical, sort
// countries, dob[0]??null, alias names) -> embed each canonical name -> pack one
// row-major little-endian Float32 buffer -> base64 -> assemble watchlist.json ->
// sign the EXACT bytes -> write file + .sig -> build the manifest -> sign -> write.
//
// Serialization is deterministic: object key order is fixed by the literal shape
// and JSON.stringify(…, 2) is stable, so identical (input, version, generatedAt,
// embedder) ⇒ identical bytes (the determinism test locks this).

import { mkdir, readFile } from "node:fs/promises";
import {
	EMBEDDING_DIM,
	EMBEDDING_MODEL,
	type Embedder,
} from "@amlfilter/browser";
import { writeSigned } from "./signing.ts";
import { parseEntities, toWatchlistEntity } from "./sourceEntity.ts";
import type { SourceLine } from "./sources/source.ts";
import type { Watchlist, WatchlistEntity, WatchlistManifest } from "./types.ts";
import { packVectors, vectorsToBase64 } from "./vectors.ts";

/** Everything publishWatchlist needs, minus the entity source. The embedder is
 * injected so tests use a fake (no 23 MB model) and the CLI passes the real
 * Node embedder. */
interface PublishCommon {
	readonly version: string;
	/** Raw 32-byte Ed25519 private seed. */
	readonly privateKey: Uint8Array;
	readonly outDir: string;
	readonly embedder: Embedder;
	/** ISO-8601 UTC instant; injected for deterministic test/demo output. */
	readonly generatedAt?: string;
	/** Defaults to the entities' shared source_list, else "OFAC_SDN". */
	readonly listId?: string;
}

/** Publish from a source-entities JSONL file on disk. */
export interface PublishFromJsonl extends PublishCommon {
	readonly entitiesJsonlPath: string;
}

/** Publish from already-parsed adapter SourceLines (the multi-list path). */
export interface PublishFromLines extends PublishCommon {
	readonly sourceLines: readonly SourceLine[];
}

export type PublishInput = PublishFromJsonl | PublishFromLines;

const UTF8 = new TextEncoder();

/** Serialize a value to the canonical (stable, pretty) byte form we sign.
 * Pretty-printed with a trailing newline so the signed bytes are deterministic
 * and diff-friendly. Shared by the watchlist, manifest, and catalog writers. */
export function toBytes(value: unknown): Uint8Array {
	return UTF8.encode(`${JSON.stringify(value, null, 2)}\n`);
}

/** Pick the list id: explicit override, else the entities' shared source_list,
 * else the OFAC default. */
function resolveListId(
	override: string | undefined,
	entities: readonly WatchlistEntity[],
): string {
	if (override !== undefined) {
		return override;
	}
	const first = entities[0]?.source_list;
	return first ?? "OFAC_SDN";
}

function buildManifest(list: Watchlist): WatchlistManifest {
	return {
		listId: list.listId,
		version: list.version,
		generatedAt: list.generatedAt,
		model: list.model,
		dim: list.dim,
		entitiesCount: list.entities.length,
	};
}

/** Resolve the wire entities from whichever source the input carries. */
async function resolveEntities(
	input: PublishInput,
): Promise<WatchlistEntity[]> {
	if ("sourceLines" in input) {
		return input.sourceLines.map((line, i) => toWatchlistEntity(line, i + 1));
	}
	return parseEntities(await readFile(input.entitiesJsonlPath, "utf8"));
}

/** Read + map + embed + assemble the full watchlist document (unsigned). */
async function assembleWatchlist(input: PublishInput): Promise<Watchlist> {
	const entities = await resolveEntities(input);
	const packed = await packVectors(
		input.embedder,
		entities.map((e) => e.name_canonical),
	);
	return {
		listId: resolveListId(input.listId, entities),
		version: input.version,
		generatedAt: input.generatedAt ?? new Date().toISOString(),
		model: EMBEDDING_MODEL,
		dim: EMBEDDING_DIM,
		entities,
		vectors: vectorsToBase64(packed),
	};
}

/** Produce the four signed static files into `input.outDir`; returns the
 * manifest (its version + count feed the signed catalog). */
export async function publishWatchlist(
	input: PublishInput,
): Promise<WatchlistManifest> {
	const list = await assembleWatchlist(input);
	await mkdir(input.outDir, { recursive: true });
	await writeSigned(
		input.outDir,
		"watchlist.json",
		toBytes(list),
		input.privateKey,
	);
	const manifest = buildManifest(list);
	await writeSigned(
		input.outDir,
		"watchlist.manifest.json",
		toBytes(manifest),
		input.privateKey,
	);
	return manifest;
}
