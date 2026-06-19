/**
 * The workstation boot path: spawn + open the DB Worker (SQLite-WASM/OPFS),
 * and expose a LAZY engine bootstrap — the review board needs no model, and
 * the ~23 MB MiniLM load must not gate page render. Memoized like
 * EngineRuntime.bootstrap: the first call wins; a failure clears the memo so
 * the UI can retry. Construction of the apiClient stays side-effect free —
 * nothing here runs until the first workstation page asks for it.
 */

import {
	configFromEnv,
	EngineRuntime,
	type OnStage,
	type RuntimeConfig,
	type ScreenOptions,
	type ScreenQuery,
	type ScreenResponse,
} from "@amlfilter/browser";
import {
	DbClient,
	LocalMatchTracker,
	LocalOnboardingService,
	type NameScreener,
	RescanService,
	type WorkstationStore,
} from "@amlfilter/workstation";
import type { WorkstationServices } from "./localApi";

/** The engine surface the boot path needs (ScreeningEngine satisfies it). */
export interface EngineHandle {
	screen(query: ScreenQuery, options?: ScreenOptions): Promise<ScreenResponse>;
}

/** The runtime surface the boot path needs (EngineRuntime satisfies it). */
export interface RuntimePort {
	bootstrap(config: RuntimeConfig, onStage?: OnStage): Promise<EngineHandle>;
	/** The loaded watchlist version; null before the first successful boot. */
	version(): string | null;
}

/** Seams for tests; defaulted to the real DB Worker + EngineRuntime. */
export interface WorkstationDeps {
	readonly spawnStore: () => WorkstationStore;
	readonly runtime: RuntimePort;
}

export interface WorkstationHandle extends WorkstationServices {
	/** Kick (or await) the engine bootstrap, streaming boot stages to the UI. */
	readonly engineBoot: (onStage?: OnStage) => Promise<void>;
	/** The bidirectional auto-rescan service (Wave 2), over this DB + screener. */
	readonly rescan: RescanService;
	/** The loaded watchlist version; null until the engine has bootstrapped. */
	readonly watchlistVersion: () => string | null;
}

const defaultDeps: WorkstationDeps = {
	spawnStore: () => DbClient.spawn(),
	runtime: new EngineRuntime(),
};

let handlePromise: Promise<WorkstationHandle> | null = null;

/** Boot (or reuse) the local workstation. First call wins; failures retry. */
export function workstation(
	deps: WorkstationDeps = defaultDeps,
): Promise<WorkstationHandle> {
	if (handlePromise === null) {
		handlePromise = build(deps).catch((error: unknown) => {
			handlePromise = null;
			throw error;
		});
	}
	return handlePromise;
}

/** Test-only: drop the memoized handle between specs. */
export function resetWorkstationForTests(): void {
	handlePromise = null;
}

async function build(deps: WorkstationDeps): Promise<WorkstationHandle> {
	const store = deps.spawnStore();
	await store.open();
	const bootEngine = (onStage?: OnStage): Promise<EngineHandle> =>
		deps.runtime.bootstrap(configFromEnv(import.meta.env), onStage);
	const screener: NameScreener = {
		screen: async (query: ScreenQuery): Promise<ScreenResponse> =>
			(await bootEngine()).screen(query),
	};
	return {
		store,
		tracker: new LocalMatchTracker(store),
		onboarding: new LocalOnboardingService(store, screener),
		rescan: new RescanService(store, screener),
		watchlistVersion: (): string | null => deps.runtime.version(),
		engineBoot: async (onStage?: OnStage): Promise<void> => {
			await bootEngine(onStage);
		},
	};
}

/** The provider the apiClient singleton is constructed with. */
export const workstationProvider = (): Promise<WorkstationServices> =>
	workstation();
