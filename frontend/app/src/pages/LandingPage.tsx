import { Link } from "react-router-dom";
import { Footer } from "../components/Footer";
import { DEMO_STATS } from "../generated/landing-stats";
import "../styles/landing.css";

// The public marketing landing at "/". It is purely presentational: no engine,
// no backend, no auth. It pitches the two tiers of aml-filter — the backend-free
// in-browser screening demo (/screen) and the local-first KYC workstation
// (/customers) — and routes a visitor to whichever they want.
//
// HONESTY: every KPI below is a real number, not marketing fiction. The two
// measured figures are GENERATED from the actual source files by
// scripts/gen-demo-stats.mjs (committed as src/generated/landing-stats.ts and
// regenerated on every build), so they can never silently drift:
//   • $0 backend infra        — the /screen path makes zero backend calls after sync.
//   • ~{modelSizeMb} MB matcher — statSync of public/models/.../model_quantized.onnx;
//                                 mirrors ScreenPage's LOADING_MODEL_LABEL.
//   • {demoEntityCount} demo entities — count of non-empty records in
//                                 backend/examples/demo_entities.jsonl (the demo
//                                 bundle, labelled "demo" so nobody mistakes it
//                                 for the full OFAC list).
//   • 0 bytes PII leave       — the query is matched in-tab; nothing typed is sent.

interface Metric {
	readonly num: string;
	readonly prefix?: string;
	readonly unit?: string;
	readonly tone?: "hot" | "pos";
	readonly label: string;
	readonly sub: string;
}

interface Why {
	readonly title: string;
	readonly body: string;
}

interface Step {
	readonly n: string;
	readonly label: string;
}

const METRICS: readonly Metric[] = [
	{
		num: "$0",
		tone: "pos",
		label: "backend infra to run the demo",
		sub: "no API, no vector DB, no servers in the path",
	},
	{
		prefix: "~",
		num: String(DEMO_STATS.modelSizeMb),
		unit: "MB",
		tone: "hot",
		label: "MiniLM matcher, cached once",
		sub: "all-MiniLM-L6-v2 quantized ONNX, then offline",
	},
	{
		num: String(DEMO_STATS.demoEntityCount),
		label: "sanctions entities on the demo list",
		sub: "fictional demo bundle · the workstation loads real lists",
	},
	{
		num: "0 bytes",
		tone: "pos",
		label: "of what you type leave the device",
		sub: "the name is matched entirely in the tab",
	},
];

const WHYS: readonly Why[] = [
	{
		title: "Private",
		body: "The name you screen is matched in the tab and never leaves the device. No query, no customer name, is sent to a third-party SaaS.",
	},
	{
		title: "Local / Offline",
		body: "Backend-free and in-tab. After the first load — model plus signed bundle — the matcher keeps working with no network at all.",
	},
	{
		title: "Verifiable",
		body: "The sanctions list arrives as a content-addressed, ed25519-signed bundle, verified fail-closed in-tab against a pinned key. A bad signature aborts the load.",
	},
];

const STEPS: readonly Step[] = [
	{ n: "1", label: "sync the signed bundle" },
	{ n: "2", label: "verify ed25519 + sha-256 in-tab (fail-closed)" },
	{ n: "3", label: "load MiniLM once" },
	{ n: "4", label: "normalize + embed the query" },
	{ n: "5", label: "transparent weighted scoring" },
	{ n: "6", label: "ranked matches with per-signal reasons" },
];

const WORKSTATION_FLOW = [
	"Onboard a customer",
	"Auto-screen in-tab",
	"Tiered review board",
	"Resolve with an audit trail",
] as const;

function MetricTile({ metric }: { readonly metric: Metric }) {
	const toneClass = metric.tone ? ` landing__tile-num--${metric.tone}` : "";
	return (
		<div className="landing__tile">
			<div className={`landing__tile-num${toneClass}`}>
				{metric.prefix ? (
					<span className="landing__tile-prefix">{metric.prefix}</span>
				) : null}
				{metric.num}
				{metric.unit ? (
					<span className="landing__tile-unit">{metric.unit}</span>
				) : null}
			</div>
			<div className="landing__tile-label">{metric.label}</div>
			<div className="landing__tile-sub">{metric.sub}</div>
		</div>
	);
}

