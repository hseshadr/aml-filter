// The KYC workstation domain contract. Field names mirror the verified backend
// rows (db/models.py Customer + WhitelistBlacklistMatch and api/v1/review.py's
// ReviewMatchRow) so the local tier and the server tier stay one product.

/** Review tier for a match, ordered by descending strength (scoring/tiers.py:20). */
export type MatchTier = "STRONG" | "POSSIBLE" | "WEAK";

/** Disposition lifecycle (db/models.py:336 column comment). */
export type ResolutionStatus =
	| "PENDING"
	| "FALSE_POSITIVE"
	| "TRUE_POSITIVE"
	| "RESOLVED";

/** One identity document supplied during onboarding (api/v1/customers.py). */
export interface IdDocument {
	readonly doc_type: string;
	readonly number: string;
	readonly issuing_country: string;
	readonly expiry?: string | null;
}

/** A persisted KYC customer (local mirror of backend `customers`). */
export interface CustomerRow {
	readonly customer_id: string;
	readonly customer_reference: string;
	readonly name: string;
	readonly country: string | null;
	readonly onboarding_status: string;
	readonly kyc_risk_rating: string | null;
	readonly id_documents: ReadonlyArray<IdDocument>;
	readonly onboarded_by: string;
	readonly created_at: string;
	readonly updated_at: string;
}

/** Payload to insert a customer row (dup-rejection on customer_reference). */
export interface CreateCustomerPayload {
	readonly customer_reference: string;
	readonly name: string;
	readonly country?: string | null;
	readonly onboarded_by?: string;
	readonly id_documents?: ReadonlyArray<IdDocument>;
}

/** Partial customer update (mirrors CustomerUpdateRequest in app api.ts). */
export interface CustomerPatch {
	readonly onboarding_status?: string;
	readonly kyc_risk_rating?: string;
	readonly customer_reference?: string;
	/** Screened identity name. Empty string is treated as "no change". */
	readonly name?: string;
	/** ISO2 country. Empty string is treated as "no change". */
	readonly country?: string;
}

/** One explanation reason — same shape as @amlfilter/browser MatchReason. */
export interface MatchReasonJson {
	readonly signal: string;
	readonly value: number | string;
	readonly weight: number | null;
	readonly contribution: number | null;
	readonly description: string | null;
}

/** A screened + tiered match, ready to persist for the review board. */
export interface TieredMatch {
	readonly ofac_entity_id: string;
	readonly score: number;
	readonly tier: MatchTier;
	readonly sanctioned_name: string;
	readonly source_list: string;
	readonly list_version: string | null;
	readonly reasons: ReadonlyArray<MatchReasonJson>;
	readonly explanation: string;
}

/** A review-board row: match + denormalized customer fields (review.py:31). */
export interface ReviewRow {
	readonly match_id: string;
	readonly ofac_entity_id: string;
	readonly tier: MatchTier;
	readonly match_score: number;
	readonly resolution_status: ResolutionStatus;
	readonly reviewer_id: string | null;
	readonly review_notes: string | null;
	readonly detected_at: string;
	readonly customer_id: string;
	readonly customer_reference: string;
	readonly customer_name: string;
	readonly sanctioned_name: string;
	readonly source_list: string;
	readonly list_version: string | null;
	readonly reasons: ReadonlyArray<MatchReasonJson>;
	readonly explanation: string;
}

/** Review-board filters (review.py:128–139 query params, camelCased). */
export interface ReviewFilters {
	readonly tier?: MatchTier;
	readonly resolutionStatus?: ResolutionStatus;
	readonly limit?: number;
	readonly offset?: number;
}

/**
 * The persistence surface the main thread sees. `DbClient` implements it over
 * the DB worker; unit tests fake it in-memory.
 */
export interface WorkstationStore {
	open(): Promise<number>;
	createCustomer(payload: CreateCustomerPayload): Promise<CustomerRow>;
	listCustomers(): Promise<ReadonlyArray<CustomerRow>>;
	getCustomer(customerId: string): Promise<CustomerRow | null>;
	updateCustomer(
		customerId: string,
		patch: CustomerPatch,
	): Promise<CustomerRow>;
	deleteCustomer(customerId: string): Promise<void>;
	recordMatches(
		customerId: string,
		matches: ReadonlyArray<TieredMatch>,
	): Promise<ReadonlyArray<ReviewRow>>;
	replaceMatches(
		customerId: string,
		matches: ReadonlyArray<TieredMatch>,
	): Promise<ReadonlyArray<ReviewRow>>;
	listReviewMatches(filters: ReviewFilters): Promise<ReadonlyArray<ReviewRow>>;
	resolveMatch(
		matchId: string,
		resolution: string,
		reviewerId?: string,
		notes?: string,
	): Promise<ReviewRow>;
	getSetting(key: string): Promise<string | null>;
	setSetting(key: string, value: string): Promise<void>;
}
