/**
 * Settings — the local-first workstation's configuration page. Three sections:
 *   1. Screening sensitivity (a global Strict/Balanced/Lenient segmented control)
 *   2. Per-list overrides (a sensitivity override per source list)
 *   3. Analyst name (the audit-trail signer, a SQLite settings row)
 *
 * Apply persists the analyst name to the store, then hands the screening config
 * to `apiClient.setScreeningConfig`, which persists it and re-screens every
 * customer — surfacing the rescan summary in a confirmation banner.
 */

import type { ScreeningConfig } from "@amlfilter/workstation";
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

const SOURCE_LISTS: ReadonlyArray<{ id: string; label: string }> = [
	{ id: "OFAC_SDN", label: "OFAC SDN" },
];

interface RescanBanner {
	readonly customersScanned: number;
	readonly newHits: number;
	readonly clearedHits: number;
}

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
	readonly summary: RescanBanner | null;
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

export default function SettingsPage() {
	const [sensitivity, setSensitivity] = useState<Sensitivity>("balanced");
	const [overrides, setOverrides] = useState<Overrides>({});
	const [analystName, setAnalystName] = useState<string>("");
	const [applying, setApplying] = useState<boolean>(false);
	const [summary, setSummary] = useState<RescanBanner | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		async function load(): Promise<void> {
			const config = await apiClient.getScreeningConfig();
			const handle = await workstation();
			const stored = await handle.store.getSetting(ANALYST_NAME_KEY);
			if (cancelled) return;
			setSensitivity(config.sensitivity);
			setOverrides({ ...config.overrides });
			setAnalystName(stored ?? "");
		}
		load().catch((err: unknown) => {
			if (!cancelled) setError(errorMessage(err, "Failed to load settings"));
		});
		return () => {
			cancelled = true;
		};
	}, []);

	async function persist(): Promise<void> {
		const trimmed = analystName.trim();
		if (trimmed) {
			const handle = await workstation();
			await handle.store.setSetting(ANALYST_NAME_KEY, trimmed);
		}
		const config: ScreeningConfig = { sensitivity, overrides };
		setSummary(await apiClient.setScreeningConfig(config));
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
				<h2>Per-list overrides</h2>
				{SOURCE_LISTS.map((list) => (
					<OverrideSelect
						key={list.id}
						id={list.id}
						label={list.label}
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
				disabled={applying}
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
