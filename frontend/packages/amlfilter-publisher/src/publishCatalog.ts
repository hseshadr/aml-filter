// publishCatalog — the multi-list, real-fetch catalog producer (the production
// path the publish CI drives). For each configured source it runs the adapter's
// real fetchRaw(); a source whose fetchRaw throws (e.g. EU/UK, whose fetchRaw is
// still scaffolded) is logged and SKIPPED, so the published catalog contains
// exactly the lists that really fetched. Each succeeded list is published to
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
	/** Where skip notices go (defaults to console.warn); injected in tests. */
	readonly log?: (message: string) => void;
}

/** Fetch + parse + publish one source. Resolves to its catalog entry, or null
 * if the adapter's fetchRaw is not wired yet (logged and skipped). */
async function publishOne(
	spec: CatalogSourceSpec,
	input: PublishCatalogInput,
	log: (message: string) => void,
): Promise<CatalogList | null> {
	let raw: Awaited<ReturnType<WatchlistSource["fetchRaw"]>>;
	try {
		raw = await spec.source.fetchRaw();
	} catch (err) {
		const reason = err instanceof Error ? err.message : String(err);
		log(`skipping ${spec.source.id}: fetchRaw failed (${reason})`);
		return null;
	}
	const sourceLines = spec.source.parse(raw, input.version);
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

/** Publish every source whose fetchRaw succeeds, then write the signed catalog
 * listing exactly those. Returns the ids actually published (sorted by id, as
 * the catalog stores them). Throws if no source fetched. */
export async function publishCatalog(
	input: PublishCatalogInput,
): Promise<readonly string[]> {
	const log = input.log ?? ((m) => console.warn(m));
	const entries: CatalogList[] = [];
	for (const spec of input.sources) {
		const entry = await publishOne(spec, input, log);
		if (entry !== null) {
			entries.push(entry);
		}
	}
	if (entries.length === 0) {
		throw new Error("no lists fetched — refusing to publish an empty catalog");
	}
	const generatedAt = input.generatedAt ?? new Date().toISOString();
	const catalog = buildCatalog(entries, generatedAt);
	await writeSignedCatalog(input.outDir, catalog, input.privateKey);
	return catalog.lists.map((l) => l.id);
}
