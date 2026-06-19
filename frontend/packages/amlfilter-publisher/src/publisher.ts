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
import { parseEntities } from "./sourceEntity.ts";
import type { Watchlist, WatchlistEntity, WatchlistManifest } from "./types.ts";
import { packVectors, vectorsToBase64 } from "./vectors.ts";

/** Everything publishWatchlist needs. The embedder is injected so tests use a
 * fake (no 23 MB model) and the CLI passes the real Node embedder. */
export interface PublishInput {
	readonly entitiesJsonlPath: string;
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

const UTF8 = new TextEncoder();

/** Serialize a value to the canonical (stable, pretty) byte form we sign. */
function toBytes(value: Watchlist | WatchlistManifest): Uint8Array {
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

/** Read + map + embed + assemble the full watchlist document (unsigned). */
async function assembleWatchlist(input: PublishInput): Promise<Watchlist> {
	const jsonl = await readFile(input.entitiesJsonlPath, "utf8");
	const entities = parseEntities(jsonl);
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

/** Produce the four signed static files into `input.outDir`. */
export async function publishWatchlist(input: PublishInput): Promise<void> {
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
}
