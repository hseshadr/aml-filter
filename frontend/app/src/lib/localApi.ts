/**
 * LocalApiClient — the local-first implementation of the FULL ApiClient
 * surface (spec §9.3). The slice methods (customers, review) are real and
 * backed by @amlfilter/workstation; every non-slice method throws a typed
 * NotImplementedError so a stray call fails loudly instead of silently.
 * Pages keep compiling against the same singleton shape: the class
 * `implements Pick<ApiClient, keyof ApiClient>` (the public surface).
 */

import type {
	CustomerRow,
	LocalMatchTracker,
	LocalOnboardingService,
	ReviewRow,
	WorkstationStore,
} from "@amlfilter/workstation";
import type {
	ApiClient,
	ApiKeyCreate,
	ApiKeyCreateResponse,
	ApiKeyResponse,
	AttestationCreateBody,
	AttestationExportFormat,
	AttestationListParams,
	AttestationRecord,
	AttestationVerification,
	AvailableList,
	CustomerListParams,
	CustomerOnboardRequest,
	CustomerOnboardResponse,
	CustomerResponse,
	CustomerUpdateRequest,
	ListConfigResponse,
	ListConfigUpdate,
	MatchResolutionStatus,
	ReviewMatch,
	ReviewMatchListParams,
	ReviewResolutionStatus,
	ReviewResolveBody,
	SarCreateBody,
	SarExportFormat,
	SarListParams,
	SarRecord,
	SarUpdateBody,
	SearchQuery,
	SearchResponse,
	TenantResponse,
	UsageSummaryResponse,
	WhitelistCustomerCreate,
	WhitelistCustomerResponse,
	WhitelistCustomerUpdate,
	WhitelistMatchResponse,
} from "./api";

/** A non-slice method was called in the local-first workstation. */
export class NotImplementedError extends Error {
	public constructor(method: string) {
		super(
			`${method} is not available in the local-first workstation yet — this tier ships with customers + review only`,
		);
		this.name = "NotImplementedError";
	}
}

/** The booted local tier the client runs on (built by lib/workstation.ts). */
export interface WorkstationServices {
	readonly store: WorkstationStore;
	readonly onboarding: LocalOnboardingService;
	readonly tracker: LocalMatchTracker;
}

/** Lazy provider — construction stays side-effect free (no Worker spawn). */
export type WorkstationProvider = () => Promise<WorkstationServices>;

const LOCAL_TENANT = "local";

function toCustomerResponse(row: CustomerRow): CustomerResponse {
	return {
		customer_id: row.customer_id,
		tenant_id: LOCAL_TENANT,
		customer_reference: row.customer_reference,
		onboarding_status: row.onboarding_status,
		kyc_risk_rating: row.kyc_risk_rating,
		id_documents: [...row.id_documents],
		onboarded_by: row.onboarded_by,
		// No WHITELIST Entity rows exist locally (the only entity store is the
		// read-only signed bundle), so there is no screening_entity_id.
		screening_entity_id: null,
		created_at: row.created_at,
		updated_at: row.updated_at,
	};
}

function toReviewMatch(row: ReviewRow): ReviewMatch {
	return {
		match_id: row.match_id,
		tier: row.tier,
		match_score: row.match_score,
		// Constant locally — mirrors the match_type the backend onboarding
		// records (customers/service.py:138).
		match_type: "WHITELIST_VS_BLACKLIST",
		// ResolutionStatus (workstation) and ReviewResolutionStatus (app REST
		// types) are structurally identical unions that must stay in lockstep.
		resolution_status: row.resolution_status,
		reviewer_id: row.reviewer_id,
		review_notes: row.review_notes,
		detected_at: row.detected_at,
		customer_id: row.customer_id,
		customer_reference: row.customer_reference,
		customer_name: row.customer_name,
		sanctioned_name: row.sanctioned_name,
		source_list: row.source_list,
	};
}

export class LocalApiClient implements Pick<ApiClient, keyof ApiClient> {
	readonly #services: WorkstationProvider;

	public constructor(services: WorkstationProvider) {
		this.#services = services;
	}

	// --- auth machinery: removed in the local-first app; kept inert so the
	// surface stays identical (nothing calls these once /login is unrouted) ---
	public setApiKey(_apiKey: string): void {}

	public clearApiKey(): void {}

	// --- slice: KYC customers ------------------------------------------------
	public async onboardCustomer(
		payload: CustomerOnboardRequest,
	): Promise<CustomerOnboardResponse> {
		const { onboarding } = await this.#services();
		const result = await onboarding.onboard({
			customer_reference: payload.customer_reference,
			name: payload.name,
			onboarded_by: payload.onboarded_by,
			country: payload.country ?? null,
			id_documents: payload.id_documents ?? [],
		});
		return {
			...toCustomerResponse(result.customer),
			match_entity_ids: result.matches.map((m) => m.ofac_entity_id),
		};
	}

	public async listCustomers(
		_params?: CustomerListParams,
	): Promise<CustomerResponse[]> {
		const { store } = await this.#services();
		return (await store.listCustomers()).map(toCustomerResponse);
	}

	public async getCustomer(customerId: string): Promise<CustomerResponse> {
		const { store } = await this.#services();
		const row = await store.getCustomer(customerId);
		if (row === null) {
			throw new Error(`Customer ${customerId} not found`);
		}
		return toCustomerResponse(row);
	}

