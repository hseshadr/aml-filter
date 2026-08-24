import { createHash } from "node:crypto";
import { mkdir, open, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { euSource } from "./sources/euSource.ts";
import { ofacSource } from "./sources/ofacSource.ts";
import {
	fetchAliasResponse,
	MAX_ALIAS_FEED_BYTES,
	SDN_ALIAS_MIRROR_URL,
} from "./sources/sdnAliases.ts";
import type { SourceSnapshot, WatchlistSource } from "./sources/source.ts";
import { SOURCE_UPDATED_AT_KEY } from "./sources/source.ts";
import { ukSource } from "./sources/ukSource.ts";
import { unSource } from "./sources/unSource.ts";

export interface SnapshotFile {
	readonly path: string;
	readonly bytes: number;
	readonly sha256: string;
}

export interface SnapshotSource {
	readonly id: string;
	readonly finalUrl: string;
	readonly etag: string | null;
	readonly lastModified: string | null;
	readonly sourceUpdatedAt: string;
	readonly files: ReadonlyArray<SnapshotFile>;
}

export interface SnapshotManifest {
	readonly schema: "amlfilter.source-snapshot/v1";
	readonly sources: ReadonlyArray<SnapshotSource>;
}

const DEFAULT_SOURCES = [ofacSource, unSource, euSource, ukSource] as const;
const SAFE_FILE = /^[A-Za-z0-9._-]+$/;
const ALIAS_SOURCE_ID = "OFAC_SDN_ALIASES";
const ALIAS_FILE = "sdn_advanced.xml";

function digest(value: string): string {
	return createHash("sha256").update(value, "utf8").digest("hex");
}

function rawFiles(snapshot: SourceSnapshot): ReadonlyArray<[string, string]> {
	return Object.entries(snapshot.raw)
		.filter(([path]) => path !== SOURCE_UPDATED_AT_KEY)
		.sort(([left], [right]) => left.localeCompare(right));
}

function assertSafeFile(sourceId: string, path: string): void {
	if (!SAFE_FILE.test(path)) {
		throw new Error(`${sourceId}: unsafe snapshot file name ${path}`);
	}
}

async function writeRawFile(
	root: string,
	sourceId: string,
	path: string,
	value: string,
): Promise<SnapshotFile> {
	assertSafeFile(sourceId, path);
	await writeFile(join(root, sourceId, path), value, "utf8");
	return {
		path,
		bytes: Buffer.byteLength(value, "utf8"),
		sha256: digest(value),
	};
}

async function captureSource(
	root: string,
	source: WatchlistSource,
): Promise<SnapshotSource> {
	if (source.fetchSnapshot === undefined) {
		throw new Error(
			`${source.id}: source adapter cannot produce a provenance snapshot`,
		);
	}
	const snapshot = await source.fetchSnapshot();
	await mkdir(join(root, source.id), { recursive: true });
	const files = await Promise.all(
		rawFiles(snapshot).map(([path, value]) =>
			writeRawFile(root, source.id, path, value),
		),
	);
	return {
		id: source.id,
		finalUrl: snapshot.transport.finalUrl,
		etag: snapshot.transport.etag,
		lastModified: snapshot.transport.lastModified,
		sourceUpdatedAt: snapshot.sourceUpdatedAt,
		files,
	};
}

function aliasUpdatedAt(response: Response): string {
	const value = response.headers.get("last-modified");
	const parsed = value === null ? Number.NaN : Date.parse(value);
	if (!Number.isFinite(parsed)) {
		throw new Error(`${ALIAS_SOURCE_ID}: Last-Modified is missing or invalid`);
	}
	return new Date(parsed).toISOString();
}

async function writeAliasBody(
	root: string,
	response: Response,
): Promise<SnapshotFile> {
	if (response.body === null) {
		throw new Error(`${ALIAS_SOURCE_ID}: response body is missing`);
	}
	const path = join(root, ALIAS_SOURCE_ID, ALIAS_FILE);
	const handle = await open(path, "wx");
	const hash = createHash("sha256");
	let bytes = 0;
	try {
		for await (const chunk of response.body as AsyncIterable<Uint8Array>) {
			bytes += chunk.byteLength;
			if (bytes > MAX_ALIAS_FEED_BYTES) {
				throw new Error(`${ALIAS_SOURCE_ID}: feed exceeded byte limit`);
			}
			hash.update(chunk);
			await handle.write(chunk);
		}
	} catch (error: unknown) {
		await handle.close();
		await rm(path, { force: true });
		throw error;
	}
	await handle.close();
	return { path: ALIAS_FILE, bytes, sha256: hash.digest("hex") };
}

async function captureAliasSource(root: string): Promise<SnapshotSource> {
	const response = await fetchAliasResponse();
	await mkdir(join(root, ALIAS_SOURCE_ID), { recursive: true });
	const file = await writeAliasBody(root, response);
	return {
		id: ALIAS_SOURCE_ID,
		finalUrl: response.url || SDN_ALIAS_MIRROR_URL,
		etag: response.headers.get("etag"),
		lastModified: response.headers.get("last-modified"),
		sourceUpdatedAt: aliasUpdatedAt(response),
		files: [file],
	};
}

export async function snapshotSources(
	outputRoot: string,
	sources: ReadonlyArray<WatchlistSource> = DEFAULT_SOURCES,
): Promise<SnapshotManifest> {
	await mkdir(outputRoot, { recursive: true });
	const ordered = [...sources].sort((left, right) =>
		left.id.localeCompare(right.id),
	);
	const captures: Array<Promise<SnapshotSource>> = ordered.map((source) =>
		captureSource(outputRoot, source),
	);
	if (sources === DEFAULT_SOURCES) {
		captures.push(captureAliasSource(outputRoot));
	}
	const captured = (await Promise.all(captures)).sort((left, right) =>
		left.id.localeCompare(right.id),
	);
	const manifest: SnapshotManifest = {
		schema: "amlfilter.source-snapshot/v1",
		sources: captured,
	};
	await writeFile(
		join(outputRoot, "manifest.json"),
		`${JSON.stringify(manifest, null, 2)}\n`,
		"utf8",
	);
	return manifest;
}
