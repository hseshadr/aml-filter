/// <reference types="vite/client" />

// The Vite env vars the app reads at runtime (typed so `import.meta.env.VITE_*`
// is not `any`). All are optional — each consumer fails closed when unset.
interface ImportMetaEnv {
	/** When set to a non-empty value, the engine bootstrap takes the signed,
	 * content-addressed BUNDLE delta-sync path against this base URL (served
	 * same-origin in the demo at `/bundle/origin`) instead of the same-origin
	 * `watchlist/` JSON catalog. Unset/empty → the JSON path (this release's
	 * default). The pinned pubkey is ALWAYS read same-origin, never from here. */
	readonly VITE_BUNDLE_BASE_URL?: string;
	/** Bounds the in-tab ~23 MB model warmup (ms); fail-closed to the 120s
	 * production ceiling when absent/invalid. Set by the e2e webServers. */
	readonly VITE_MODEL_LOAD_TIMEOUT_MS?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