	public async updateCustomer(
		customerId: string,
		payload: CustomerUpdateRequest,
	): Promise<CustomerResponse> {
		const { store } = await this.#services();
		return toCustomerResponse(await store.updateCustomer(customerId, payload));
	}

	public async deleteCustomer(customerId: string): Promise<void> {
		const { store } = await this.#services();
		await store.deleteCustomer(customerId);
	}

	// --- slice: review board ---------------------------------------------------
	public async listReviewMatches(
		params?: ReviewMatchListParams,
	): Promise<ReviewMatch[]> {
		const { store } = await this.#services();
		const rows = await store.listReviewMatches({
			tier: params?.tier,
			resolutionStatus: params?.resolution_status,
			limit: params?.limit,
			offset: params?.offset,
		});
		return rows.map(toReviewMatch);
	}

	public async resolveReviewMatch(
		matchId: string,
		resolution_status: ReviewResolutionStatus,
		body?: ReviewResolveBody,
	): Promise<ReviewMatch> {
		const { tracker } = await this.#services();
		const row = await tracker.resolve(matchId, resolution_status, {
			reviewerId: body?.reviewer_id,
			notes: body?.review_notes,
		});
		return toReviewMatch(row);
	}

	// --- non-slice: typed, loud failure (spec §9.3) ---------------------------
	public async screen(_query: SearchQuery): Promise<SearchResponse> {
		throw new NotImplementedError("screen");
	}

	public async getTenant(_tenantId: string): Promise<TenantResponse> {
		throw new NotImplementedError("getTenant");
	}

	public async createApiKey(
		_data: ApiKeyCreate,
	): Promise<ApiKeyCreateResponse> {
		throw new NotImplementedError("createApiKey");
	}

	public async listApiKeys(): Promise<ApiKeyResponse[]> {
		throw new NotImplementedError("listApiKeys");
	}

	public async revokeApiKey(_keyId: string): Promise<void> {
		throw new NotImplementedError("revokeApiKey");
	}

	public async getUsage(_days?: number): Promise<UsageSummaryResponse> {
		throw new NotImplementedError("getUsage");
	}

	public async listLists(): Promise<ListConfigResponse[]> {
		throw new NotImplementedError("listLists");
	}

	public async getAvailableLists(): Promise<AvailableList[]> {
		throw new NotImplementedError("getAvailableLists");
	}

	public async updateListConfig(
		_listId: string,
		_config: ListConfigUpdate,
	): Promise<ListConfigResponse> {
		throw new NotImplementedError("updateListConfig");
	}

	public async addWhitelistCustomer(
		_customer: WhitelistCustomerCreate,
	): Promise<WhitelistCustomerResponse> {
		throw new NotImplementedError("addWhitelistCustomer");
	}

	public async listWhitelistCustomers(): Promise<WhitelistCustomerResponse[]> {
		throw new NotImplementedError("listWhitelistCustomers");
	}

	public async getWhitelistCustomer(
		_entityId: string,
	): Promise<WhitelistCustomerResponse> {
		throw new NotImplementedError("getWhitelistCustomer");
	}

	public async updateWhitelistCustomer(
		_entityId: string,
		_customer: WhitelistCustomerUpdate,
	): Promise<WhitelistCustomerResponse> {
		throw new NotImplementedError("updateWhitelistCustomer");
	}

	public async deleteWhitelistCustomer(_entityId: string): Promise<void> {
		throw new NotImplementedError("deleteWhitelistCustomer");
	}

	public async getWhitelistMatches(
		_resolution_status?: string,
	): Promise<WhitelistMatchResponse[]> {
		throw new NotImplementedError("getWhitelistMatches");
	}

	public async resolveMatch(
		_matchId: string,
		_resolution_status: MatchResolutionStatus,
	): Promise<WhitelistMatchResponse> {
		throw new NotImplementedError("resolveMatch");
	}

	public async createSar(_payload: SarCreateBody): Promise<SarRecord> {
		throw new NotImplementedError("createSar");
	}

	public async listSars(_params?: SarListParams): Promise<SarRecord[]> {
		throw new NotImplementedError("listSars");
	}

	public async getSar(_sarId: string): Promise<SarRecord> {
		throw new NotImplementedError("getSar");
	}

	public async updateSar(
		_sarId: string,
		_payload: SarUpdateBody,
	): Promise<SarRecord> {
		throw new NotImplementedError("updateSar");
	}

	public async exportSar(
		_sarId: string,
		_format: SarExportFormat,
	): Promise<void> {
		throw new NotImplementedError("exportSar");
	}

	public async generateAttestation(
		_body: AttestationCreateBody,
	): Promise<AttestationRecord> {
		throw new NotImplementedError("generateAttestation");
	}

	public async listAttestations(
		_params: AttestationListParams = {},
	): Promise<AttestationRecord[]> {
		throw new NotImplementedError("listAttestations");
	}

	public async getAttestation(
		_attestationId: string,
	): Promise<AttestationRecord> {
		throw new NotImplementedError("getAttestation");
	}

	public async verifyAttestation(
		_attestationId: string,
	): Promise<AttestationVerification> {
		throw new NotImplementedError("verifyAttestation");
	}

	public async exportAttestation(
		_attestationId: string,
		_format: AttestationExportFormat,
	): Promise<void> {
		throw new NotImplementedError("exportAttestation");
	}
}
