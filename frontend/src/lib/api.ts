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

// Create singleton instance
export const apiClient = new ApiClient();
