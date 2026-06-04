import {
	type BootStage,
	configFromEnv,
	EMPTY_IDENTIFIERS,
	EngineRuntime,
	type Entity,
	type EntityType,
	type Identifiers,
	type Match,
	type MatchReason,
	type RiskCategory,
} from "@amlfilter/browser";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Footer } from "../components/Footer";

// The backend-free OFAC screening page. On mount it syncs the signed bundle
// (ed25519 + sha256, fail-closed) and warms the MiniLM embedder, both in Web
// Workers; then it SEARCHES the synced list entirely in-tab as you type. No
// FastAPI on this path. With an empty box it browses the whole list so a
// visitor immediately sees who is on it; typing surfaces ranked matches with a
// full dossier + the explainable score. The admin pages keep their own
// DB-backed flow — this is the public, in-browser tier.

type Phase =
	| { readonly kind: "booting"; readonly stage: BootStage }
	| { readonly kind: "ready" }
	| { readonly kind: "error"; readonly message: string };

// Single source of truth for the model-loading line, so the with-progress and
// without-progress banners stay consistent (same wording, same accurate size).
// The real quantized ONNX export is ~23 MB (22,972,370 bytes).
const LOADING_MODEL_LABEL = "Loading the name-matching model (~23 MB, once)…";

const STAGE_LABEL: Readonly<Record<BootStage["kind"], string>> = {
	syncing: "Syncing the signed OFAC bundle…",
	synced: "Bundle verified.",
	reassembling: "Reassembling the index…",
	"loading-model": LOADING_MODEL_LABEL,
	ready: "Ready.",
};

// Score floor for SEARCH results: low enough that a typo ("fakovic") still
// surfaces its target, high enough that unrelated gibberish returns nothing —
// preserving the "no match = clear" sanctions semantic. Distinct from the
// screening presets (which gate a yes/no decision, not a search ranking).
const SEARCH_FLOOR = 0.3;
const SEARCH_K = 25;
const DEBOUNCE_MS = 180;

const EXAMPLE_QUERIES = ["Ivan Fakovich", "fakovic", "Olga", "bank"] as const;

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

interface SearchState {
	readonly matches: ReadonlyArray<Match>;
	readonly ms: number;
}

