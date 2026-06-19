/**
 * Shared client-surface types for AML-Filter.
 *
 * This module is types-only at the wire level: there is NO server and NO
 * axios. It declares the `ApiClient` method surface (the contract every page
 * compiles against), the data interfaces that flow across that surface, and
 * the single LOCAL-FIRST runtime singleton (`apiClient` = `LocalApiClient`,
 * all I/O in-tab via SQLite-WASM/OPFS + the signed-bundle screening engine).
 *
 * It also installs one benign, well-documented e2e test seam
 * (`window.__amlSetLastSynced`) — see its doc comment at the bottom.
 */

import { LAST_SYNCED_VERSION_KEY } from "@amlfilter/workstation";
import { LocalApiClient } from "./localApi";
import { workstation, workstationProvider } from "./workstation";

export interface ApiError {
	detail: string;
}

/**
 * The shared client surface. `LocalApiClient` implements
 * `Pick<ApiClient, keyof ApiClient>`, so every method here must keep its name
 * for that constraint to hold. Method bodies live in `LocalApiClient`; this is
 * the type contract only (no axios, no transport).
 */
export interface ApiClient {
	setApiKey(apiKey: string): void;
	clearApiKey(): void;

	// Search API
	screen(query: SearchQuery): Promise<SearchResponse>;
	getTenant(tenantId: string): Promise<TenantResponse>;
	createApiKey(data: ApiKeyCreate): Promise<ApiKeyCreateResponse>;
	listApiKeys(): Promise<ApiKeyResponse[]>;
	revokeApiKey(keyId: string): Promise<void>;
	getUsage(days?: number): Promise<UsageSummaryResponse>;

	// Lists
	listLists(): Promise<ListConfigResponse[]>;
	getAvailableLists(): Promise<AvailableList[]>;
	updateListConfig(
		listId: string,
		config: ListConfigUpdate,
	): Promise<ListConfigResponse>;

	// Whitelist
	addWhitelistCustomer(
		customer: WhitelistCustomerCreate,
	): Promise<WhitelistCustomerResponse>;
	listWhitelistCustomers(): Promise<WhitelistCustomerResponse[]>;
	getWhitelistCustomer(entityId: string): Promise<WhitelistCustomerResponse>;
	updateWhitelistCustomer(
		entityId: string,
		customer: WhitelistCustomerUpdate,
	): Promise<WhitelistCustomerResponse>;
	deleteWhitelistCustomer(entityId: string): Promise<void>;
	getWhitelistMatches(
		resolution_status?: string,
	): Promise<WhitelistMatchResponse[]>;
	resolveMatch(
		matchId: string,
		resolution_status: MatchResolutionStatus,
	): Promise<WhitelistMatchResponse>;

	// KYC customer onboarding (the /v1/customers tier)
	onboardCustomer(
		payload: CustomerOnboardRequest,
	): Promise<CustomerOnboardResponse>;
	listCustomers(params?: CustomerListParams): Promise<CustomerResponse[]>;
	getCustomer(customerId: string): Promise<CustomerResponse>;
	updateCustomer(
		customerId: string,
		payload: CustomerUpdateRequest,
	): Promise<CustomerResponse>;
	deleteCustomer(customerId: string): Promise<void>;
	listReviewMatches(params?: ReviewMatchListParams): Promise<ReviewMatch[]>;
	resolveReviewMatch(
		matchId: string,
		resolution_status: ReviewResolutionStatus,
		body?: ReviewResolveBody,
	): Promise<ReviewMatch>;

	// SAR (Suspicious Activity Report) filing (the /v1/sars tier)
	createSar(payload: SarCreateBody): Promise<SarRecord>;
	listSars(params?: SarListParams): Promise<SarRecord[]>;
	getSar(sarId: string): Promise<SarRecord>;
	updateSar(sarId: string, payload: SarUpdateBody): Promise<SarRecord>;
	exportSar(sarId: string, format: SarExportFormat): Promise<void>;

