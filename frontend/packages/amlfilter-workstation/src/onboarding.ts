// LocalOnboardingService — the browser port of backend customers/service.py
// OnboardingService, re-shaped for the two-store architecture (D4): the
// customer row goes to SQLite via the store; the screen runs on the existing
// signed-bundle engine; tiered matches are persisted back to SQLite.

import {
	type Match,
	PRESETS,
	type ScreenQuery,
	type ScreenResponse,
} from "@amlfilter/browser";
import { classifyTier } from "./tiering";
import type {
	CustomerRow,
	IdDocument,
	ReviewRow,
	TieredMatch,
	WorkstationStore,
} from "./types";

/** Score floor for onboarding screens (customers/service.py:31). */
// Deliberately below the POSSIBLE tier boundary: onboarding records WEAK-tier matches too.
export const ONBOARDING_THRESHOLD = 0.65;

/** The screen surface the service needs — ScreeningEngine satisfies it. */
export interface NameScreener {
	screen(query: ScreenQuery): Promise<ScreenResponse>;
}

export interface OnboardRequest {
	readonly customer_reference: string;
	readonly name: string;
	readonly onboarded_by?: string;
	readonly country?: string | null;
	readonly id_documents?: ReadonlyArray<IdDocument>;
}

export interface OnboardResult {
	readonly customer: CustomerRow;
	readonly matches: ReadonlyArray<ReviewRow>;
}

export class LocalOnboardingService {
	readonly #store: WorkstationStore;
	readonly #screener: NameScreener;
	readonly #possibleThreshold: number;

	public constructor(
		store: WorkstationStore,
		screener: NameScreener,
		possibleThreshold: number = PRESETS.balanced.threshold,
	) {
		this.#store = store;
		this.#screener = screener;
		this.#possibleThreshold = possibleThreshold;
	}

	/** Create the customer (dup-rejected), screen the name, tier + persist. */
	public async onboard(request: OnboardRequest): Promise<OnboardResult> {
		// Duplicate check happens BEFORE any screening work — the same
		// fail-closed ordering as customers/service.py:59.
		const customer = await this.#store.createCustomer({
			customer_reference: request.customer_reference,
			name: request.name,
			country: request.country ?? null,
			onboarded_by: request.onboarded_by ?? "local",
			id_documents: request.id_documents ?? [],
		});
		const response = await this.#screener.screen({
			name: request.name,
			country: request.country ?? null,
			threshold: ONBOARDING_THRESHOLD,
		});
		const tiered = response.matches.map((match) => this.#tier(match));
		const matches =
			tiered.length === 0
				? []
				: await this.#store.recordMatches(customer.customer_id, tiered);
		return { customer, matches };
	}

	#tier(match: Match): TieredMatch {
		return {
			ofac_entity_id: match.entity_id,
			score: match.score,
			tier: classifyTier(match.score, this.#possibleThreshold),
			sanctioned_name: match.primary_name,
			source_list: match.source_list,
			list_version: match.list_version,
			reasons: [...match.reasons],
			explanation: match.explanation,
		};
	}
}
