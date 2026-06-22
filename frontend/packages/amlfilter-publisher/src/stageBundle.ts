// Stage a deterministic bundle tree for `edgeproc publish` to chunk + sign.
//
// `edgeproc publish` content-addresses every file under a --src dir: the chunk
// and manifest hashes are a PURE FUNCTION of these bytes, so this staging must
// be byte-stable. We therefore serialize with fixed key order (the WatchlistEntity
// schema order; sorted catalog/meta keys) and a caller-supplied `generatedAt`.
//
// Layout written under `outDir` (mirrored, after publish, into the bundle the
// in-tab sync tier materializes):
//   catalog.json                 { schemaVersion, generatedAt, lists:[{id,title,slug,version,entitiesCount}] }
//   <slug>/entities.jsonl        one WatchlistEntity JSON per line (stable key order)
//   <slug>/vectors.f32           raw LE Float32, row-major (entities*dim)
//   <slug>/meta.json             { listId, version, generatedAt, model, dim, entitiesCount }

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { WatchlistEntity } from "./types.ts";
import { vectorsToBytes } from "./vectors.ts";

/** One list to stage: its catalog identity, entities, and packed name vectors. */
export interface StagedList {
	readonly listId: string;
	readonly slug: string;
	readonly title: string;
	readonly version: string;
	readonly model: string;
	readonly dim: number;
	readonly entities: readonly WatchlistEntity[];
	/** Row-major packed name vectors; length MUST equal entities.length * dim. */
	readonly vectors: Float32Array;
}

/** Top-level catalog registry entry for a staged list. */
interface BundleCatalogList {
	readonly id: string;
	readonly title: string;
	readonly slug: string;
	readonly version: string;
	readonly entitiesCount: number;
}

/** The staged top-level `catalog.json`. */
interface BundleCatalog {
	readonly schemaVersion: 1;
	readonly generatedAt: string;
	readonly lists: readonly BundleCatalogList[];
}

/** The staged per-list `meta.json`. */
interface BundleListMeta {
	readonly listId: string;
	readonly version: string;
	readonly generatedAt: string;
	readonly model: string;
	readonly dim: number;
	readonly entitiesCount: number;
}

const ENCODER = new TextEncoder();

/** Pretty-JSON + trailing newline, fixed key order (matches publisher.toBytes). */
function jsonBytes(value: unknown): Uint8Array {
	return ENCODER.encode(`${JSON.stringify(value, null, 2)}\n`);
}

/** Serialize one entity with the fixed WatchlistEntity schema key order. */
function entityLine(e: WatchlistEntity): string {
	const ordered: WatchlistEntity = {
		entity_id: e.entity_id,
		name_canonical: e.name_canonical,
		aliases: e.aliases,
		dob: e.dob,
		countries: e.countries,
		risk_category: e.risk_category,
		source_list: e.source_list,
		list_version: e.list_version,
	};
	return JSON.stringify(ordered);
}

/** All entities as newline-delimited JSON (one per line, trailing newline). */
function entitiesJsonl(entities: readonly WatchlistEntity[]): Uint8Array {
	return ENCODER.encode(`${entities.map(entityLine).join("\n")}\n`);
}

function listMeta(list: StagedList, generatedAt: string): BundleListMeta {
	return {
		listId: list.listId,
		version: list.version,
		generatedAt,
		model: list.model,
		dim: list.dim,
		entitiesCount: list.entities.length,
	};
}

function catalogEntry(list: StagedList): BundleCatalogList {
	return {
		id: list.listId,
		title: list.title,
		slug: list.slug,
		version: list.version,
		entitiesCount: list.entities.length,
	};
}

async function stageOne(
	outDir: string,
	list: StagedList,
	generatedAt: string,
): Promise<void> {
	const expected = list.entities.length * list.dim;
	if (list.vectors.length !== expected) {
		throw new Error(
			`list ${list.listId}: vectors length ${list.vectors.length} != entities*dim (${expected})`,
		);
	}
	const listDir = join(outDir, list.slug);
	await mkdir(listDir, { recursive: true });
	await writeFile(
		join(listDir, "entities.jsonl"),
		entitiesJsonl(list.entities),
	);
	await writeFile(join(listDir, "vectors.f32"), vectorsToBytes(list.vectors));
	await writeFile(
		join(listDir, "meta.json"),
		jsonBytes(listMeta(list, generatedAt)),
	);
}

/**
 * Write the deterministic staging tree for `lists` into `outDir`. `generatedAt`
 * is injected (ISO-8601 UTC) so identical (lists, generatedAt) ⇒ identical bytes.
 */
export async function stageBundle(
	outDir: string,
	lists: readonly StagedList[],
	generatedAt: string,
): Promise<void> {
	await mkdir(outDir, { recursive: true });
	for (const list of lists) {
		await stageOne(outDir, list, generatedAt);
	}
	const catalog: BundleCatalog = {
		schemaVersion: 1,
		generatedAt,
		lists: lists.map(catalogEntry),
	};
	await writeFile(join(outDir, "catalog.json"), jsonBytes(catalog));
}
