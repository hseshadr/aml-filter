import { Trans, useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Footer } from "../components/Footer";
import { DEMO_STATS } from "../generated/landing-stats";
import "../styles/landing.css";

// The public marketing landing at "/". It is purely presentational: no engine,
// no backend, no auth. It pitches the two tiers of aml-filter — the backend-free
// in-browser screening demo (/screen) and the local-first KYC workstation
// (/customers) — and routes a visitor to whichever they want.
//
// Copy is i18n'd: the display strings live in locales/en/landing.json under the
// "landing" namespace, and the data arrays below hold catalog KEYS (resolved via
// t() at render). The big KPI figure line (num/prefix/unit) is DATA, not copy —
// the two measured tiles come straight from the GENERATED single source of truth.
//
// HONESTY: every KPI below is a real number, not marketing fiction. The two
// measured figures are GENERATED from the actual source files by
// scripts/gen-demo-stats.mjs (committed as src/generated/landing-stats.ts and
// regenerated on every build), so they can never silently drift:
//   • $0 backend infra        — the /screen path makes zero backend calls after sync.
//   • ~{modelSizeMb} MB matcher — statSync of public/models/.../model_quantized.onnx;
//                                 mirrors ScreenPage's LOADING_MODEL_LABEL.
//   • {demoEntityCount} demo entities — count of non-empty records in
//                                 frontend/packages/amlfilter-publisher/fixtures/
//                                 demo_entities.jsonl (the demo bundle, labelled
//                                 "demo" so nobody mistakes it for the full OFAC list).
//   • 0 bytes PII leave       — the query is matched in-tab; nothing typed is sent.

interface Metric {
	readonly num: string;
	readonly prefix?: string;
	readonly unit?: string;
	readonly tone?: "hot" | "pos";
	readonly labelKey: string;
	readonly subKey: string;
}

interface Why {
	readonly titleKey: string;
	readonly bodyKey: string;
}

interface Step {
	readonly n: string;
	readonly labelKey: string;
}

const METRICS: readonly Metric[] = [
	{
		num: "$0",
		tone: "pos",
		labelKey: "metrics.infra.label",
		subKey: "metrics.infra.sub",
	},
	{
		prefix: "~",
		num: String(DEMO_STATS.modelSizeMb),
		unit: "MB",
		tone: "hot",
		labelKey: "metrics.matcher.label",
		subKey: "metrics.matcher.sub",
	},
	{
		num: String(DEMO_STATS.demoEntityCount),
		labelKey: "metrics.entities.label",
		subKey: "metrics.entities.sub",
	},
	{
		num: "0 bytes",
		tone: "pos",
		labelKey: "metrics.pii.label",
		subKey: "metrics.pii.sub",
	},
];

const WHYS: readonly Why[] = [
	{ titleKey: "whys.private.title", bodyKey: "whys.private.body" },
	{ titleKey: "whys.local.title", bodyKey: "whys.local.body" },
	{ titleKey: "whys.verifiable.title", bodyKey: "whys.verifiable.body" },
];

const STEPS: readonly Step[] = [
	{ n: "1", labelKey: "howItWorks.steps.sync" },
	{ n: "2", labelKey: "howItWorks.steps.verify" },
	{ n: "3", labelKey: "howItWorks.steps.load" },
	{ n: "4", labelKey: "howItWorks.steps.embed" },
	{ n: "5", labelKey: "howItWorks.steps.score" },
	{ n: "6", labelKey: "howItWorks.steps.rank" },
];

const WORKSTATION_FLOW = [
	"workstation.flow.onboard",
	"workstation.flow.screen",
	"workstation.flow.review",
	"workstation.flow.resolve",
] as const;

function MetricTile({ metric }: { readonly metric: Metric }) {
	const { t } = useTranslation("landing");
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
			<div className="landing__tile-label">{t(metric.labelKey)}</div>
			<div className="landing__tile-sub">{t(metric.subKey)}</div>
		</div>
	);
}

function Hero() {
	const { t } = useTranslation("landing");
	return (
		<header className="landing__hero">
			<div className="landing__eyebrow">{t("hero.eyebrow")}</div>
			<div className="landing__wordmark">
				<img src="/logo.svg" alt="" aria-hidden="true" />
				<span className="landing__wordmark-name">
					AML-Filter<span className="landing__wordmark-dot">.</span>
				</span>
			</div>

			<h1 className="landing__title">
				<Trans i18nKey="hero.title" ns="landing" components={{ em: <em /> }} />
			</h1>

			<p className="landing__lede">{t("hero.lede")}</p>

			<div className="landing__cta">
				<Link to="/screen" className="landing__btn landing__btn--primary">
					{t("hero.ctaPrimary")}
				</Link>
				<Link to="/customers" className="landing__btn landing__btn--ghost">
					{t("hero.ctaSecondary")}
				</Link>
			</div>
			<p className="landing__footnote">{t("hero.footnote")}</p>
		</header>
	);
}

function MetricsBand() {
	const { t } = useTranslation("landing");
	return (
		<section className="landing__band" aria-label={t("metrics.ariaLabel")}>
			<div className="landing__band-head">
				<h2 className="landing__band-title">{t("metrics.title")}</h2>
				<div className="landing__band-note">{t("metrics.note")}</div>
			</div>
			<div className="landing__tiles">
				{METRICS.map((metric) => (
					<MetricTile key={metric.labelKey} metric={metric} />
				))}
			</div>
		</section>
	);
}

function WhyCards() {
	const { t } = useTranslation("landing");
	return (
		<section className="landing__why" aria-label={t("whys.ariaLabel")}>
			{WHYS.map((why) => (
				<article key={why.titleKey} className="landing__why-card">
					<div className="landing__why-key">{t(why.titleKey)}</div>
					<div className="landing__why-desc">{t(why.bodyKey)}</div>
				</article>
			))}
		</section>
	);
}

function HowItWorks() {
	const { t } = useTranslation("landing");
	return (
		<section className="landing__how" aria-label={t("howItWorks.ariaLabel")}>
			<div className="landing__how-title">{t("howItWorks.title")}</div>
			<ol className="landing__steps">
				{STEPS.map((step, i) => (
					<li key={step.n} className="landing__step-item">
						<span className="landing__step">
							<b>{step.n}</b>
							{t(step.labelKey)}
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
	const { t } = useTranslation("landing");
	return (
		<section
			className="landing__workstation"
			aria-label={t("workstation.ariaLabel")}
		>
			<div className="landing__workstation-kicker">
				{t("workstation.kicker")}
			</div>
			<h2 className="landing__workstation-title">{t("workstation.title")}</h2>
			<p className="landing__workstation-lede">{t("workstation.lede")}</p>
			<ol className="landing__workstation-flow">
				{WORKSTATION_FLOW.map((flowKey, i) => (
					<li key={flowKey} className="landing__workstation-step">
						<span className="landing__workstation-pill">{t(flowKey)}</span>
						{i < WORKSTATION_FLOW.length - 1 ? (
							<span className="landing__workstation-arrow" aria-hidden="true">
								→
							</span>
						) : null}
					</li>
				))}
			</ol>
			<Link to="/customers" className="landing__btn landing__btn--invert">
				{t("workstation.cta")}
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
