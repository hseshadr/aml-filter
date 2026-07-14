// Feature-detect whether this browser can run the local screening engine BEFORE
// bootstrap tries to. The engine needs three browser capabilities, any of which
// an older iOS Safari or a locked-down in-app WebView can lack:
//
//   - module Web Workers — the sync + embedder engines are module Workers;
//   - OPFS (navigator.storage.getDirectory) — the durable content-addressed
//     chunk store the delta-sync promotes into;
//   - createSyncAccessHandle — the Worker-only synchronous OPFS write path the
//     store writes every chunk through (present on FileSystemFileHandle.prototype
//     in browsers that support it, even though it is callable only in a Worker).
//
// When any is missing, boot would otherwise throw deep inside a Worker — or, on
// iOS, the tab is killed with NO catchable JS error and the banner hangs forever.
// Detecting up front lets the UI render an explicit "unsupported device" screen
// instead. Maps to the future canonical `bundle.device_unsupported` error code.

/** The three capabilities the local engine requires, each detected present/absent. */
export interface EngineCapabilities {
	readonly moduleWorker: boolean;
	readonly opfs: boolean;
	readonly syncAccessHandle: boolean;
}

/** The globals the detector reads. Injectable so the pure detection is testable
 * without touching (or stubbing) real browser globals; production passes
 * `globalThis`. */
export interface CapabilityScope {
	readonly Worker?: unknown;
	readonly FileSystemFileHandle?: { readonly prototype: object };
	readonly navigator?: {
		readonly storage?: { readonly getDirectory?: unknown };
	};
}

/** Human-readable name per capability, for the unsupported-device message. */
const CAPABILITY_LABELS: Readonly<Record<keyof EngineCapabilities, string>> = {
	moduleWorker: "Web Workers",
	opfs: "private file storage (OPFS)",
	syncAccessHandle: "synchronous file access",
};

/** Pure capability detection over an injected scope (no real globals touched). */
export function detectCapabilities(scope: CapabilityScope): EngineCapabilities {
	const handle = scope.FileSystemFileHandle;
	return {
		moduleWorker: typeof scope.Worker === "function",
		opfs: typeof scope.navigator?.storage?.getDirectory === "function",
		syncAccessHandle:
			handle !== undefined && "createSyncAccessHandle" in handle.prototype,
	};
}

/** The human-readable names of every missing capability (empty when supported). */
export function missingCapabilities(
	caps: EngineCapabilities,
): ReadonlyArray<string> {
	const keys = Object.keys(CAPABILITY_LABELS) as (keyof EngineCapabilities)[];
	return keys.filter((key) => !caps[key]).map((key) => CAPABILITY_LABELS[key]);
}

/** True when every capability the local engine needs is present. */
export function isEngineSupported(caps: EngineCapabilities): boolean {
	return missingCapabilities(caps).length === 0;
}

/** A device/browser that cannot run the local engine (fail-fast, not a hang).
 * Carries the missing capabilities so the UI can name them. Maps to the future
 * canonical `bundle.device_unsupported` code. */
export class DeviceUnsupportedError extends Error {
	public readonly missing: ReadonlyArray<string>;
	public constructor(missing: ReadonlyArray<string>) {
		super(
			`this device or browser cannot run the local engine: missing ${missing.join(
				", ",
			)}`,
		);
		this.name = "DeviceUnsupportedError";
		this.missing = missing;
	}
}

/** Detect engine support from a scope (defaults to the real globals). Returns a
 * ready-to-render `{ supported, missing }` — the one call the app boot path uses
 * to decide between bootstrapping and showing the unsupported-device screen. */
export function engineSupport(
	scope: CapabilityScope = globalThis as unknown as CapabilityScope,
): { readonly supported: boolean; readonly missing: ReadonlyArray<string> } {
	const caps = detectCapabilities(scope);
	return {
		supported: isEngineSupported(caps),
		missing: missingCapabilities(caps),
	};
}
