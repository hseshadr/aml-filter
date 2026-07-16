// buildRealBundle — the CI build step: fetch the REAL sanctions lists via the
// existing source adapters, embed their names with the Node MiniLM embedder,
// stage them with stageBundle(), then shell out to `edgeproc publish` to chunk +
// Ed25519-sign the staging tree into the content-addressed
// `origin/{latest, manifest/<hash>, chunk/<hash>}` layout the in-tab sync tier
// consumes. This production path is fail-closed: OFAC, UN, EU, and UK must all
// fetch, parse to plausible non-zero counts, and prove freshness before a new
// signed bundle can be emitted.
//
// Run from frontend/ (the publish CI does this) via the thin
// `buildRealBundleMain.ts` entry — this module is the importable library it
// drives (so the unit test can exercise stagedListsFromSources without running
// edge-proc or a live fetch):
//   pnpm --filter @amlfilter/publisher run build-real-bundle -- \
//     --key signing.key --version 2026-06-23 --sequence 123 --out <originDir> [--models <dir>]
//
// `edgeproc` is invoked via publishBundle(), which resolves the edge-proc
// checkout from EDGEPROC_DIR (the CI sets it to the installed edge-proc). The
// --key is the raw 32-byte Ed25519 production seed (decoded from the
// WATCHLIST_SIGNING_KEY secret); the produced /latest signature verifies in-tab
// against the committed public.key.

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
	EMBEDDING_DIM,
	EMBEDDING_MODEL,
	type Embedder,
} from "@amlfilter/browser";
import { createNodeEmbedder } from "./nodeEmbedder.ts";
import { publishBundle } from "./publishBundle.ts";
import { toWatchlistEntity } from "./sourceEntity.ts";
import { euSource } from "./sources/euSource.ts";
import { ofacSource } from "./sources/ofacSource.ts";
import type { WatchlistSource } from "./sources/source.ts";
import { ukSource } from "./sources/ukSource.ts";
import { unSource } from "./sources/unSource.ts";
import { type StagedList, stageBundle } from "./stageBundle.ts";
import type { WatchlistEntity } from "./types.ts";
import { packVectors } from "./vectors.ts";

/** One source to attempt: the adapter + the bundle path slug (e.g. "ofac"). */
export interface RealBundleSourceSpec {
	readonly source: WatchlistSource;
	/** The per-list staging subdir, also the bundle's list slug. */
	readonly slug: string;
	readonly health: {
		readonly minimumEntities: number;
		readonly maximumEntities: number;
		readonly maximumAgeMs: number;
	};
}

export interface RealBundleDependencies {
	readonly sources?: readonly RealBundleSourceSpec[];
	readonly now?: () => Date;
}

/** The bundle id stamped into the signed pointer (matches the demo bundle). */
const BUNDLE_ID = "amlfilter-watchlists";

const HERE = dirname(fileURLToPath(import.meta.url));
/** Default model mirror: repo frontend/app/public/models. */
const DEFAULT_MODELS = resolve(HERE, "../../../app/public/models");

const MAX_FEED_AGE_MS = 90 * 24 * 60 * 60 * 1_000;
const MAX_FUTURE_SKEW_MS = 24 * 60 * 60 * 1_000;

/** Required sources with deliberately broad anomaly bounds. */
export const BUNDLE_SOURCES: readonly RealBundleSourceSpec[] = [
	{
		source: ofacSource,
		slug: "ofac",
		health: {
			minimumEntities: 5_000,
			maximumEntities: 100_000,
			maximumAgeMs: MAX_FEED_AGE_MS,
		},
	},
	{
		source: unSource,
		slug: "un",
		health: {
			minimumEntities: 100,
			maximumEntities: 10_000,
			maximumAgeMs: MAX_FEED_AGE_MS,
		},
	},
	{
		source: euSource,
		slug: "eu",
		health: {
			minimumEntities: 500,
			maximumEntities: 50_000,
			maximumAgeMs: MAX_FEED_AGE_MS,
		},
	},
	{
		source: ukSource,
		slug: "uk",
		health: {
			minimumEntities: 500,
			maximumEntities: 50_000,
			maximumAgeMs: MAX_FEED_AGE_MS,
		},
	},
];

function requirePlausibleCount(
	spec: RealBundleSourceSpec,
	count: number,
): void {
	const { minimumEntities, maximumEntities } = spec.health;
	if (count < minimumEntities || count > maximumEntities) {
		throw new Error(
			`${spec.source.id}: entity count ${count} is outside plausible range ${minimumEntities}..${maximumEntities}`,
		);
	}
}

