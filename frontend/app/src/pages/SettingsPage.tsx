/**
 * Settings — the local-first workstation's configuration page. Four sections:
 *   1. Screening sensitivity (a global Strict/Balanced/Lenient segmented control)
 *   2. Watchlists (a checkbox per signed-catalog list — which lists are screened)
 *   3. Per-list overrides (a sensitivity override per ENABLED source list)
 *   4. Analyst name (the audit-trail signer, a SQLite settings row)
 *
 * Apply persists the analyst name, re-bootstraps the engine over the chosen
 * watchlist set (a disabled list's matches drop out → SUPPRESSED on re-screen),
 * and hands the screening config to `apiClient.setScreeningConfig`, which persists
 * it and re-screens — surfacing the combined rescan summary in a banner.
 */

import type { CatalogListInfo } from "@amlfilter/browser";
import type { RescanSummary, ScreeningConfig } from "@amlfilter/workstation";
import { ANALYST_NAME_KEY } from "@amlfilter/workstation";
import {
	type KeyboardEvent as ReactKeyboardEvent,
	useEffect,
	useState,
} from "react";
import { apiClient } from "../lib/api";
import { workstation } from "../lib/workstation";
import "../styles/common.css";

type Sensitivity = "strict" | "balanced" | "lenient";
type Overrides = Record<string, Sensitivity>;

interface SensitivityLevel {
	readonly level: Sensitivity;
	readonly label: string;
}

// Order lenient→strict so left/right arrow roving reads naturally, mirroring
// ScreenPage's STRICTNESS_LEVELS.
const SENSITIVITY_LEVELS: ReadonlyArray<SensitivityLevel> = [
	{ level: "lenient", label: "Lenient" },
	{ level: "balanced", label: "Balanced" },
	{ level: "strict", label: "Strict" },
];

const EMPTY_SUMMARY: RescanSummary = {
	customersScanned: 0,
	newHits: 0,
	clearedHits: 0,
};

function errorMessage(err: unknown, fallback: string): string {
	return err instanceof Error ? err.message : fallback;
}

// The level reached by an arrow key from the current one (Left/Up ←, Right/Down
// →), clamped at the ends. Returns null for any other key (no change).
function arrowTarget(current: Sensitivity, key: string): Sensitivity | null {
	const i = SENSITIVITY_LEVELS.findIndex((l) => l.level === current);
	if (key === "ArrowRight" || key === "ArrowDown") {
		return SENSITIVITY_LEVELS[Math.min(i + 1, SENSITIVITY_LEVELS.length - 1)]
			.level;
	}
	if (key === "ArrowLeft" || key === "ArrowUp") {
		return SENSITIVITY_LEVELS[Math.max(i - 1, 0)].level;
	}
	return null;
}

// An accessible segmented control reading as a 3-stop sensitivity slider —
// radiogroup + role="radio" stops with single-tabstop arrow-key roving.
function SensitivityControl({
	value,
	onChange,
}: {
	readonly value: Sensitivity;
	readonly onChange: (next: Sensitivity) => void;
}) {
	const onKeyDown = (event: ReactKeyboardEvent) => {
		const next = arrowTarget(value, event.key);
		if (next !== null) {
			event.preventDefault();
			onChange(next);
		}
	};
	return (
		<div className="screen-strictness">
			<div
				className="screen-strictness__track"
				role="radiogroup"
				aria-label="Screening sensitivity"
			>
				{SENSITIVITY_LEVELS.map((level) => (
					// biome-ignore lint/a11y/useSemanticElements: this is a custom segmented "slider" — a native radio can't carry the active-segment styling or the single-tabstop arrow-key roving used here; the ARIA radiogroup/radio pattern is the correct equivalent
					<button
						key={level.level}
						type="button"
						role="radio"
						aria-checked={value === level.level}
						tabIndex={value === level.level ? 0 : -1}
						className="screen-strictness__stop"
						onClick={() => onChange(level.level)}
						onKeyDown={onKeyDown}
					>
						{level.label}
					</button>
				))}
			</div>
		</div>
	);
}

function WatchlistToggle({
	id,
	title,
	enabled,
	onToggle,
}: {
	readonly id: string;
	readonly title: string;
	readonly enabled: boolean;
	readonly onToggle: (id: string, next: boolean) => void;
}) {
	return (
		<label className="form-label" htmlFor={`watchlist-${id}`}>
			<input
				id={`watchlist-${id}`}
				type="checkbox"
				checked={enabled}
				onChange={(e) => onToggle(id, e.target.checked)}
			/>{" "}
			{title}
		</label>
	);
}

function OverrideSelect({
	id,
	label,
	value,
	onChange,
}: {
	readonly id: string;
	readonly label: string;
	readonly value: Sensitivity | "";
	readonly onChange: (next: string) => void;
}) {
	return (
		<div>
			<label className="form-label" htmlFor={`override-${id}`}>
				Override for {label}
			</label>
			<select
				id={`override-${id}`}
				className="form-select"
				value={value}
				onChange={(e) => onChange(e.target.value)}
			>
				<option value="">Use default</option>
				<option value="strict">Strict</option>
				<option value="balanced">Balanced</option>
				<option value="lenient">Lenient</option>
			</select>
		</div>
	);
}

function ResultBanner({
	summary,
	error,
}: {
	readonly summary: RescanSummary | null;
	readonly error: string | null;
}) {
	if (error !== null) {
		return <div className="alert alert-error">Error: {error}</div>;
	}
	if (summary === null) return null;
	if (summary.customersScanned === 0) {
		return (
			<div className="alert alert-success" role="status">
				Settings unchanged — no changes to apply.
			</div>
		);
	}
	return (
		<div className="alert alert-success" role="status">
			Re-screened {summary.customersScanned} customers — {summary.newHits} new
			hits, {summary.clearedHits} cleared.
		</div>
	);
}

