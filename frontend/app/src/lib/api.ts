/** API client for AML-Filter backend. */

import axios, { type AxiosError, type AxiosInstance } from "axios";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export interface ApiError {
	detail: string;
}

export class ApiClient {
	private client: AxiosInstance;

	constructor(apiKey?: string) {
		this.client = axios.create({
			baseURL: API_BASE_URL,
			headers: {
				"Content-Type": "application/json",
				...(apiKey && { "X-API-Key": apiKey }),
			},
		});

		// Add response interceptor for error handling
		this.client.interceptors.response.use(
			(response) => response,
			(error: AxiosError<ApiError>) => {
				if (error.response) {
					throw new Error(error.response.data?.detail || error.message);
				}
				throw error;
			},
		);
	}

	setApiKey(apiKey: string) {
		this.client.defaults.headers["X-API-Key"] = apiKey;
	}

	clearApiKey() {
		delete this.client.defaults.headers["X-API-Key"];
	}

	// Search API
	async screen(query: SearchQuery): Promise<SearchResponse> {
		const response = await this.client.post<SearchResponse>(
			"/v1/screen",
			query,
		);
		return response.data;
	}

	// Tenant API
	async getTenant(tenantId: string): Promise<TenantResponse> {
		const response = await this.client.get<TenantResponse>(
			`/v1/tenants/${tenantId}`,
		);
		return response.data;
	}

	// API Keys
	async createApiKey(data: ApiKeyCreate): Promise<ApiKeyCreateResponse> {
		const response = await this.client.post<ApiKeyCreateResponse>(
			"/v1/api-keys",
			data,
		);
		return response.data;
	}

	async listApiKeys(): Promise<ApiKeyResponse[]> {
		const response = await this.client.get<ApiKeyResponse[]>("/v1/api-keys");
		return response.data;
	}

	async revokeApiKey(keyId: string): Promise<void> {
		await this.client.delete(`/v1/api-keys/${keyId}`);
	}

	// Usage
	async getUsage(days?: number): Promise<UsageSummaryResponse> {
		const params = days ? { days } : {};
		const response = await this.client.get<UsageSummaryResponse>("/v1/usage", {
			params,
		});
		return response.data;
	}

	// Lists
	async listLists(): Promise<ListConfigResponse[]> {
		const response = await this.client.get<ListConfigResponse[]>("/v1/lists");
		return response.data;
	}

	async getAvailableLists(): Promise<AvailableList[]> {
		const response = await this.client.get<AvailableList[]>(
			"/v1/lists/available",
		);
		return response.data;
	}

	async updateListConfig(
		listId: string,
		config: ListConfigUpdate,
	): Promise<ListConfigResponse> {
		const response = await this.client.put<ListConfigResponse>(
			`/v1/lists/${listId}`,
			config,
		);
		return response.data;
	}

	// Whitelist
	async addWhitelistCustomer(
		customer: WhitelistCustomerCreate,
	): Promise<WhitelistCustomerResponse> {
		const response = await this.client.post<WhitelistCustomerResponse>(
			"/v1/whitelist/customers",
			customer,
		);
		return response.data;
	}

	async listWhitelistCustomers(): Promise<WhitelistCustomerResponse[]> {
		const response = await this.client.get<WhitelistCustomerResponse[]>(
			"/v1/whitelist/customers",
		);
		return response.data;
	}

	async getWhitelistCustomer(
		entityId: string,
	): Promise<WhitelistCustomerResponse> {
		const response = await this.client.get<WhitelistCustomerResponse>(
			`/v1/whitelist/customers/${entityId}`,
		);
		return response.data;
	}

	async updateWhitelistCustomer(
		entityId: string,
		customer: WhitelistCustomerUpdate,
	): Promise<WhitelistCustomerResponse> {
		const response = await this.client.put<WhitelistCustomerResponse>(
			`/v1/whitelist/customers/${entityId}`,
			customer,
		);
		return response.data;
	}

	async deleteWhitelistCustomer(entityId: string): Promise<void> {
		await this.client.delete(`/v1/whitelist/customers/${entityId}`);
	}

	async getWhitelistMatches(
		resolution_status?: string,
	): Promise<WhitelistMatchResponse[]> {
		const params = resolution_status ? { resolution_status } : {};
		const response = await this.client.get<WhitelistMatchResponse[]>(
			"/v1/whitelist/matches",
			{
				params,
			},
		);
		return response.data;
	}

	async resolveMatch(
		matchId: string,
		resolution_status: MatchResolutionStatus,
	): Promise<WhitelistMatchResponse> {
		const response = await this.client.put<WhitelistMatchResponse>(
			`/v1/whitelist/matches/${matchId}/resolve`,
			undefined,
			{ params: { resolution_status } },
		);
		return response.data;
	}

	// KYC customer onboarding (the /v1/customers tier)
	async onboardCustomer(
		payload: CustomerOnboardRequest,
	): Promise<CustomerOnboardResponse> {
		const response = await this.client.post<CustomerOnboardResponse>(
			"/v1/customers",
			payload,
		);
		return response.data;
	}

	async listCustomers(
		params?: CustomerListParams,
	): Promise<CustomerResponse[]> {
		const response = await this.client.get<CustomerResponse[]>(
			"/v1/customers",
			{
				params,
			},
		);
		return response.data;
	}

	async getCustomer(customerId: string): Promise<CustomerResponse> {
		const response = await this.client.get<CustomerResponse>(
			`/v1/customers/${customerId}`,
		);
		return response.data;
	}

	async updateCustomer(
		customerId: string,
		payload: CustomerUpdateRequest,
	): Promise<CustomerResponse> {
		const response = await this.client.put<CustomerResponse>(
			`/v1/customers/${customerId}`,
			payload,
		);
		return response.data;
	}

	async deleteCustomer(customerId: string): Promise<void> {
		await this.client.delete(`/v1/customers/${customerId}`);
	}

	// Review / case board (the /v1/review tier)
	async listReviewMatches(
		params?: ReviewMatchListParams,
	): Promise<ReviewMatch[]> {
		const response = await this.client.get<ReviewMatch[]>(
			"/v1/review/matches",
			{ params },
		);
		return response.data;
	}

	async resolveReviewMatch(
		matchId: string,
		resolution_status: ReviewResolutionStatus,
		body?: ReviewResolveBody,
	): Promise<ReviewMatch> {
		const response = await this.client.put<ReviewMatch>(
			`/v1/review/matches/${matchId}/resolve`,
			body ?? {},
			{ params: { resolution_status } },
		);
		return response.data;
	}
}

// Type definitions
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
	customer_reference: string;
	customer_name: string;
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

// Create singleton instance
export const apiClient = new ApiClient();
