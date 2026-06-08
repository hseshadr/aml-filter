/**
 * The single source of truth for the backend origin.
 *
 * Used as the fallback in api.ts (when `VITE_API_URL` is unset) and as the dev
 * proxy target in vite.config.ts. Keeping it here means the default never drifts
 * between the two — `VITE_API_URL` still overrides it for deployed builds.
 */
export const DEFAULT_API_BASE = "http://localhost:8000";
