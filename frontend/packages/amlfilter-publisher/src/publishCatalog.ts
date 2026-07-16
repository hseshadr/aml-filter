// publishCatalog — the multi-list, real-fetch catalog producer (the production
// retired flat-wire path). Every configured source is required: all fetch and
// parse before any output is written, so an unavailable or empty source aborts
// instead of producing a misleading partial sanctions catalog. Each list is published to
// <outDir>/<slug>/ with the production key, then a single signed catalog.json
// (the trust anchor, same key) lists them.
//
// Orchestration only — it reuses publishWatchlist + buildCatalog +
// writeSignedCatalog and never duplicates publish/sign logic. Fails closed if no
// list fetched (an empty, useless catalog is never published).

import type { Embedder } from "@amlfilter/browser";
import {
	buildCatalog,
	type CatalogList,
	writeSignedCatalog,
} from "./catalog.ts";
import { publishWatchlist } from "./publisher.ts";
import type { WatchlistSource } from "./sources/source.ts";

/** One source to attempt: the adapter + the catalog path slug (e.g. "ofac"). */
export interface CatalogSourceSpec {
	readonly source: WatchlistSource;
	/** The per-list subdir + catalog `path` (written as "<slug>/"). */
	readonly slug: string;
}

export interface PublishCatalogInput {
	readonly sources: readonly CatalogSourceSpec[];
	readonly version: string;
	/** Raw 32-byte Ed25519 private seed (the production signing key). */
	readonly privateKey: Uint8Array;
	readonly outDir: string;
	readonly embedder: Embedder;
	/** ISO-8601 UTC instant; injected for deterministic test/demo output. */
	readonly generatedAt?: string;
}

interface PreparedSource {
	readonly spec: CatalogSourceSpec;
	readonly sourceLines: ReturnType<WatchlistSource["parse"]>;
}

async function prepareOne(
	spec: CatalogSourceSpec,
	version: string,
): Promise<PreparedSource> {
	let raw: Awaited<ReturnType<WatchlistSource["fetchRaw"]>>;
	try {
		raw = await spec.source.fetchRaw();
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		throw new Error(
			`${spec.source.id}: required feed fetch failed: ${reason}`,
			{ cause: error },
		);
	}
	const sourceLines = spec.source.parse(raw, version);
	if (sourceLines.length === 0) {
		throw new Error(`${spec.source.id}: required feed parsed zero entities`);
	}
	return { spec, sourceLines };
}

async function publishOne(
	prepared: PreparedSource,
	input: PublishCatalogInput,
): Promise<CatalogList> {
	const { spec, sourceLines } = prepared;
	const manifest = await publishWatchlist({
		sourceLines,
		version: input.version,
		privateKey: input.privateKey,
		outDir: `${input.outDir}/${spec.slug}`,
		embedder: input.embedder,
		generatedAt: input.generatedAt,
		listId: spec.source.id,
	});
	return {
		id: spec.source.id,
		title: spec.source.title,
		version: manifest.version,
		entitiesCount: manifest.entitiesCount,
		path: `${spec.slug}/`,
	};
}

/** Require every source, then publish and sign the complete flat catalog. */
export async function publishCatalog(
	input: PublishCatalogInput,
): Promise<readonly string[]> {
	if (input.sources.length === 0) {
		throw new Error("no required sources configured");
	}
	const prepared: PreparedSource[] = [];
	for (const spec of input.sources) {
		prepared.push(await prepareOne(spec, input.version));
	}
	const entries: CatalogList[] = [];
	for (const source of prepared) {
		entries.push(await publishOne(source, input));
	}
	const generatedAt = input.generatedAt ?? new Date().toISOString();
	const catalog = buildCatalog(entries, generatedAt);
	await writeSignedCatalog(input.outDir, catalog, input.privateKey);
	return catalog.lists.map((l) => l.id);
}