function setOverride(prev: Overrides, id: string, value: string): Overrides {
	if (value === "") {
		const next = { ...prev };
		delete next[id];
		return next;
	}
	return { ...prev, [id]: value as Sensitivity };
}

/** The catalog ids that are currently enabled, in catalog order. */
function enabledIds(
	catalog: ReadonlyArray<CatalogListInfo>,
	enabled: ReadonlySet<string>,
): string[] {
	return catalog.filter((l) => enabled.has(l.id)).map((l) => l.id);
}

/** Combine the selection + config rescan summaries: both re-screen the whole
 * book, so prefer whichever actually ran (config runs last over the final engine
 * state); if neither scanned, it's a clean no-op. */
function combineSummaries(
	selection: RescanSummary,
	config: RescanSummary,
): RescanSummary {
	if (config.customersScanned > 0) return config;
	if (selection.customersScanned > 0) return selection;
	return EMPTY_SUMMARY;
}

export default function SettingsPage() {
	const [sensitivity, setSensitivity] = useState<Sensitivity>("balanced");
	const [overrides, setOverrides] = useState<Overrides>({});
	const [analystName, setAnalystName] = useState<string>("");
	const [catalog, setCatalog] = useState<ReadonlyArray<CatalogListInfo>>([]);
	const [enabled, setEnabled] = useState<ReadonlySet<string>>(new Set());
	// The catalog + enabled set load asynchronously (a signed-catalog fetch). Apply
	// must wait for that: applying a half-loaded form would persist an empty
	// selection and disable every list.
	const [loaded, setLoaded] = useState<boolean>(false);
	const [applying, setApplying] = useState<boolean>(false);
	const [summary, setSummary] = useState<RescanSummary | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		async function load(): Promise<void> {
			const config = await apiClient.getScreeningConfig();
			const handle = await workstation();
			const [stored, lists, enabledList] = await Promise.all([
				handle.store.getSetting(ANALYST_NAME_KEY),
				handle.catalogLists(),
				handle.getEnabledLists(),
			]);
			if (cancelled) return;
			setSensitivity(config.sensitivity);
			setOverrides({ ...config.overrides });
			setAnalystName(stored ?? "");
			setCatalog(lists);
			setEnabled(new Set(enabledList));
			setLoaded(true);
		}
		load().catch((err: unknown) => {
			if (!cancelled) setError(errorMessage(err, "Failed to load settings"));
		});
		return () => {
			cancelled = true;
		};
	}, []);

	function toggleWatchlist(id: string, next: boolean): void {
		setEnabled((prev) => {
			const updated = new Set(prev);
			if (next) {
				updated.add(id);
			} else {
				updated.delete(id);
			}
			return updated;
		});
	}

	async function persist(): Promise<void> {
		const handle = await workstation();
		const trimmed = analystName.trim();
		if (trimmed) {
			await handle.store.setSetting(ANALYST_NAME_KEY, trimmed);
		}
		// Apply the watchlist selection first (re-bootstrap + re-screen), then the
		// screening config (re-screen over the now-correct engine). Both return a
		// rescan summary; either may be a no-op when nothing in its slice changed.
		const selectionSummary = await handle.setEnabledLists(
			enabledIds(catalog, enabled),
		);
		const config: ScreeningConfig = { sensitivity, overrides };
		const configSummary = await apiClient.setScreeningConfig(config);
		setSummary(combineSummaries(selectionSummary, configSummary));
	}

	async function handleApply(): Promise<void> {
		setApplying(true);
		setError(null);
		setSummary(null);
		try {
			await persist();
		} catch (err) {
			setError(errorMessage(err, "Failed to apply settings"));
		} finally {
			setApplying(false);
		}
	}

	const overrideRows = catalog.filter((list) => enabled.has(list.id));

	return (
		<div className="page-content">
			<h1>Settings</h1>

			<section className="card">
				<h2>Screening sensitivity</h2>
				<p className="text-muted">
					How closely a customer name must match a sanctioned name to flag.
				</p>
				<SensitivityControl value={sensitivity} onChange={setSensitivity} />
			</section>

			<section className="card">
				<h2>Watchlists</h2>
				<p className="text-muted">
					Which sanctions lists to screen against. Disabling a list removes its
					matches on the next re-screen.
				</p>
				{catalog.map((list) => (
					<WatchlistToggle
						key={list.id}
						id={list.id}
						title={list.title}
						enabled={enabled.has(list.id)}
						onToggle={toggleWatchlist}
					/>
				))}
			</section>

			<section className="card">
				<h2>Per-list overrides</h2>
				{overrideRows.map((list) => (
					<OverrideSelect
						key={list.id}
						id={list.id}
						label={list.title}
						value={overrides[list.id] ?? ""}
						onChange={(value) =>
							setOverrides((prev) => setOverride(prev, list.id, value))
						}
					/>
				))}
			</section>

			<section className="card">
				<h2>Analyst name</h2>
				<label className="form-label" htmlFor="analyst-name">
					Analyst name
				</label>
				<input
					id="analyst-name"
					type="text"
					className="form-input"
					value={analystName}
					onChange={(e) => setAnalystName(e.target.value)}
				/>
			</section>

			<button
				type="button"
				className="btn btn-primary"
				disabled={applying || !loaded}
				onClick={() => {
					void handleApply();
				}}
			>
				Apply
			</button>

			<ResultBanner summary={summary} error={error} />
		</div>
	);
}
