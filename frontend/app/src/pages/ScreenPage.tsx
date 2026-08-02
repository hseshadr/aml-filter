import {
	type BootStage,
	configFromEnv,
	EngineRuntime,
	type Entity,
	engineSupport,
	type Match,
} from "@amlfilter/browser";
import type { TFunction } from "i18next";
import {
	type KeyboardEvent as ReactKeyboardEvent,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useTranslation } from "react-i18next";
import { Footer } from "../components/Footer";
import {
	bootErrorMessage,
	deviceUnsupportedMessage,
	userFacingBootError,
} from "./bootErrorMessage";
import { DossierCard, dossierFromMatch } from "./DossierCard";
import { EntityDirectory } from "./EntityDirectory";
import {
	LEVEL,
	partitionByConfidence,
	passesStrictness,
	STRICTNESS_LEVELS,
	type Strictness,
	type StrictnessLevel,
} from "./strictness";

// The backend-free OFAC screening page. On mount it fetches the signed JSON
// watchlist (ed25519-verified, fail-closed) and warms the MiniLM embedder in a
// Web Worker; then it SEARCHES the verified list entirely in-tab as you type.
// No FastAPI on this path. With an empty box it browses the whole list so a
// visitor immediately sees who is on it; typing surfaces ranked matches with a
// full dossier + the explainable score. The admin pages keep their own
// DB-backed flow — this is the public, in-browser tier.

type Phase =
	| { readonly kind: "booting"; readonly stage: BootStage }
	| { readonly kind: "ready" }
	| { readonly kind: "error"; readonly message: string }
	// A device/browser that can't run the local engine at all (older iOS Safari /
	// locked-down WebView missing OPFS, module Workers, or sync file access). A
	// graceful dead-end detected BEFORE bootstrap — no Retry, since retrying can't
	// add a missing browser capability. Maps to future `bundle.device_unsupported`.
	| { readonly kind: "unsupported"; readonly message: string };

// Maps each boot stage to its `screen`-namespace translation key. The
// with-progress and without-progress banners share the same base key per stage,
// so the wording stays consistent (the model line's accurate ~23 MB size — the
// real quantized ONNX export is 22,972,370 bytes — lives in `boot.loadingModel`).
const STAGE_KEY: Readonly<Record<BootStage["kind"], string>> = {
	downloading: "boot.downloading",
	verified: "boot.verified",
	"loading-model": "boot.loadingModel",
	ready: "boot.ready",
};

const SEARCH_K = 25;
const DEBOUNCE_MS = 180;

const EXAMPLE_QUERIES = ["Ivan Fakovich", "fakovic", "Olga", "bank"] as const;

// The strictness levels (named floors/gates/display lines with their declared
// ranges and rationale) and the gate/partition helpers live in ./strictness —
// a pure, unit-tested module. This is a SEARCH-LAYER control only: it never
// touches the parity-locked scoring contract, and it never drops a match the
// engine returned (recall preserved; weak results are grouped, not hidden).

// The outcome of one screen call. A rejection is a FIRST-CLASS state, not a
// dropped promise: an unscreened name must never fall through to the no-match
// (clear) render. `matches` carries a completed screen; `error` a failed one.
type SearchOutcome =
	| {
			readonly kind: "matches";
			readonly matches: ReadonlyArray<Match>;
			readonly ms: number;
	  }
	| { readonly kind: "error"; readonly message: string };

