// LocalMatchTracker — the browser port of backend screening/match_tracker.py's
// review surface. Resolution semantics live in db/operations.ts (the observed
// contract: unconditional overwrite, regex-valid statuses, PENDING reset on
// re-screen); this layer adds the local audit trail: when the caller names no
// reviewer, the one-time analyst name from the settings row is stamped.

import type {
	ReviewFilters,
	ReviewRow,
	TieredMatch,
	WorkstationStore,
} from "./types";

/** Settings key for the one-time analyst name (spec §9.5). */
export const ANALYST_NAME_KEY = "analyst_name";

export interface ResolveOptions {
	readonly reviewerId?: string;
	readonly notes?: string;
}

export class LocalMatchTracker {
	readonly #store: WorkstationStore;

	public constructor(store: WorkstationStore) {
		this.#store = store;
	}

	public record(
		customerId: string,
		matches: ReadonlyArray<TieredMatch>,
	): Promise<ReadonlyArray<ReviewRow>> {
		return this.#store.recordMatches(customerId, matches);
	}

	public listForReview(
		filters: ReviewFilters = {},
	): Promise<ReadonlyArray<ReviewRow>> {
		return this.#store.listReviewMatches(filters);
	}

	public async resolve(
		matchId: string,
		resolution: string,
		options: ResolveOptions = {},
	): Promise<ReviewRow> {
		const reviewer =
			options.reviewerId ??
			(await this.#store.getSetting(ANALYST_NAME_KEY)) ??
			undefined;
		return this.#store.resolveMatch(
			matchId,
			resolution,
			reviewer,
			options.notes,
		);
	}
}