	// Attestations API (the /v1/attestations review-badge tier)
	generateAttestation(body: AttestationCreateBody): Promise<AttestationRecord>;
	listAttestations(
		params?: AttestationListParams,
	): Promise<AttestationRecord[]>;
	getAttestation(attestationId: string): Promise<AttestationRecord>;
	verifyAttestation(attestationId: string): Promise<AttestationVerification>;
	exportAttestation(
		attestationId: string,
		format: AttestationExportFormat,
	): Promise<void>;
}

// Data types — the shapes that flow across the ApiClient surface.
export interface SearchQuery {
	name: string;
	dob?: string;
	country?: string;
	entity_type?: "PERSON" | "ORGANIZATION";
	threshold?: number;
	k?: number;
	source_lists?: string[];
	risk_categories?: string[];
}

export interface Match {
	entity_id: string;
	score: number;
	risk_category: string;
	source_list: string;
	list_version?: string;
	primary_name: string;
	reasons: MatchReason[];
	explanation: string;
	aliases?: string[];
	dob?: string[];
	countries?: string[];
}

export interface MatchReason {
	signal: string;
	value: number | string;
	weight?: number | null;
	contribution?: number | null;
	description?: string | null;
}

export interface SearchResponse {
	request_id: string;
	matches: Match[];
	list_versions_used: Record<string, string>;
	execution_time_ms: number;
}

export interface TenantResponse {
	tenant_id: string;
	name: string;
	plan: string;
	created_at: string;
	updated_at: string;
}

export interface ApiKeyCreate {
	name?: string;
	expires_in_days?: number;
}

export interface ApiKeyResponse {
	key_id: string;
	name?: string;
	tenant_id: string;
	created_at: string;
	expires_at?: string;
	revoked_at?: string;
	last_used_at?: string;
}

export interface ApiKeyCreateResponse extends ApiKeyResponse {
	api_key: string;
}

export interface UsageSummaryResponse {
	tenant_id: string;
	period_start?: string | null;
	period_end?: string | null;
	event_type?: string | null;
	summary: Record<string, number>;
	total_units: number;
}

export interface ListConfigResponse {
	list_id: string;
	enabled: boolean;
	version_override?: string | null;
	current_version?: string | null;
	updated_at?: string;
}

/** A sanctions list a tenant can enable (one per registered parser). */
export interface AvailableList {
	list_id: string;
}

export interface ListConfigUpdate {
	enabled?: boolean;
	version_override?: string;
}

/** Alias entry with name and optional type */
export interface AliasEntry {
	name: string;
	type?: string;
}

export interface WhitelistCustomerCreate {
	name: string;
	dob?: string; // YYYY-MM-DD
	country?: string; // ISO2
	entity_type?: "PERSON" | "ORGANIZATION";
	aliases?: AliasEntry[];
	identifiers?: Record<string, string>;
	metadata?: Record<string, unknown>;
}

export interface WhitelistCustomerUpdate {
	name?: string;
	dob?: string;
	country?: string;
	entity_type?: "PERSON" | "ORGANIZATION";
	aliases?: AliasEntry[];
	identifiers?: Record<string, string>;
	metadata?: Record<string, unknown>;
}

export interface WhitelistCustomerResponse {
	entity_id: string;
	tenant_id: string;
	entity_type: string;
	primary_name: string;
	name_canonical: string;
	dob?: string[] | null;
	countries?: string[] | null;
	aliases: AliasEntry[];
	identifiers: Record<string, string>;
	created_at: string;
	updated_at: string;
}

export interface WhitelistMatchResponse {
	match_id: string;
	tenant_id: string;
	whitelist_entity_id: string;
	blacklist_entity_id: string;
	match_score: number;
	match_type: string;
	list_version?: string;
	detected_at: string;
	resolution_status?: string | null;
	resolved_at?: string | null;
}

export type MatchResolutionStatus =
	| "FALSE_POSITIVE"
	| "TRUE_POSITIVE"
	| "RESOLVED";

