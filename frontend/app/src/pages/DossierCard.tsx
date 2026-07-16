import {
	EMPTY_IDENTIFIERS,
	type Entity,
	type EntityType,
	type Identifiers,
	type Match,
	type MatchReason,
	type RiskCategory,
} from "@amlfilter/browser";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";

/** The unified view model rendered for a directory entity or scored match. */
export interface Dossier {
	readonly entity_id: string;
	readonly primary_name: string;
	readonly entity_type?: EntityType;
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

export function dossierFromEntity(entity: Entity): Dossier {
	return {
		entity_id: entity.entity_id,
		primary_name: entity.primary_name,
		// The signed watchlist wire has no entity type. The engine's PERSON value is
		// a compatibility placeholder, so omitting it avoids mislabelling banks,
		// vessels, and aircraft as people.
		risk_category: entity.risk_category,
		aliases: entity.aliases.map((alias) => alias.name),
		dob: entity.dob,
		countries: entity.countries,
		nationalities: entity.nationalities ?? [],
		addresses: entity.addresses ?? [],
		identifiers: entity.identifiers ?? EMPTY_IDENTIFIERS,
	};
}

export function dossierFromMatch(match: Match): Dossier {
	return {
		entity_id: match.entity_id,
		primary_name: match.primary_name,
		risk_category: match.risk_category,
		aliases: match.aliases,
		dob: match.dob,
		countries: match.countries,
		nationalities: match.nationalities,
		addresses: match.addresses,
		identifiers: match.identifiers,
		score: match.score,
		explanation: match.explanation,
		reasons: match.reasons,
	};
}

function identifierLines(
	identifiers: Identifiers,
	t: TFunction,
): ReadonlyArray<string> {
	const lines = identifiers.passport.map((value) =>
		t("dossier.ids.passport", { value }),
	);
	lines.push(
		...identifiers.national_id.map((value) =>
			t("dossier.ids.nationalId", { value }),
		),
	);
	for (const [label, values] of Object.entries(identifiers.other)) {
		lines.push(...values.map((value) => `${label} ${value}`));
	}
	return lines;
}

interface FactProps {
	readonly label: string;
	readonly value: string;
}

function Fact({ label, value }: FactProps) {
	return (
		<div className="match-card__fact">
			<dt>{label}</dt>
			<dd>{value}</dd>
		</div>
	);
}

interface DossierCardProps {
	readonly dossier: Dossier;
}

export function DossierCard({ dossier }: DossierCardProps) {
	const { t } = useTranslation("screen");
	const identifiers = identifierLines(dossier.identifiers, t);
	const places = [...new Set([...dossier.nationalities, ...dossier.countries])];
	return (
		<li className="match-card">
			<div className="match-card__head">
				<span className="match-card__name">{dossier.primary_name}</span>
				{dossier.entity_type !== undefined && (
					<span className="match-card__type">{dossier.entity_type}</span>
				)}
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
				{identifiers.length > 0 && (
					<Fact label={t("dossier.facts.id")} value={identifiers.join(", ")} />
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
