// Screening sensitivity config — the threshold knob, persisted in the settings
// table beside ANALYST_NAME_KEY / LAST_SYNCED_VERSION_KEY. A single global
// sensitivity ("strict" | "balanced" | "lenient") maps to the parity-locked
// PRESETS threshold; an optional per-source-list override lets one list screen
// tighter or looser than the rest. Default is "balanced" so an unconfigured
// workstation keeps today's 0.65 floor EXACTLY — this is a non-breaking add.

import { PRESETS, type Preset } from "@amlfilter/browser";

/** Settings key for the global screening sensitivity. */
export const SCREENING_SENSITIVITY_KEY = "screening_sensitivity";
/** Settings key for the per-source-list sensitivity overrides (JSON). */
export const SCREENING_THRESHOLD_OVERRIDES_KEY =
	"screening_threshold_overrides";

/** Per-source-list sensitivity overrides, keyed by source_list. */
export type ThresholdOverrides = Readonly<Record<string, Preset>>;

/** The resolved screening config the services consume. */
export interface ScreeningConfig {
	readonly sensitivity: Preset;
	readonly overrides: ThresholdOverrides;
}

const DEFAULT_SENSITIVITY: Preset = "balanced";

/** The settings surface this module needs — a narrow slice of WorkstationStore. */
export interface SettingsStore {
	getSetting(key: string): Promise<string | null>;
	setSetting(key: string, value: string): Promise<void>;
}

function isPreset(value: unknown): value is Preset {
	return value === "strict" || value === "balanced" || value === "lenient";
}

/**
 * The screening threshold for a given sensitivity, honoring a per-list override
 * when `sourceList` is supplied and present in `overrides`. Returns the exact
 * PRESETS threshold (0.75 / 0.65 / 0.55) so tiering stays parity-consistent.
 */
export function resolveThreshold(
	sensitivity: Preset,
	overrides: ThresholdOverrides,
	sourceList?: string,
): number {
	const effective =
		sourceList !== undefined && isPreset(overrides[sourceList])
			? overrides[sourceList]
			: sensitivity;
	return PRESETS[effective].threshold;
}

/** Parse persisted overrides, dropping any entry that is not a known preset. */
function parseOverrides(raw: string | null): ThresholdOverrides {
	if (raw === null) {
		return {};
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return {};
	}
	if (typeof parsed !== "object" || parsed === null) {
		return {};
	}
	const out: Record<string, Preset> = {};
	for (const [list, value] of Object.entries(parsed)) {
		if (isPreset(value)) {
			out[list] = value;
		}
	}
	return out;
}

/**
 * Load the screening config, defaulting to "balanced" / no overrides when
 * unset or malformed — so a fresh or never-configured DB screens at exactly the
 * legacy 0.65 floor.
 */
export async function loadScreeningConfig(
	store: SettingsStore,
): Promise<ScreeningConfig> {
	const [rawSensitivity, rawOverrides] = await Promise.all([
		store.getSetting(SCREENING_SENSITIVITY_KEY),
		store.getSetting(SCREENING_THRESHOLD_OVERRIDES_KEY),
	]);
	return {
		sensitivity: isPreset(rawSensitivity)
			? rawSensitivity
			: DEFAULT_SENSITIVITY,
		overrides: parseOverrides(rawOverrides),
	};
}

/** Persist the screening config to the settings table. */
export async function saveScreeningConfig(
	store: SettingsStore,
	config: ScreeningConfig,
): Promise<void> {
	await store.setSetting(SCREENING_SENSITIVITY_KEY, config.sensitivity);
	await store.setSetting(
		SCREENING_THRESHOLD_OVERRIDES_KEY,
		JSON.stringify(config.overrides),
	);
}