// ---------------------------------------------------------------------------
// KYC customer onboarding (the /v1/customers tier)
// ---------------------------------------------------------------------------

export type OnboardingStatus =
	| "DRAFT"
	| "PENDING_REVIEW"
	| "ACTIVE"
	| "REJECTED";

export type KycRiskRating = "LOW" | "MEDIUM" | "HIGH";

/** A single identity document supplied during onboarding. */
export interface IdDocument {
	doc_type: string;
	number: string;
	issuing_country: string; // ISO2
	expiry?: string | null; // YYYY-MM-DD
}

export interface CustomerOnboardRequest {
	customer_reference: string;
	name: string;
	onboarded_by?: string;
	country?: string; // ISO2
	id_documents?: IdDocument[];
}

export interface CustomerUpdateRequest {
	onboarding_status?: OnboardingStatus;
	kyc_risk_rating?: KycRiskRating;
	customer_reference?: string;
	name?: string;
	country?: string;
}

export interface CustomerResponse {
	customer_id: string;
	tenant_id: string;
	customer_reference: string;
	onboarding_status: string;
	kyc_risk_rating: string | null;
	id_documents: IdDocument[];
	onboarded_by: string;
	screening_entity_id: string | null;
	created_at: string;
	updated_at: string;
}

/** Onboarding response: the customer plus any sanctions matches found. */
export interface CustomerOnboardResponse extends CustomerResponse {
	match_entity_ids: string[];
}

export interface CustomerListParams {
	limit?: number;
	offset?: number;
}

// ---------------------------------------------------------------------------
// Review / case board (the /v1/review tier)
// ---------------------------------------------------------------------------

/** Match-strength tier — STRONG is the highest-confidence sanctions hit. */
export type MatchTier = "STRONG" | "POSSIBLE" | "WEAK";

/** Disposition lifecycle for a review-board match. */
export type ReviewResolutionStatus =
	| "PENDING"
	| "TRUE_POSITIVE"
	| "FALSE_POSITIVE"
	| "RESOLVED";

/** A disposition a reviewer can apply (every status except PENDING). */
export type ReviewDisposition = Exclude<ReviewResolutionStatus, "PENDING">;

/** An enriched sanctions match awaiting / under analyst review. */
export interface ReviewMatch {
	match_id: string;
	tier: MatchTier;
	match_score: number;
	match_type: string;
	resolution_status: ReviewResolutionStatus;
	reviewer_id: string | null;
	review_notes: string | null;
	detected_at: string;
	customer_id: string | null;
	customer_reference: string | null;
	customer_name: string | null;
	sanctioned_name: string;
	source_list: string;
}

export interface ReviewMatchListParams {
	tier?: MatchTier;
	resolution_status?: ReviewResolutionStatus;
	limit?: number;
	offset?: number;
}

export interface ReviewResolveBody {
	reviewer_id?: string;
	review_notes?: string;
}

// ---------------------------------------------------------------------------
// SAR (Suspicious Activity Report) filing (the /v1/sars tier)
// ---------------------------------------------------------------------------

export type SarStatus = "DRAFT" | "COMPLETED" | "EXPORTED";

export type SarJurisdiction = "US" | "UK" | "AU";

export type SarTemplate = "FINCEN";

export type SarExportFormat = "pdf" | "json";

/** Immutable capture of the SAR subject + match basis at filing time. */
export interface SarSubject {
	customer_reference: string;
	customer_name: string;
	customer_dob: string[];
	customer_identifiers: string[];
	matched_sanctioned_name: string;
	matched_source_list: string;
	match_score: number;
	match_tier: string;
}

/** The institution / person filing the SAR. */
export interface SarFiler {
	name: string;
	institution: string;
	contact: string;
}

export interface SarRecord {
	sar_id: string;
	tenant_id: string;
	customer_id: string;
	match_id: string;
	jurisdiction: SarJurisdiction;
	template: SarTemplate;
	subject: SarSubject;
	suspicious_activity_narrative: string | null;
	filer: SarFiler;
	status: SarStatus;
	created_by: string;
	created_at: string;
	updated_at: string;
	filed_at: string | null;
}