export function ScreenPage() {
	const runtime = useMemo(() => new EngineRuntime(), []);
	const [phase, setPhase] = useState<Phase>({
		kind: "booting",
		stage: { kind: "syncing" },
	});
	const [query, setQuery] = useState("");
	const [entities, setEntities] = useState<ReadonlyArray<Entity>>([]);
	const [search, setSearch] = useState<SearchState | null>(null);
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
		if (started.current) {
			return;
		}
		started.current = true;
		runtime
			.bootstrap(configFromEnv(import.meta.env), (stage) =>
				setPhase({ kind: "booting", stage }),
			)
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
				setPhase({
					kind: "error",
					message: error instanceof Error ? error.message : String(error),
				});
			});
	}, [runtime, bootNonce]);

	const retryBoot = useCallback(() => {
		// Reset the once-only boot guard and re-arm the booting banner; bumping the
		// nonce re-runs the boot effect, which calls bootstrap again (the runtime
		// cleared its memo when the prior attempt rejected).
		started.current = false;
		setPhase({ kind: "booting", stage: { kind: "syncing" } });
		setBootNonce((n) => n + 1);
	}, []);

	const runSearch = useCallback(
		async (text: string) => {
			const engine = runtime.engine();
			if (engine === null) {
				return;
			}
			const mine = ++seq.current;
			const result = await engine.screen({
				name: text,
				threshold: SEARCH_FLOOR,
				k: SEARCH_K,
			});
			if (mine === seq.current && alive.current) {
				setSearch({ matches: result.matches, ms: result.execution_time_ms });
			}
		},
		[runtime],
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
		const timer = setTimeout(() => void runSearch(trimmed), DEBOUNCE_MS);
		return () => clearTimeout(timer);
	}, [query, phase.kind, runSearch]);

	return (
		<div className="screen-page">
			<h1>Search the sanctions list</h1>
			<p className="screen-page__lede">
				Type a name. It is matched against the public OFAC sanctions list right
				here in your browser — nothing you type ever leaves your device.
			</p>

			<BootBanner phase={phase} onRetry={retryBoot} />

			<input
				className="screen-search"
				type="search"
				placeholder="Search a name, e.g. Ivan Fakovich"
				aria-label="Search the sanctions list"
				value={query}
				onChange={(event) => setQuery(event.target.value)}
				disabled={phase.kind !== "ready"}
			/>

			<div className="screen-examples">
				<span className="screen-examples__label">Try:</span>
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

function BootBanner({
	phase,
	onRetry,
}: {
	readonly phase: Phase;
	readonly onRetry: () => void;
}) {
	if (phase.kind === "ready") {
		return null;
	}
	if (phase.kind === "error") {
		return (
			<div className="screen-banner screen-banner--error" role="alert">
				<span>Could not load the screening bundle: {phase.message}</span>
				<button
					type="button"
					className="screen-banner__retry"
					onClick={onRetry}
				>
					Retry
				</button>
			</div>
		);
	}
	return (
		<div className="screen-banner" role="status">
			{stageMessage(phase.stage)}
		</div>
	);
}

// The banner line for a stage. The loading-model stage shows a live percent once
// download progress arrives — appended to the SAME single-sourced label (size
// hint kept) so it reads "…(~23 MB, once)… 42%"; before that (and for every
// other stage) it is the plain label.
function stageMessage(stage: BootStage): string {
	if (stage.kind === "loading-model" && stage.progress !== undefined) {
		return `${LOADING_MODEL_LABEL} ${Math.round(stage.progress.pct)}%`;
	}
	return STAGE_LABEL[stage.kind];
}

function Results({
	query,
	entities,
	search,
}: {
	readonly query: string;
	readonly entities: ReadonlyArray<Entity>;
	readonly search: SearchState | null;
}) {
	// Empty box → browse the whole list (a directory, no scores).
	if (query.length === 0) {
		return (
			<section className="screen-results">
				<p className="screen-results__count">
					Browsing all {entities.length} entities on the demo list — searched
					entirely in your browser.
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
				Searching…
			</div>
		);
	}
	if (search.matches.length === 0) {
		return (
			<div className="screen-results screen-results--clear" aria-live="polite">
				No sanctions match “{query}”. Screened in {search.ms} ms.
			</div>
		);
	}
	return (
		<section className="screen-results" aria-live="polite">
			<p className="screen-results__count">
				{search.matches.length} potential match
				{search.matches.length === 1 ? "" : "es"} — screened in {search.ms} ms,
				in your browser.
			</p>
			<ul className="screen-results__list">
				{search.matches.map((match) => (
					<DossierCard key={match.entity_id} dossier={fromMatch(match)} />
				))}
			</ul>
		</section>
	);
}

function idLines(identifiers: Identifiers): ReadonlyArray<string> {
	const lines: string[] = [];
	for (const p of identifiers.passport) {
		lines.push(`passport ${p}`);
	}
	for (const n of identifiers.national_id) {
		lines.push(`national-id ${n}`);
	}
	for (const [label, values] of Object.entries(identifiers.other)) {
		for (const v of values) {
			lines.push(`${label} ${v}`);
		}
	}
	return lines;
}

function DossierCard({ dossier }: { readonly dossier: Dossier }) {
	const ids = idLines(dossier.identifiers);
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
					<Fact label="aka" value={dossier.aliases.join(", ")} />
				)}
				{dossier.dob.length > 0 && (
					<Fact label="DOB" value={dossier.dob.join(", ")} />
				)}
				{places.length > 0 && (
					<Fact label="country" value={places.join(", ")} />
				)}
				{dossier.addresses.length > 0 && (
					<Fact label="address" value={dossier.addresses.join("; ")} />
				)}
				{ids.length > 0 && <Fact label="id" value={ids.join(", ")} />}
			</dl>

			{dossier.explanation !== undefined && (
				<p className="match-card__why">{dossier.explanation}</p>
			)}
			{dossier.reasons !== undefined && dossier.reasons.length > 0 && (
				<details className="match-card__details">
					<summary>Why this score?</summary>
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
