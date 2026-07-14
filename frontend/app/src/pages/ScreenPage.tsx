import {
	type BootStage,
	canonicalize,
	configFromEnv,
	EMPTY_IDENTIFIERS,
	EngineRuntime,
	type Entity,
	type EntityType,
	engineSupport,
	type Identifiers,
	type Match,
	type MatchReason,
	type RiskCategory,
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
import { bootErrorMessage, deviceUnsupportedMessage } from "./bootErrorMessage";

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

// How closely a name must match to surface as a search hit. The embedder gives
// any two short names a ~0.45 baseline cosine, so the combined-score `floor`
// alone lets vector noise through; the `minLexical` gate (on the discriminating
// name_trigram signal) is what actually hides it. This is a SEARCH-LAYER control
// only — it never touches the parity-locked scoring contract. Defaults to
// Balanced. Floors/minLexicals were tuned against the real trigram data.
type Strictness = "lenient" | "balanced" | "strict";

interface StrictnessLevel {
	readonly level: Strictness;
	/** Passed to engine.screen as the combined-score `threshold`. */
	readonly floor: number;
	/** Minimum name_trigram a match must clear (unless a token matches). */
	readonly minLexical: number;
}

// The visible per-level labels live in screen.json under `strictness.levels.*`,
// keyed by `level`; the control renders them with t() at their button.
const STRICTNESS_LEVELS: ReadonlyArray<StrictnessLevel> = [
	{ level: "lenient", floor: 0.3, minLexical: 0.0 },
	{ level: "balanced", floor: 0.3, minLexical: 0.35 },
	{ level: "strict", floor: 0.4, minLexical: 0.5 },
];

const LEVEL: Readonly<Record<Strictness, StrictnessLevel>> = {
	lenient: STRICTNESS_LEVELS[0],
	balanced: STRICTNESS_LEVELS[1],
	strict: STRICTNESS_LEVELS[2],
};

/** The match's name_trigram signal value (the discriminating lexical signal), or 0. */
function trigramScore(match: Match): number {
	const reason = match.reasons.find((r) => r.signal === "name_trigram");
	return typeof reason?.value === "number" ? reason.value : 0;
}

/** Canonical whitespace tokens of a name, mirroring the engine's trigram canonicalization. */
function nameTokens(name: string): ReadonlySet<string> {
	const canonical = canonicalize(name);
	return new Set(canonical.length === 0 ? [] : canonical.split(" "));
}

/** True when any canonical query token exactly equals a canonical entity-name token. */
function hasTokenContainment(match: Match, query: string): boolean {
	const entityTokens = nameTokens(match.primary_name);
	for (const token of nameTokens(query)) {
		if (entityTokens.has(token)) {
			return true;
		}
	}
	return false;
}

/**
 * The search-layer gate: keep a match when its trigram clears the level's
 * minLexical, OR a query token exactly matches an entity name token (the
 * short-keyword escape hatch, e.g. "bank" vs a long org name).
 */
function passesStrictness(
	match: Match,
	query: string,
	level: StrictnessLevel,
): boolean {
	return (
		trigramScore(match) >= level.minLexical || hasTokenContainment(match, query)
	);
}

/** The unified view-model a card renders — from a browsed Entity or a scored Match. */
interface Dossier {
	readonly entity_id: string;
	readonly primary_name: string;
	readonly entity_type: EntityType;
	readonly risk_category: RiskCategory;
	readonly aliases: ReadonlyArray<string>;
	readonly dob: ReadonlyArray<string>;
	readonly countries: ReadonlyArray<string>;
	readonly nationalities: ReadonlyArray<string>;
	readonly addresses: ReadonlyArray<string>;
	readonly identifiers: Identifiers;
	readonly score?: number;
	readonly explanation?: string;
	readonly reasons?: ReadonlyArray<MatchReason>;
}

function fromEntity(e: Entity): Dossier {
	return {
		entity_id: e.entity_id,
		primary_name: e.primary_name,
		entity_type: e.entity_type,
		risk_category: e.risk_category,
		aliases: e.aliases.map((a) => a.name),
		dob: e.dob,
		countries: e.countries,
		nationalities: e.nationalities ?? [],
		addresses: e.addresses ?? [],
		identifiers: e.identifiers ?? EMPTY_IDENTIFIERS,
	};
}

function fromMatch(m: Match): Dossier {
	return {
		entity_id: m.entity_id,
		primary_name: m.primary_name,
		entity_type: m.entity_type,
		risk_category: m.risk_category,
		aliases: m.aliases,
		dob: m.dob,
		countries: m.countries,
		nationalities: m.nationalities,
		addresses: m.addresses,
		identifiers: m.identifiers,
		score: m.score,
		explanation: m.explanation,
		reasons: m.reasons,
	};
}

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
			.bootstrap(config, (stage) => setPhase({ kind: "booting", stage }))
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
				<Results query={query.trim()} entities={entities} search={search} />
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
		return STRICTNESS_LEVELS[Math.min(i + 1, STRICTNESS_LEVELS.length - 1)]
			.level;
	}
	if (key === "ArrowLeft" || key === "ArrowUp") {
		return STRICTNESS_LEVELS[Math.max(i - 1, 0)].level;
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
		return (
			<div className="screen-banner screen-banner--error" role="alert">
				<span>{phase.message}</span>
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

// The banner line for a stage. Production model loading is indeterminate because
// transformers.js 4.2.0's progress callback duplicates the ONNX fetch; injected
// runtimes can still supply a percentage through the same stage contract.
function stageMessage(stage: BootStage, t: TFunction): string {
	if (stage.kind === "loading-model" && stage.progress !== undefined) {
		return t("boot.loadingModelProgress", {
			label: t("boot.loadingModel"),
			pct: Math.round(stage.progress.pct),
		});
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
}: {
	readonly query: string;
	readonly entities: ReadonlyArray<Entity>;
	readonly search: SearchOutcome | null;
}) {
	const { t } = useTranslation("screen");
	// Empty box → browse the whole list (a directory, no scores).
	if (query.length === 0) {
		return (
			<section className="screen-results">
				<p className="screen-results__count">
					{t("results.browsing", { total: entities.length })}
				</p>
				<ul className="screen-results__list">
					{entities.map((entity) => (
						<DossierCard key={entity.entity_id} dossier={fromEntity(entity)} />
					))}
				</ul>
			</section>
		);
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
	return (
		<section className="screen-results" aria-live="polite">
			<p className="screen-results__count">
				{t("results.matchCount", {
					n: search.matches.length,
					suffix: search.matches.length === 1 ? "" : "es",
					ms: search.ms,
				})}
			</p>
			<ul className="screen-results__list">
				{search.matches.map((match) => (
					<DossierCard key={match.entity_id} dossier={fromMatch(match)} />
				))}
			</ul>
		</section>
	);
}

function idLines(
	identifiers: Identifiers,
	t: TFunction,
): ReadonlyArray<string> {
	const lines: string[] = [];
	for (const p of identifiers.passport) {
		lines.push(t("dossier.ids.passport", { value: p }));
	}
	for (const n of identifiers.national_id) {
		lines.push(t("dossier.ids.nationalId", { value: n }));
	}
	// `label` here is the raw identifier-type key from the data (not UI copy), so
	// it is rendered verbatim alongside its value.
	for (const [label, values] of Object.entries(identifiers.other)) {
		for (const v of values) {
			lines.push(`${label} ${v}`);
		}
	}
	return lines;
}

function DossierCard({ dossier }: { readonly dossier: Dossier }) {
	const { t } = useTranslation("screen");
	const ids = idLines(dossier.identifiers, t);
	const places = [...new Set([...dossier.nationalities, ...dossier.countries])];
	return (
		<li className="match-card">
			<div className="match-card__head">
				<span className="match-card__name">{dossier.primary_name}</span>
				<span className="match-card__type">{dossier.entity_type}</span>
				{dossier.score !== undefined && (
					<span className="match-card__score">{dossier.score.toFixed(3)}</span>
				)}
				<span className="match-card__badge">{dossier.risk_category}</span>
			</div>

			<dl className="match-card__facts">
				{dossier.aliases.length > 0 && (
					<Fact
						label={t("dossier.facts.aka")}
						value={dossier.aliases.join(", ")}
					/>
				)}
				{dossier.dob.length > 0 && (
					<Fact label={t("dossier.facts.dob")} value={dossier.dob.join(", ")} />
				)}
				{places.length > 0 && (
					<Fact label={t("dossier.facts.country")} value={places.join(", ")} />
				)}
				{dossier.addresses.length > 0 && (
					<Fact
						label={t("dossier.facts.address")}
						value={dossier.addresses.join("; ")}
					/>
				)}
				{ids.length > 0 && (
					<Fact label={t("dossier.facts.id")} value={ids.join(", ")} />
				)}
			</dl>

			{dossier.explanation !== undefined && (
				<p className="match-card__why">{dossier.explanation}</p>
			)}
			{dossier.reasons !== undefined && dossier.reasons.length > 0 && (
				<details className="match-card__details">
					<summary>{t("dossier.whyScore")}</summary>
					<dl className="match-card__signals">
						{dossier.reasons.map((reason) => (
							<div className="match-card__signal" key={reason.signal}>
								<dt>{reason.signal}</dt>
								<dd>{reason.description ?? String(reason.value)}</dd>
							</div>
						))}
					</dl>
				</details>
			)}
		</li>
	);
}

function Fact({
	label,
	value,
}: {
	readonly label: string;
	readonly value: string;
}) {
	return (
		<div className="match-card__fact">
			<dt>{label}</dt>
			<dd>{value}</dd>
		</div>
	);
}