function Hero() {
	return (
		<header className="landing__hero">
			<div className="landing__eyebrow">
				on-device · in your browser · no backend
			</div>
			<div className="landing__wordmark">
				<img src="/logo.svg" alt="" aria-hidden="true" />
				<span className="landing__wordmark-name">
					AML-Filter<span className="landing__wordmark-dot">.</span>
				</span>
			</div>

			<h1 className="landing__title">
				Sanctions screening that runs <em>entirely in your browser</em>.
			</h1>

			<p className="landing__lede">
				Screening a name usually means shipping your customers&rsquo; names to a
				third-party SaaS. AML-Filter turns that inside out. The sanctions list
				syncs in as a signed bundle, is ed25519-verified in the tab, and the
				matcher runs locally — so nothing you type leaves the device. Private,
				offline-capable, and free to operate.
			</p>

			<div className="landing__cta">
				<Link to="/screen" className="landing__btn landing__btn--primary">
					▶ Try the live demo
				</Link>
				<Link to="/customers" className="landing__btn landing__btn--ghost">
					Open the workstation
				</Link>
			</div>
			<p className="landing__footnote">
				First load fetches the matcher model plus the signed bundle; after that
				everything is cached and works offline.
			</p>
		</header>
	);
}

function MetricsBand() {
	return (
		<section className="landing__band" aria-label="Metrics">
			<div className="landing__band-head">
				<h2 className="landing__band-title">What it costs to run</h2>
				<div className="landing__band-note">measured / real figures</div>
			</div>
			<div className="landing__tiles">
				{METRICS.map((metric) => (
					<MetricTile key={metric.label} metric={metric} />
				))}
			</div>
		</section>
	);
}

function WhyCards() {
	return (
		<section className="landing__why" aria-label="Why">
			{WHYS.map((why) => (
				<article key={why.title} className="landing__why-card">
					<div className="landing__why-key">{why.title}</div>
					<div className="landing__why-desc">{why.body}</div>
				</article>
			))}
		</section>
	);
}

function HowItWorks() {
	return (
		<section className="landing__how" aria-label="How it works">
			<div className="landing__how-title">How it works</div>
			<ol className="landing__steps">
				{STEPS.map((step, i) => (
					<li key={step.n} className="landing__step-item">
						<span className="landing__step">
							<b>{step.n}</b>
							{step.label}
						</span>
						{i < STEPS.length - 1 ? (
							<span className="landing__arrow" aria-hidden="true">
								→
							</span>
						) : null}
					</li>
				))}
			</ol>
		</section>
	);
}

function Workstation() {
	return (
		<section
			className="landing__workstation"
			aria-label="Compliance workstation"
		>
			<div className="landing__workstation-kicker">
				the local-first KYC tier
			</div>
			<h2 className="landing__workstation-title">
				Need the full workflow? The KYC workstation runs in your browser too.
			</h2>
			<p className="landing__workstation-lede">
				Onboard customers, auto-screen them against the signed sanctions bundle,
				and triage tiered matches on a review board — persisted to SQLite in
				your browser&rsquo;s private storage (OPFS). No login, no server: your
				customer data never leaves the device.
			</p>
			<ol className="landing__workstation-flow">
				{WORKSTATION_FLOW.map((label, i) => (
					<li key={label} className="landing__workstation-step">
						<span className="landing__workstation-pill">{label}</span>
						{i < WORKSTATION_FLOW.length - 1 ? (
							<span className="landing__workstation-arrow" aria-hidden="true">
								→
							</span>
						) : null}
					</li>
				))}
			</ol>
			<Link to="/customers" className="landing__btn landing__btn--invert">
				Start onboarding
			</Link>
		</section>
	);
}

export function LandingPage() {
	return (
		<main className="landing">
			<div className="landing__wrap">
				<Hero />
				<MetricsBand />
				<WhyCards />
				<HowItWorks />
				<Workstation />
				<Footer />
			</div>
		</main>
	);
}
