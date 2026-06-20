// List selection + per-list threshold mapping — the bridge between the persisted
// settings (the global sensitivity + per-source-list overrides from
// screening_config.ts, plus an `enabled_watchlists` id set) and the browser
// engine's numeric `ListThresholds`. The signed catalog is the source of truth for
// which lists EXIST: the stored selection is always intersected with the live
// catalog, and the default (unset) selection is "all catalog ids" so a fresh
// workstation screens against every published list.

import type { ListThresholds } from "@amlfilter/browser";
import type { SettingsStore } from "./screening_config";
import { resolveThreshold, type ScreeningConfig } from "./screening_config";

/** Settings key for the enabled-watchlist id set (JSON array of catalog ids). */
export const ENABLED_WATCHLISTS_KEY = "enabled_watchlists";

/** Parse a persisted id array, returning null for anything that is not a
 * JSON array of strings (so the caller can fall back to the catalog default). */
function parseIdArray(raw: string | null): ReadonlyArray<string> | null {
	if (raw === null) {
		return null;
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return null;
	}
	if (!Array.isArray(parsed) || !parsed.every((v) => typeof v === "string")) {
		return null;
	}
	return parsed as ReadonlyArray<string>;
}

/**
 * Load the enabled-watchlist selection, intersected with the live catalog ids so a
 * stored id whose list was removed silently drops out. An unset or malformed value
 * defaults to ALL catalog ids (a fresh workstation screens every published list); a
 * persisted empty array is honored as "disable everything".
 */
export async function loadEnabledLists(
	store: SettingsStore,
	catalogIds: ReadonlyArray<string>,
): Promise<ReadonlyArray<string>> {
	const stored = parseIdArray(await store.getSetting(ENABLED_WATCHLISTS_KEY));
	if (stored === null) {
		return [...catalogIds];
	}
	return catalogIds.filter((id) => stored.includes(id));
}

/** Persist the enabled-watchlist selection to the settings table. */
export async function saveEnabledLists(
	store: SettingsStore,
	enabled: ReadonlyArray<string>,
): Promise<void> {
	await store.setSetting(ENABLED_WATCHLISTS_KEY, JSON.stringify([...enabled]));
}

/**
 * Map the screening config (global sensitivity + per-source-list overrides) onto the
 * engine's numeric {@link ListThresholds}: `default` from the global sensitivity, and
 * one `perList` floor per catalog id that carries an override. Overrides for lists not
 * in the catalog are ignored — the per-list bar is meaningless for a list that doesn't
 * load. The numeric floors come from `resolveThreshold` so they stay parity-locked.
 */
export function toListThresholds(
	config: ScreeningConfig,
	catalogIds: ReadonlyArray<string>,
): ListThresholds {
	const perList: Record<string, number> = {};
	for (const id of catalogIds) {
		if (config.overrides[id] !== undefined) {
			perList[id] = resolveThreshold(config.sensitivity, config.overrides, id);
		}
	}
	return {
		default: resolveThreshold(config.sensitivity, config.overrides),
		perList,
	};
}