// A screen call that rejects mid-session must be shown as a hard error, never as
// a clear — an unscreened name is NOT a cleared name. This surfaces the cause
// (so a crashed worker / model fault is diagnosable) into the `results.searchError`
// copy, which frames it as uncleared and tells the user how to retry.
function errorDetail(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export function ScreenPage() {
	const { t } = useTranslation("screen");
	const runtime = useMemo(() => new EngineRuntime(), []);
	// Capability preflight (once): before spawning any Worker or touching OPFS,
	// check this browser can actually run the local engine. On an unsupported
	// device the boot below would otherwise throw deep in a Worker — or, on iOS,
	// silently hang with no catchable error — so we branch to an explicit screen.
	const support = useMemo(() => engineSupport(), []);
	const [phase, setPhase] = useState<Phase>(() =>
		support.supported
			? { kind: "booting", stage: { kind: "downloading" } }
			: {
					kind: "unsupported",
					message: deviceUnsupportedMessage(support.missing),
				},
	);
	const [query, setQuery] = useState("");
	// Optional date-of-birth filter. A native date input's value is already
	// `YYYY-MM-DD`, which flows straight into the engine's `dob` (normalized to
	// ISO before the parity-locked dob_match scorer). Empty = no dob supplied.
	const [dob, setDob] = useState("");
	const [strictness, setStrictness] = useState<Strictness>("balanced");
	const [entities, setEntities] = useState<ReadonlyArray<Entity>>([]);
	const [search, setSearch] = useState<SearchOutcome | null>(null);
	// Bumped by Retry: it resets the boot guard and re-fires the boot effect so a
	// boot that timed out (stalled CDN) can be re-attempted from the error banner.
	const [bootNonce, setBootNonce] = useState(0);
	const seq = useRef(0);
	const started = useRef(false);
	const alive = useRef(true);

	// Re-arm `alive` on mount and disarm on unmount. The mount re-arm matters
	// under React 18 StrictMode, whose dev mount→unmount→remount would otherwise
	// leave `alive.current` stuck `false` after the throwaway first pass — which
	// would silently swallow the boot's resolve/reject on the real (second) mount.
	useEffect(() => {
		alive.current = true;
		return () => {
			alive.current = false;
		};
	}, []);

	// The pending deferred-disposal timer for the page-owned runtime (see the
	// effect below); a ref so the StrictMode replay can cancel the teardown the
	// throwaway first pass scheduled.
	const disposeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Release the page-owned runtime (embedder Worker + ONNX WASM heap + resident
	// vectors) when the page REALLY leaves the DOM. Without this, SPA navigation
	// to /settings or any workstation route leaves TWO live runtimes — this one
	// plus the workstation's module-level one — keeping ~2× the ~23 MB model heap
	// for the rest of the session (an OOM trigger under iOS Safari's tab budget).
	// Disposal is deferred one macrotask and canceled on re-entry: StrictMode's
	// dev mount→unmount→remount replays this effect body before the zero-delay
	// timer fires, so the throwaway first pass never tears down the runtime the
	// surviving mount keeps using (the `started` boot guard would never re-boot
	// it). On a real unmount no replay follows, the timer fires, and dispose —
	// serialized on the runtime's lifecycle queue — waits out any in-flight boot
	// before terminating its workers; the durable list cache is untouched.
	useEffect(() => {
		if (disposeTimer.current !== null) {
			clearTimeout(disposeTimer.current);
			disposeTimer.current = null;
		}
		return () => {
			disposeTimer.current = setTimeout(() => void runtime.dispose(), 0);
		};
	}, [runtime]);

	// bootNonce is not read in the body — it is the intentional re-fire trigger:
	// Retry resets the `started` guard and bumps the nonce so this effect re-runs
	// the boot. Listed as a dep so that re-fire actually happens.
	// biome-ignore lint/correctness/useExhaustiveDependencies: bootNonce is an intentional re-fire trigger, not read in the body
	useEffect(() => {
		// An unsupported device never boots: the preflight already routed to the
		// unsupported screen, and spawning the engine Worker would only throw/hang.
		if (!support.supported) {
			return;
		}
		if (started.current) {
			return;
		}
		started.current = true;
		const config = configFromEnv(import.meta.env);
		runtime
			// The public route promises OFAC screening. Keep its boot bounded to that
			// list instead of eagerly materializing every signed catalog list; the
			// latter exceeds iOS Safari's tab/WASM memory budget before the model is
			// ready. The workstation/settings flow remains the configurable multi-list
			// surface.
			.bootstrap(config, (stage) => setPhase({ kind: "booting", stage }), {
				enabledLists: ["OFAC_SDN"],
				residency: "streaming",
			})
			.then(() => {
				if (!alive.current) {
					return;
				}
				setEntities(runtime.engine()?.allEntities() ?? []);
				setPhase({ kind: "ready" });
			})
			.catch((error: unknown) => {
				if (!alive.current) {
					return;
				}
				// A verify/format/model failure aborts the load fail-closed; surface
				// the cause so a bad signature or stalled model is diagnosable from
				// the banner alone.
				setPhase({
					kind: "error",
					message: bootErrorMessage(error),
				});
			});
	}, [runtime, bootNonce, support.supported]);

	const retryBoot = useCallback(() => {
		// Reset the once-only boot guard and re-arm the booting banner; bumping the
		// nonce re-runs the boot effect, which calls bootstrap again (the runtime
		// cleared its memo when the prior attempt rejected).
		started.current = false;
		setPhase({ kind: "booting", stage: { kind: "downloading" } });
		setBootNonce((n) => n + 1);
	}, []);

	const runSearch = useCallback(
		async (text: string, dobIso: string) => {
			const engine = runtime.engine();
			if (engine === null) {
				return;
			}
			const level = LEVEL[strictness];
			const mine = ++seq.current;
			try {
				const result = await engine.screen({
					name: text,
					// A native date input is already ISO `YYYY-MM-DD`; omit when empty so
					// the scorer never sees a blank dob (which it would treat as null).
					...(dobIso.length > 0 ? { dob: dobIso } : {}),
					threshold: level.floor,
					k: SEARCH_K,
				});
				if (mine === seq.current && alive.current) {
					const matches = result.matches.filter((m) =>
						passesStrictness(m, text, level),
					);
					setSearch({ kind: "matches", matches, ms: result.execution_time_ms });
				}
			} catch (error) {
				// Fail LOUD, never silent: a dropped screen rejection would let the
				// prior (stale/empty) result linger and read as a clear. Surface a
				// visible error for this exact query instead.
				if (mine === seq.current && alive.current) {
					setSearch({
						kind: "error",
						message: t("results.searchError", { detail: errorDetail(error) }),
					});
				}
			}
		},
		[runtime, strictness, t],
	);

	useEffect(() => {
		if (phase.kind !== "ready") {
			return;
		}
		const trimmed = query.trim();
		if (trimmed.length === 0) {
			seq.current += 1; // cancel any in-flight search
			setSearch(null);
			return;
		}
		const timer = setTimeout(() => void runSearch(trimmed, dob), DEBOUNCE_MS);
		return () => clearTimeout(timer);
	}, [query, dob, phase.kind, runSearch]);

	return (
		<div className="screen-page">
			<h1>{t("header.title")}</h1>
			<p className="screen-page__lede">{t("header.lede")}</p>

			<BootBanner phase={phase} onRetry={retryBoot} />

			<input
				className="screen-search"
				type="search"
				placeholder={t("search.placeholder")}
				aria-label={t("search.ariaLabel")}
				value={query}
				onChange={(event) => setQuery(event.target.value)}
				disabled={phase.kind !== "ready"}
			/>

			<div className="screen-dob">
				<label className="screen-dob__label" htmlFor="screen-dob-input">
					{t("dob.label")}
				</label>
				<input
					id="screen-dob-input"
					className="screen-dob__input"
					type="date"
					value={dob}
					onChange={(event) => setDob(event.target.value)}
					disabled={phase.kind !== "ready"}
				/>
			</div>

			<StrictnessControl
				value={strictness}
				onChange={setStrictness}
				disabled={phase.kind !== "ready"}
			/>

			<div className="screen-examples">
				<span className="screen-examples__label">{t("examples.label")}</span>
				{EXAMPLE_QUERIES.map((example) => (
					<button
						key={example}
						type="button"
						className="screen-chip"
						disabled={phase.kind !== "ready"}
						onClick={() => setQuery(example)}
					>
						{example}
					</button>
				))}
			</div>

			{phase.kind === "ready" && (
				<Results
					query={query.trim()}
					entities={entities}
					search={search}
					level={LEVEL[strictness]}
				/>
			)}
			<Footer />
		</div>
	);
}

// The level reached by an arrow key from the current one (Left/Up ←, Right/Down →),
// clamped at the ends. Returns null for any other key (no selection change).
function arrowTarget(current: Strictness, key: string): Strictness | null {
	const i = STRICTNESS_LEVELS.findIndex((l) => l.level === current);
	if (key === "ArrowRight" || key === "ArrowDown") {
		return (
			STRICTNESS_LEVELS[Math.min(i + 1, STRICTNESS_LEVELS.length - 1)]?.level ??
			null
		);
	}
	if (key === "ArrowLeft" || key === "ArrowUp") {
		return STRICTNESS_LEVELS[Math.max(i - 1, 0)]?.level ?? null;
	}
	return null;
}

// An accessible segmented control that reads like a 3-stop "match strictness"
// slider. radiogroup + role="radio" stops, arrow-key navigation, disabled while
// the bundle/model is still booting. Selecting a stop re-runs search live.
function StrictnessControl({
	value,
	onChange,
	disabled,
}: {
	readonly value: Strictness;
	readonly onChange: (next: Strictness) => void;
	readonly disabled: boolean;
}) {
	const { t } = useTranslation("screen");
	const onKeyDown = (event: ReactKeyboardEvent) => {
		const next = arrowTarget(value, event.key);
		if (next !== null) {
			event.preventDefault();
			onChange(next);
		}
	};
	return (
		<div className="screen-strictness">
			<span className="screen-strictness__caption">
				{t("strictness.caption")}
			</span>
			<div
				className="screen-strictness__track"
				role="radiogroup"
				aria-label={t("strictness.ariaLabel")}
			>
				{STRICTNESS_LEVELS.map((level) => (
					// biome-ignore lint/a11y/useSemanticElements: this is a custom segmented "slider" — a native radio can't carry the active-segment styling or the single-tabstop arrow-key roving used here; the ARIA radiogroup/radio pattern is the correct equivalent
					<button
						key={level.level}
						type="button"
						role="radio"
						aria-checked={value === level.level}
						tabIndex={value === level.level ? 0 : -1}
						className="screen-strictness__stop"
						disabled={disabled}
						onClick={() => onChange(level.level)}
						onKeyDown={onKeyDown}
					>
						{t(`strictness.levels.${level.level}`)}
					</button>
				))}
			</div>
			<span className="screen-strictness__hint">{t("strictness.hint")}</span>
		</div>
	);
}

function BootBanner({
	phase,
	onRetry,
}: {
	readonly phase: Phase;
	readonly onRetry: () => void;
}) {
	const { t } = useTranslation("screen");
	if (phase.kind === "ready") {
		return null;
	}
	if (phase.kind === "unsupported") {
		// A graceful dead-end: no Retry, because retrying can't add a missing
		// browser capability. role="alert" so assistive tech announces it.
		return (
			<div className="screen-banner screen-banner--unsupported" role="alert">
				<span>{phase.message}</span>
			</div>
		);
	}
	if (phase.kind === "error") {
		const safeError = userFacingBootError(phase.message);
		return (
			<div
				className="screen-banner screen-banner--error"
				role="alert"
				aria-live="assertive"
			>
				<div className="screen-banner__copy">
					<strong>{safeError.title}</strong>
					<p>{safeError.recovery}</p>
					<details className="screen-banner__details">
						<summary>Technical details</summary>
						<code>{safeError.technicalDetail}</code>
					</details>
				</div>
				<button
					type="button"
					className="screen-banner__retry"
					onClick={onRetry}
				>
					{t("boot.retry")}
				</button>
			</div>
		);
	}
	return (
		<div className="screen-banner" role="status">
			{stageMessage(phase.stage, t)}
		</div>
	);
}

/** The model-load progress the engine reports, read off the stage contract so
 * this page does not widen the package's export surface. */
type ModelProgress = NonNullable<
	Extract<BootStage, { kind: "loading-model" }>["progress"]
>;

const BYTES_PER_MB = 1024 * 1024;

/**
 * The model line. A percentage whenever the download has an honest denominator;
 * otherwise megabytes loaded — a server that withholds `content-length` gives no
 * total, and a fabricated one is worse than none. Either way the line MOVES:
 * this ~23 MB download used to be the only frozen phase of the cold boot.
 */
function modelMessage(progress: ModelProgress, t: TFunction): string {
	const label = t("boot.loadingModel");
	if (progress.pct === undefined) {
		const mb = (progress.loaded / BYTES_PER_MB).toFixed(1);
		return t("boot.loadingModelBytes", { label, mb });
	}
	return t("boot.loadingModelProgress", {
		label,
		pct: Math.round(progress.pct),
	});
}

// The banner line for a stage.
function stageMessage(stage: BootStage, t: TFunction): string {
	if (stage.kind === "loading-model" && stage.progress !== undefined) {
		return modelMessage(stage.progress, t);
	}
	// Show the cold-sync chunk count so the long download reads as making
	// progress (n/total) instead of a frozen "Downloading…" line.
	if (stage.kind === "downloading" && stage.progress !== undefined) {
		const { fetched, total } = stage.progress;
		return t("boot.downloadingProgress", {
			label: t("boot.downloading"),
			fetched,
			total,
		});
	}
	return t(STAGE_KEY[stage.kind]);
}

function Results({
	query,
	entities,
	search,
	level,
}: {
	readonly query: string;
	readonly entities: ReadonlyArray<Entity>;
	readonly search: SearchOutcome | null;
	readonly level: StrictnessLevel;
}) {
	const { t } = useTranslation("screen");
	// Empty box → browse the whole list (a directory, no scores).
	if (query.length === 0) {
		return <EntityDirectory entities={entities} />;
	}
	if (search === null) {
		return (
			<div className="screen-banner" role="status">
				{t("results.searching")}
			</div>
		);
	}
	// A failed screen is a hard, visible error — never a silent clear. role="alert"
	// so assistive tech announces it, and the stale/empty result is replaced.
	if (search.kind === "error") {
		return (
			<div className="screen-results screen-results--error" role="alert">
				{search.message}
			</div>
		);
	}
	if (search.matches.length === 0) {
		return (
			<div className="screen-results screen-results--clear" aria-live="polite">
				{t("results.noMatch", { query, ms: search.ms })}
			</div>
		);
	}
	// The honest split: matches at/above the level's display line lead as
	// primary cards; the rest stay fully inspectable behind a collapsed
	// disclosure (recall preserved, sub-line fuzz de-emphasized). At Lenient
	// and Strict the line is 0, so every match is primary — unchanged.
	const { primary, lowConfidence } = partitionByConfidence(
		search.matches,
		level,
	);
	const levelLabel = t(`strictness.levels.${level.level}`);
	return (
		<section className="screen-results" aria-live="polite">
			{primary.length > 0 ? (
				<>
					<p className="screen-results__count">
						{t("results.matchCount", {
							n: primary.length,
							suffix: primary.length === 1 ? "" : "es",
							ms: search.ms,
						})}
					</p>
					<ul className="screen-results__list">
						{primary.map((match) => (
							<DossierCard
								key={match.entity_id}
								dossier={dossierFromMatch(match)}
							/>
						))}
					</ul>
				</>
			) : (
				// Everything the engine returned sits below the display line: say so
				// honestly instead of leading with fuzz — and never phrase it as a
				// clear, because the grouped candidates below are still unreviewed.
				<p className="screen-results__none">
					{t("results.noPrimaryMatch", {
						query,
						level: levelLabel,
						ms: search.ms,
					})}
				</p>
			)}
			{lowConfidence.length > 0 && (
				<details className="screen-results__low">
					<summary className="screen-results__low-summary">
						{t("results.lowConfidenceCount", {
							n: lowConfidence.length,
							suffix: lowConfidence.length === 1 ? "" : "s",
							level: levelLabel,
						})}
					</summary>
					<ul className="screen-results__list">
						{lowConfidence.map((match) => (
							<DossierCard
								key={match.entity_id}
								dossier={dossierFromMatch(match)}
							/>
						))}
					</ul>
				</details>
			)}
		</section>
	);
}
