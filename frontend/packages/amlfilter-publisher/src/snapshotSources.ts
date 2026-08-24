import { createHash } from "node:crypto";
import {
	lstat,
	mkdir,
	mkdtemp,
	open,
	rename,
	rm,
	writeFile,
} from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { euSource } from "./sources/euSource.ts";
import {
	cancelResponse,
	streamResponseBody,
} from "./sources/fetchWithTimeout.ts";
import { ofacSource } from "./sources/ofacSource.ts";
import {
	ALIAS_BODY_LIMITS,
	fetchAliasResponse,
	SDN_ALIAS_MIRROR_URL,
} from "./sources/sdnAliases.ts";
import type { SourceSnapshot, WatchlistSource } from "./sources/source.ts";
import {
	canonicalSourceTimestamp,
	SOURCE_UPDATED_AT_KEY,
} from "./sources/source.ts";
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

function canonicalFinalUrl(sourceId: string, value: string): string {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		throw new Error(`${sourceId}: final transport URL is invalid`);
	}
	if (url.protocol !== "https:" && url.protocol !== "http:") {
		throw new Error(`${sourceId}: final transport URL must use HTTP(S)`);
	}
	return url.href;
}

function canonicalLastModified(
	sourceId: string,
	value: string | null,
): string | null {
	if (value === null) {
		return null;
	}
	const parsed = Date.parse(value);
	if (!Number.isFinite(parsed)) {
		throw new Error(`${sourceId}: Last-Modified is invalid`);
	}
	return new Date(parsed).toUTCString();
}

function snapshotProvenance(
	sourceId: string,
	snapshot: SourceSnapshot,
): Omit<SnapshotSource, "id" | "files"> {
	return {
		finalUrl: canonicalFinalUrl(sourceId, snapshot.transport.finalUrl),
		etag: snapshot.transport.etag,
		lastModified: canonicalLastModified(
			sourceId,
			snapshot.transport.lastModified,
		),
		sourceUpdatedAt: canonicalSourceTimestamp(
			sourceId,
			snapshot.sourceUpdatedAt,
		),
	};
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
	const provenance = snapshotProvenance(source.id, snapshot);
	await mkdir(join(root, source.id), { recursive: true });
	const files = await Promise.all(
		rawFiles(snapshot).map(([path, value]) =>
			writeRawFile(root, source.id, path, value),
		),
	);
	return {
		id: source.id,
		...provenance,
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
	const path = join(root, ALIAS_SOURCE_ID, ALIAS_FILE);
	const handle = await open(path, "wx");
	const hash = createHash("sha256");
	let bytes = 0;
	try {
		for await (const chunk of streamResponseBody(
			response,
			ALIAS_SOURCE_ID,
			ALIAS_BODY_LIMITS,
		)) {
			bytes += chunk.byteLength;
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
	let provenance: Omit<SnapshotSource, "id" | "files">;
	try {
		provenance = snapshotProvenance(ALIAS_SOURCE_ID, {
			raw: {},
			transport: {
				finalUrl: response.url || SDN_ALIAS_MIRROR_URL,
				etag: response.headers.get("etag"),
				lastModified: response.headers.get("last-modified"),
			},
			sourceUpdatedAt: aliasUpdatedAt(response),
		});
	} catch (error: unknown) {
		await cancelResponse(response, error);
		throw error;
	}
	await mkdir(join(root, ALIAS_SOURCE_ID), { recursive: true });
	const file = await writeAliasBody(root, response);
	return {
		id: ALIAS_SOURCE_ID,
		...provenance,
		files: [file],
	};
}

async function assertTargetAbsent(path: string): Promise<void> {
	try {
		await lstat(path);
	} catch (error: unknown) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return;
		}
		throw error;
	}
	throw new Error(`snapshot target already exists: ${path}`);
}

async function captureAll(
	root: string,
	sources: ReadonlyArray<WatchlistSource>,
	includeAliases: boolean,
): Promise<SnapshotSource[]> {
	const captures = sources.map((source) => captureSource(root, source));
	if (includeAliases) {
		captures.push(captureAliasSource(root));
	}
	const settled = await Promise.allSettled(captures);
	const captured: SnapshotSource[] = [];
	for (const result of settled) {
		if (result.status === "rejected") {
			throw result.reason;
		}
		captured.push(result.value);
	}
	return captured;
}

async function buildSnapshot(
	root: string,
	sources: ReadonlyArray<WatchlistSource>,
): Promise<SnapshotManifest> {
	const ordered = [...sources].sort((left, right) =>
		left.id.localeCompare(right.id),
	);
	const captured = (
		await captureAll(root, ordered, sources === DEFAULT_SOURCES)
	).sort((left, right) => left.id.localeCompare(right.id));
	return { schema: "amlfilter.source-snapshot/v1", sources: captured };
}

async function writeManifest(
	root: string,
	manifest: SnapshotManifest,
): Promise<void> {
	await writeFile(
		join(root, "manifest.json"),
		`${JSON.stringify(manifest, null, 2)}\n`,
		"utf8",
	);
}

export async function snapshotSources(
	outputRoot: string,
	sources: ReadonlyArray<WatchlistSource> = DEFAULT_SOURCES,
): Promise<SnapshotManifest> {
	const target = resolve(outputRoot);
	const parent = dirname(target);
	await mkdir(parent, { recursive: true });
	const lockPath = join(parent, `.${basename(target)}.lock`);
	const lock = await open(lockPath, "wx");
	let staging: string | undefined;
	try {
		await assertTargetAbsent(target);
		staging = await mkdtemp(join(parent, `.${basename(target)}.tmp-`));
		const manifest = await buildSnapshot(staging, sources);
		await writeManifest(staging, manifest);
		// All cooperative publishers hold lockPath across this check + promotion.
		await assertTargetAbsent(target);
		await rename(staging, target);
		staging = undefined;
		return manifest;
	} catch (error: unknown) {
		if (staging !== undefined) {
			await rm(staging, { recursive: true, force: true });
		}
		throw error;
	} finally {
		await lock.close();
		await rm(lockPath, { force: true });
	}
}
