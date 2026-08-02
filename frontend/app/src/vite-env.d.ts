/// <reference types="vite/client" />

// The Vite env vars the app reads at runtime (typed so `import.meta.env.VITE_*`
// is not `any`). All are optional — each consumer fails closed when unset.
interface ImportMetaEnv {
	/** OPTIONAL override for the origin the signed, content-addressed watchlist
	 * BUNDLE is delta-synced from. That bundle path (signed `latest` → content-hashed
	 * `manifest` → `chunk/` CAS, verified fail-closed) is the ONLY catalog/list
	 * transport. Unset/empty → the same-origin production default `/bundle/origin`;
	 * set it only to point the app at a separate CDN host. The pinned pubkey is
	 * ALWAYS read same-origin, never from here. */
	readonly VITE_BUNDLE_BASE_URL?: string;
	/** Bounds the in-tab ~23 MB model warmup (ms); fail-closed to the 120s
	 * production ceiling when absent/invalid. Set by the e2e webServers. */
	readonly VITE_MODEL_LOAD_IDLE_TIMEOUT_MS?: string;
	/** Upper bound (ms) for the WHOLE bootstrap (bundle sync + verify + model
	 * warmup) before `/screen` fails loudly; fail-closed to the production
	 * `BOOT_TIMEOUT_MS` (180s) default when absent/invalid. Exists only so the
	 * cold-cache e2e can bound an "everything blocked" boot to seconds. */
	readonly VITE_BOOT_TIMEOUT_MS?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