export interface SarCreateBody {
	customer_id: string;
	match_id: string;
	jurisdiction?: SarJurisdiction;
	template?: SarTemplate;
	narrative?: string | null;
	filer: SarFiler;
	created_by?: string;
}

export interface SarUpdateBody {
	narrative?: string | null;
	filer?: SarFiler;
	status?: SarStatus;
}

// ---------------------------------------------------------------------------
// Attestations / review badge (the /v1/attestations tier)
// ---------------------------------------------------------------------------

/** Result classification of a customer's screening attestation. */
export type AttestationStatus =
	| "CLEAR"
	| "MATCHES_PENDING"
	| "MATCHES_DISPOSITIONED";

export type AttestationExportFormat = "pdf" | "json";

/** One enabled list and the version it was screened against. */
export interface ListVersionEntry {
	list_id: string;
	version: string;
}

/** The screening outcome captured at attestation time. */
export interface AttestationResult {
	status: AttestationStatus;
	match_count: number;
	pending_count: number;
}

/** A persisted, optionally-signed screening attestation (review badge). */
export interface AttestationRecord {
	attestation_id: string;
	tenant_id: string;
	customer_id: string;
	customer_reference: string;
	screened_at: string;
	valid_until: string;
	lists_and_versions: ListVersionEntry[];
	result: AttestationResult;
	signature: string | null;
	signing_key_id: string | null;
	algo: string | null;
	created_at: string;
}

/** Request body for generating/refreshing a customer's attestation. */
export interface AttestationCreateBody {
	customer_id: string;
	require_signature?: boolean;
}

/** Query params for listing the latest attestation per customer. */
export interface AttestationListParams {
	customer_id?: string;
	stale?: boolean;
	limit?: number;
	offset?: number;
}

/** Outcome of verifying an attestation's ed25519 signature. */
export interface AttestationVerification {
	valid: boolean;
	reason: string;
}

export interface SarListParams {
	status?: SarStatus;
	customer_id?: string;
	limit?: number;
	offset?: number;
}

/**
 * Match context for a SAR (suspicious activity report) keyed off a review row.
 * Mirrors the fields a review row exposes. `customer_id` comes straight from the
 * review row; when it is null the match has no onboarded customer and a SAR
 * cannot be filed. Part of the client surface contract only — the local-first
 * tier does not yet implement SAR filing, so LocalApiClient throws for it.
 */
export interface SarMatchContext {
	match_id: string;
	customer_id: string | null;
	customer_reference: string | null;
	customer_name: string | null;
	sanctioned_name: string;
	source_list: string;
	match_score: number;
	tier: string;
}

// The app is LOCAL-FIRST: the singleton every page calls is the
// LocalApiClient — all KYC I/O stays in the tab (SQLite-WASM/OPFS + the
// signed-bundle screening engine). `ApiClient` above is the shared TYPE
// surface it satisfies; there is no server-tier transport in this app.
export const apiClient = new LocalApiClient(workstationProvider);

declare global {
	interface Window {
		/**
		 * Test seam: stale the recorded last-synced watchlist version so the next
		 * "Check for updates" sees a mismatch and runs a full rescanAll(). Always
		 * present (the e2e drives the minified preview build, MODE==="production",
		 * so it must NOT be gated behind import.meta.env.DEV). Benign in prod — it
		 * only writes one local settings string (the recorded last-synced watchlist
		 * version) that a user could already overwrite by re-syncing.
		 */
		__amlSetLastSynced?: (version: string) => Promise<void>;
	}
}

if (typeof window !== "undefined") {
	window.__amlSetLastSynced = async (version: string): Promise<void> => {
		const handle = await workstation();
		await handle.store.setSetting(LAST_SYNCED_VERSION_KEY, version);
	};
}
