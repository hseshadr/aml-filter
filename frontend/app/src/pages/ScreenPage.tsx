import {
	type BootStage,
	configFromEnv,
	EngineRuntime,
	type Match,
	type ScreenResponse,
} from "@amlfilter/browser";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Footer } from "../components/Footer";

// The backend-free OFAC screening page. On mount it syncs the signed bundle
// (ed25519 + sha256, fail-closed) and warms the MiniLM embedder, both in Web
// Workers; then it screens the typed name entirely in-tab. No FastAPI on this
// path. The admin pages keep their own DB-backed flow — this is the public,
// in-browser tier mirroring edge-reco's Nimbus demo.

type Phase =
	| { readonly kind: "booting"; readonly stage: BootStage }
	| { readonly kind: "ready" }
	| { readonly kind: "error"; readonly message: string };

const STAGE_LABEL: Readonly<Record<BootStage["kind"], string>> = {
	syncing: "Syncing the signed OFAC bundle…",
	synced: "Bundle verified.",
	reassembling: "Reassembling the index…",
	"loading-model": "Loading the name-matching model (~25 MB, once)…",
	ready: "Ready.",
};

export function ScreenPage() {
	const runtime = useMemo(() => new EngineRuntime(), []);
	const [phase, setPhase] = useState<Phase>({
		kind: "booting",
		stage: { kind: "syncing" },
	});
	const [name, setName] = useState("");
	const [country, setCountry] = useState("");
	const [response, setResponse] = useState<ScreenResponse | null>(null);
	const [screening, setScreening] = useState(false);
	const started = useRef(false);

	useEffect(() => {
		if (started.current) {
			return;
		}
		started.current = true;
		runtime
			.bootstrap(configFromEnv(import.meta.env), (stage) =>
				setPhase({ kind: "booting", stage }),
			)
			.then(() => setPhase({ kind: "ready" }))
			.catch((error: unknown) =>
				setPhase({
					kind: "error",
					message: error instanceof Error ? error.message : String(error),
				}),
			);
	}, [runtime]);

	const onScreen = useCallback(async () => {
		const engine = runtime.engine();
		if (engine === null || name.trim().length === 0) {
			return;
		}
		setScreening(true);
		try {
			const result = await engine.screen({
				name: name.trim(),
				country:
					country.trim().length === 2 ? country.trim().toUpperCase() : null,
			});
			setResponse(result);
		} finally {
			setScreening(false);
		}
	}, [runtime, name, country]);

	return (
		<div className="screen-page">
			<h1>Screen a name</h1>
			<p className="screen-page__lede">
				Type a name. It is screened against the public OFAC sanctions list right
				here in your browser — nothing is sent to a server.
			</p>

			<BootBanner phase={phase} />

			<form
				className="screen-form"
				onSubmit={(event) => {
					event.preventDefault();
					void onScreen();
				}}
			>
				<input
					className="screen-form__input"
					type="text"
					placeholder="e.g. Vladimir Ivanov"
					value={name}
					onChange={(event) => setName(event.target.value)}
					disabled={phase.kind !== "ready"}
				/>
				<input
					className="screen-form__country"
					type="text"
					placeholder="Country (ISO-2, optional)"
					maxLength={2}
					value={country}
					onChange={(event) => setCountry(event.target.value)}
					disabled={phase.kind !== "ready"}
				/>
				<button
					className="btn btn-primary"
					type="submit"
					disabled={phase.kind !== "ready" || screening || name.trim() === ""}
				>
					{screening ? "Screening…" : "Screen"}
				</button>
			</form>

			{response !== null && <Results response={response} />}
			<Footer />
		</div>
	);
}

function BootBanner({ phase }: { readonly phase: Phase }) {
	if (phase.kind === "ready") {
		return null;
	}
	if (phase.kind === "error") {
		return (
			<div className="screen-banner screen-banner--error" role="alert">
				Could not load the screening bundle: {phase.message}
			</div>
		);
	}
	return (
		<div className="screen-banner" role="status">
			{STAGE_LABEL[phase.stage.kind]}
		</div>
	);
}

function Results({ response }: { readonly response: ScreenResponse }) {
	if (response.matches.length === 0) {
		return (
			<div className="screen-results screen-results--clear">
				No sanctions match. Screened in {response.execution_time_ms} ms.
			</div>
		);
	}
	return (
		<div className="screen-results">
			<p className="screen-results__count">
				{response.matches.length} potential match
				{response.matches.length === 1 ? "" : "es"} — screened in{" "}
				{response.execution_time_ms} ms.
			</p>
			<ul className="screen-results__list">
				{response.matches.map((match) => (
					<MatchCard key={match.entity_id} match={match} />
				))}
			</ul>
		</div>
	);
}

function MatchCard({ match }: { readonly match: Match }) {
	return (
		<li className="match-card">
			<div className="match-card__head">
				<span className="match-card__name">{match.primary_name}</span>
				<span className="match-card__score">{match.score.toFixed(3)}</span>
				<span className="match-card__badge">{match.risk_category}</span>
			</div>
			<p className="match-card__why">{match.explanation}</p>
			<dl className="match-card__signals">
				{match.reasons.map((reason) => (
					<div className="match-card__signal" key={reason.signal}>
						<dt>{reason.signal}</dt>
						<dd>{reason.description ?? String(reason.value)}</dd>
					</div>
				))}
			</dl>
			<div className="match-card__meta">
				{match.source_list} · {match.list_version}
				{match.countries.length > 0 ? ` · ${match.countries.join(", ")}` : ""}
			</div>
		</li>
	);
}