function requireFreshSource(
	spec: RealBundleSourceSpec,
	raw: Awaited<ReturnType<WatchlistSource["fetchRaw"]>>,
	now: Date,
): void {
	const updatedAt = spec.source.sourceUpdatedAt?.(raw)?.trim();
	if (updatedAt === undefined || updatedAt === "") {
		throw new Error(`${spec.source.id}: freshness timestamp is missing`);
	}
	const updatedAtMs = Date.parse(updatedAt);
	if (!Number.isFinite(updatedAtMs)) {
		throw new Error(`${spec.source.id}: freshness timestamp is invalid`);
	}
	const ageMs = now.getTime() - updatedAtMs;
	if (ageMs < -MAX_FUTURE_SKEW_MS) {
		throw new Error(`${spec.source.id}: freshness timestamp is in the future`);
	}
	if (ageMs > spec.health.maximumAgeMs) {
		const maximumDays = spec.health.maximumAgeMs / (24 * 60 * 60 * 1_000);
		throw new Error(
			`${spec.source.id}: freshness age exceeds ${maximumDays} days`,
		);
	}
}

/** Fetch, validate, parse, and embed one required source. */
async function stageOneSource(
	spec: RealBundleSourceSpec,
	embedder: Embedder,
	version: string,
	now: Date,
): Promise<StagedList> {
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
	requireFreshSource(spec, raw, now);
	const lines = spec.source.parse(raw, version);
	requirePlausibleCount(spec, lines.length);
	const entities: WatchlistEntity[] = lines.map((line, i) =>
		toWatchlistEntity(line, i + 1),
	);
	const vectors = await packVectors(
		embedder,
		entities.map((e) => e.name_canonical),
	);
	return {
		listId: spec.source.id,
		slug: spec.slug,
		title: spec.source.title,
		version,
		model: EMBEDDING_MODEL,
		dim: EMBEDDING_DIM,
		entities,
		vectors,
	};
}

/** Validate and stage every required source, preserving configured order. */
export async function stagedListsFromSources(
	specs: readonly RealBundleSourceSpec[],
	embedder: Embedder,
	version: string,
	_log?: (message: string) => void,
	now: () => Date = () => new Date(),
): Promise<readonly StagedList[]> {
	const staged: StagedList[] = [];
	for (const spec of specs) {
		staged.push(await stageOneSource(spec, embedder, version, now()));
	}
	return staged;
}

/** One CLI run: stage the real lists then publish the signed bundle to outDir. */
interface RealBundleArgs {
	readonly version: string;
	readonly sequence: number;
	readonly keyPath: string;
	readonly outDir: string;
	readonly models: string;
}

export function parseRealBundleArgs(argv: readonly string[]): RealBundleArgs {
	const map = new Map<string, string>();
	for (let i = 0; i < argv.length; i += 2) {
		const flag = argv[i];
		const value = argv[i + 1];
		if (flag === undefined || !flag.startsWith("--") || value === undefined) {
			throw new Error(`malformed argument near "${flag ?? ""}"`);
		}
		map.set(flag.slice(2), value);
	}
	for (const k of ["version", "sequence", "key", "out"]) {
		if (!map.has(k)) {
			throw new Error(`missing required --${k}`);
		}
	}
	const sequence = Number(map.get("sequence"));
	if (!Number.isSafeInteger(sequence) || sequence < 0) {
		throw new Error("--sequence must be a non-negative safe integer");
	}
	return {
		version: map.get("version") as string,
		sequence,
		keyPath: resolve(map.get("key") as string),
		outDir: resolve(map.get("out") as string),
		models: map.get("models") ?? DEFAULT_MODELS,
	};
}

/** Stage the real lists then publish the signed bundle to outDir. Drives the
 * real Node embedder + the real adapters; the thin entry script passes argv. */
export async function runRealBundle(
	argv: readonly string[],
	dependencies: RealBundleDependencies = {},
): Promise<void> {
	const args = parseRealBundleArgs(argv);
	const staged = await stagedListsFromSources(
		dependencies.sources ?? BUNDLE_SOURCES,
		createNodeEmbedder(args.models),
		args.version,
		undefined,
		dependencies.now,
	);
	const staging = await mkdtemp(join(tmpdir(), "aml-real-bundle-"));
	try {
		await stageBundle(staging, staged, new Date().toISOString());
		await publishBundle({
			srcDir: staging,
			originDir: args.outDir,
			keyPath: args.keyPath,
			bundleId: BUNDLE_ID,
			version: args.version,
			sequence: args.sequence,
		});
		// edge-proc also writes a producer-side CAS mirror (chunks/<aa>/<hash>,
		// manifests/<hash>) next to the served contract. The sync tier consumes
		// ONLY chunk/<hash>, manifest/<hash>, latest — drop the duplicates so the
		// uploaded tree is exactly the served contract.
		await rm(resolve(args.outDir, "chunks"), { recursive: true, force: true });
		await rm(resolve(args.outDir, "manifests"), {
			recursive: true,
			force: true,
		});
	} finally {
		await rm(staging, { recursive: true, force: true });
	}
	const lists = staged.map((l) => l.listId).join(", ");
	process.stdout.write(
		`real bundle (${staged.length} lists: ${lists}, v${args.version}) -> ${args.outDir}\n`,
	);
}
