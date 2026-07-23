import {
	defaultKeyStorage,
	EMPTY_IDENTIFIERS,
	type Entity,
	type EntityType,
	type Identifiers,
	loadInstallKey,
	type Match,
	type MatchReason,
	type MatchScoreSubject,
	type RiskCategory,
	verifyMatchReceipt,
} from "@amlfilter/browser";
import { ReceiptBadge, ReceiptPanel } from "@edgeproc/receipt-ui";
import type { TFunction } from "i18next";
import { useEffect, useState } from "react";
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
	/** The signed Avow receipt sealing a scored match (absent on directory rows). */
	readonly score_receipt?: ScoreReceipt;
}

/** The signed Avow receipt a scored match carries. */
type ScoreReceipt = NonNullable<Match["score_receipt"]>;

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
		score_receipt: match.score_receipt,
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

/**
 * The ONLY signer this card trusts: this install's own key, read from the
 * same storage the engine's sealer signs with. Re-resolved whenever a new
 * receipt arrives, and reset to null — no verdict UI at all, the fail-closed
 * default — while resolving, so a receipt is never judged against a stale key.
 */
function useInstallPublicKey(receipt: ScoreReceipt | undefined): string | null {
	const [publicKey, setPublicKey] = useState<string | null>(null);
	useEffect(() => {
		setPublicKey(null);
		if (receipt === undefined) {
			return;
		}
		// No usable storage means no stable install key (matchReceipts.ts never
		// seals there either): stay fail-closed rather than invent a signer.
		const storage = defaultKeyStorage();
		if (storage === null) {
			return;
		}
		let active = true;
		void loadInstallKey(storage).then((key) => {
			if (active) {
				setPublicKey(key.publicKeyHex);
			}
		});
		return () => {
			active = false;
		};
	}, [receipt]);
	return publicKey;
}

interface ReceiptSubjectProps {
	readonly payload: MatchScoreSubject;
	readonly t: TFunction;
}

/** The sealed subject rows shown inside the receipt panel's payload section. */
function ReceiptSubject({ payload, t }: ReceiptSubjectProps) {
	return (
		<dl className="match-card__signals">
			<div className="match-card__signal">
				<dt>{t("dossier.receipt.sealedScore")}</dt>
				<dd>{`${payload.score.toFixed(3)} (${payload.tier})`}</dd>
			</div>
			<div className="match-card__signal">
				<dt>{t("dossier.receipt.engine")}</dt>
				<dd>{payload.engine_version}</dd>
			</div>
			<div className="match-card__signal">
				<dt>{t("dossier.receipt.watchlist")}</dt>
				<dd>{payload.watchlist_version}</dd>
			</div>
			<div className="match-card__signal">
				<dt>{t("dossier.receipt.inputs")}</dt>
				<dd>
					<code>{payload.inputs_hash}</code>
				</dd>
			</div>
		</dl>
	);
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
	const receiptKey = useInstallPublicKey(dossier.score_receipt);
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
				{dossier.score_receipt !== undefined && receiptKey !== null && (
					<ReceiptBadge
						expectedPublicKey={receiptKey}
						receipt={dossier.score_receipt}
						verify={verifyMatchReceipt}
					/>
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
			{dossier.score_receipt !== undefined && receiptKey !== null && (
				<details className="match-card__details match-card__receipt">
					<summary>{t("dossier.receipt.summary")}</summary>
					<ReceiptPanel
						expectedPublicKey={receiptKey}
						receipt={dossier.score_receipt}
						renderPayload={(payload) => (
							<ReceiptSubject payload={payload} t={t} />
						)}
						verify={verifyMatchReceipt}
					/>
				</details>
			)}
		</li>
	);
}
