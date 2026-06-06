# AML-Filter v2 API Specification

> **Scope:** this is the reference for the **server, DB-backed** HTTP tier — the
> FastAPI app over PostgreSQL whose front door is `POST /v1/screen`. The newer
> **edge-proc** paths (the `amlfilter` CLI screening a signed bundle, and the
> in-browser `@amlfilter/browser` tier) have **no HTTP surface** and are not
> described here — see [`ARCHITECTURE.md`](ARCHITECTURE.md) for those.
>
> **Envelope note:** the original endpoints below (`/screen`, `/batch`, `/lists`,
> `/weights`, `/audit`, `/usage`, `/api-keys`) document a `{success, data, meta}`
> envelope. The **KYC / AML compliance workstation** endpoints (customers, review,
> `/lists/available`, SARs, attestations) added later return their typed Pydantic model
> **directly** (no envelope) and authenticate with `X-API-Key` (tenant-scoped). Each is
> documented with its real shape below.

## Base Information

- **Base URL**: `http://localhost:8000/v1` (local dev; deploy behind your own origin)
- **Protocol**: HTTP(S)
- **Content Type**: `application/json`
- **Authentication**: API Key (`X-API-Key` header) or JWT Bearer token

---

## Authentication

> **Scope:** authentication applies **only** to this DB-backed HTTP tier. `X-API-Key`
> selects the tenant for `POST /v1/screen` and the tenant-scoped admin endpoints. The
> backend-free `/screen` browser demo and the `amlfilter` CLI screen locally and are
> **keyless** — they have no HTTP surface and use no API key.

### API Key Authentication
```http
X-API-Key: ak_live_abc123xyz789
```

### JWT Authentication (SaaS UI)
```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## Common Response Patterns

### Success Response
```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "request_id": "req_abc123",
    "timestamp": "2025-01-15T10:00:00Z"
  }
}
```

### Error Response
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input parameters",
    "details": {
      "field": "name",
      "reason": "Name cannot be empty"
    }
  },
  "meta": {
    "request_id": "req_abc123",
    "timestamp": "2025-01-15T10:00:00Z"
  }
}
```

### Error Codes
- `VALIDATION_ERROR`: Invalid request parameters
- `AUTHENTICATION_ERROR`: Invalid or missing credentials
- `AUTHORIZATION_ERROR`: Insufficient permissions
- `NOT_FOUND`: Resource not found
- `RATE_LIMIT_EXCEEDED`: Too many requests
- `INTERNAL_ERROR`: Server error
- `QUOTA_EXCEEDED`: Usage quota exceeded

---

## Endpoints

### Screen Entities

#### POST /v1/screen
Screen a single entity against enabled lists.

**Request:**
```json
{
  "name": "Mohammed Ali",
  "dob": "1985-02-10",
  "country": "PK",
  "entity_type": "PERSON",
  "threshold": 0.65,
  "k": 20,
  "lists": ["ofac_sdn", "eu_sanctions"],
  "policy_id": null
}
```

**Request Schema:**
- `name` (string, required): Entity name to screen (1-500 chars)
- `dob` (string, optional): Date of birth (YYYY-MM-DD)
- `country` (string, optional): ISO 3166-1 alpha-2 country code
- `entity_type` (string, optional): `PERSON` or `ORGANIZATION`
- `threshold` (float, optional): Minimum score threshold (0.0-1.0, default: 0.65)
- `k` (integer, optional): Maximum number of results (1-100, default: 20)
- `lists` (array, optional): Filter to specific list IDs (default: all enabled)
- `policy_id` (string, optional): Override default scoring policy

**Response:**
```json
{
  "success": true,
  "data": {
    "request_id": "req_abc123",
    "matches": [
      {
        "entity_id": "ofac:sdn:12345",
        "score": 0.87,
        "risk_category": "SANCTION",
        "source_list": "OFAC_SDN",
        "list_version": "2025-12-28",
        "primary_name": "MOHAMMED ALI",
        "aliases": ["MUHAMMAD ALI", "MOHD ALI"],
        "countries": ["PK"],
        "dob": ["1985-02-10"],
        "reasons": [
          {
            "signal": "name_vector",
            "value": 0.92,
            "weight": 0.55,
            "contribution": 0.506,
            "description": "Strong semantic name similarity"
          },
          {
            "signal": "name_trigram",
            "value": 0.85,
            "weight": 0.20,
            "contribution": 0.170,
            "description": "High lexical similarity"
          },
          {
            "signal": "alias",
            "value": "MUHAMMAD ALI",
            "weight": 0.10,
            "contribution": 0.100,
            "description": "Matched alias in entity record"
          },
          {
            "signal": "country_match",
            "value": "PK",
            "weight": 0.05,
            "contribution": 0.050,
            "description": "Country match"
          }
        ],
        "explanation": "High confidence match due to strong name similarity and alias overlap with OFAC SDN entry."
      }
    ],
    "list_versions_used": {
      "ofac_sdn": "2025-12-28",
      "eu_sanctions": "2025-01-10"
    },
    "execution_time_ms": 145
  },
  "meta": {
    "request_id": "req_abc123",
    "timestamp": "2025-01-15T10:00:00Z"
  }
}
```

**Status Codes:**
- `200 OK`: Success
- `400 Bad Request`: Validation error
- `401 Unauthorized`: Authentication error
- `429 Too Many Requests`: Rate limit exceeded
- `500 Internal Server Error`: Server error

---

### Batch Screening

#### POST /v1/batch
Submit a batch screening job (async).

**Request:**
```json
{
  "records": [
    {
      "id": "record_1",
      "name": "Mohammed Ali",
      "dob": "1985-02-10",
      "country": "PK",
      "entity_type": "PERSON"
    },
    {
      "id": "record_2",
      "name": "John Smith",
      "country": "US"
    }
  ],
  "threshold": 0.65,
  "policy_id": null,
  "notify_on_completion": true
}
```

**Request Schema:**
- `records` (array, required): Array of records to screen (max 10,000)
  - `id` (string, optional): Record identifier
  - `name` (string, required): Entity name
  - `dob` (string, optional): Date of birth
  - `country` (string, optional): Country code
  - `entity_type` (string, optional): Entity type
- `threshold` (float, optional): Minimum score threshold
- `policy_id` (string, optional): Scoring policy override
- `notify_on_completion` (boolean, optional): Send notification when complete

**Response:**
```json
{
  "success": true,
  "data": {
    "job_id": "job_xyz789",
    "status": "queued",
    "total_records": 1000,
    "estimated_completion": "2025-01-15T10:05:00Z"
  },
  "meta": {
    "request_id": "req_abc123",
    "timestamp": "2025-01-15T10:00:00Z"
  }
}
```

#### GET /v1/batch/{job_id}
Get batch job status.

**Response:**
```json
{
  "success": true,
  "data": {
    "job_id": "job_xyz789",
    "status": "completed",
    "total_records": 1000,
    "processed": 1000,
    "matches_found": 5,
    "results_url": "/v1/batch/job_xyz789/results",
    "created_at": "2025-01-15T10:00:00Z",
    "started_at": "2025-01-15T10:00:01Z",
    "completed_at": "2025-01-15T10:05:00Z",
    "error": null
  }
}
```

**Status Values:**
- `queued`: Job queued, not started
- `processing`: Job in progress
- `completed`: Job completed successfully
- `failed`: Job failed
- `cancelled`: Job cancelled

#### GET /v1/batch/{job_id}/results
Download batch results.

**Response:**
CSV or JSON format (based on `Accept` header)
```json
{
  "success": true,
  "data": {
    "records": [
      {
        "record_id": "record_1",
        "query": { "name": "Mohammed Ali", ... },
        "matches": [ ... ]
      }
    ]
  }
}
```

---

### Lists Management

#### GET /v1/lists
Get available lists and tenant configuration.

**Response:**
```json
{
  "success": true,
  "data": {
    "global_lists": [
      {
        "list_id": "ofac_sdn",
        "name": "OFAC SDN",
        "description": "Office of Foreign Assets Control Specially Designated Nationals",
        "active_version": "2025-12-28",
        "enabled": true,
        "entity_count": 15000,
        "last_refresh": "2025-01-15T08:00:00Z",
        "source_url": "https://..."
      },
      {
        "list_id": "eu_sanctions",
        "name": "EU Consolidated Sanctions",
        "active_version": "2025-01-10",
        "enabled": true,
        "entity_count": 8000
      }
    ],
    "custom_lists": [
      {
        "list_id": "acme-watchlist-v1",
        "name": "Acme Watchlist",
        "version": "v1",
        "entity_count": 250,
        "created_at": "2025-01-10T10:00:00Z",
        "status": "active"
      }
    ]
  }
}
```

#### PUT /v1/lists/{list_id}/enable
Enable or disable a list for the tenant.

**Request:**
```json
{
  "enabled": true,
  "version_override": null
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "list_id": "ofac_sdn",
    "enabled": true,
    "updated_at": "2025-01-15T10:00:00Z"
  }
}
```

#### POST /v1/lists/custom/upload
Upload a custom list.

**Request:** `multipart/form-data`
- `file` (file, required): CSV or JSON file (max 100MB, max 100K rows)
- `list_name` (string, required): Name for the list
- `field_mapping` (JSON, optional): Field mapping configuration

**Field Mapping Example:**
```json
{
  "name": "full_name",
  "dob": "date_of_birth",
  "country": "country_code",
  "entity_type": "type"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "list_id": "acme-watchlist-v2",
    "status": "validating",
    "preview": {
      "total_rows": 250,
      "valid_rows": 248,
      "errors": [
        {
          "row": 5,
          "field": "dob",
          "error": "Invalid date format"
        }
      ]
    }
  }
}
```

#### GET /v1/lists/custom/{list_id}
Get custom list details.

**Response:**
```json
{
  "success": true,
  "data": {
    "list_id": "acme-watchlist-v1",
    "name": "Acme Watchlist",
    "version": "v1",
    "entity_count": 250,
    "status": "active",
    "created_at": "2025-01-10T10:00:00Z",
    "activated_at": "2025-01-10T11:00:00Z"
  }
}
```

#### POST /v1/lists/custom/{list_id}/activate
Activate a new version of a custom list.

**Request:**
```json
{
  "version": "v2"
}
```

#### POST /v1/lists/custom/{list_id}/rollback
Rollback to a previous version.

**Request:**
```json
{
  "version": "v1"
}
```

---

### Scoring Policies

#### GET /v1/weights
Get current scoring policy.

**Response:**
```json
{
  "success": true,
  "data": {
    "policy_id": "acme-default-v1",
    "name": "Balanced",
    "preset": "balanced",
    "weights": {
      "name_vector": 0.55,
      "name_trigram": 0.20,
      "alias_match": 0.10,
      "dob_match": 0.10,
      "country_match": 0.05
    },
    "threshold": 0.65,
    "version": 1,
    "created_at": "2025-01-15T10:00:00Z",
    "created_by": "system"
  }
}
```

#### PUT /v1/weights
Update scoring policy.

**Request:**
```json
{
  "weights": {
    "name_vector": 0.60,
    "name_trigram": 0.25,
    "alias_match": 0.10,
    "dob_match": 0.05,
    "country_match": 0.00
  },
  "threshold": 0.70,
  "preset": "strict",
  "name": "Strict Policy"
}
```

**Validation Rules:**
- Sum of weights must equal 1.0 (within tolerance)
- All weights must be >= 0.0
- Threshold must be 0.0-1.0

**Response:**
```json
{
  "success": true,
  "data": {
    "policy_id": "acme-default-v2",
    "version": 2,
    "created_at": "2025-01-15T11:00:00Z"
  }
}
```

#### GET /v1/weights/history
Get policy version history.

**Response:**
```json
{
  "success": true,
  "data": {
    "policies": [
      {
        "policy_id": "acme-default-v2",
        "version": 2,
        "name": "Strict Policy",
        "created_at": "2025-01-15T11:00:00Z",
        "created_by": "user@acme.com"
      },
      {
        "policy_id": "acme-default-v1",
        "version": 1,
        "name": "Balanced",
        "created_at": "2025-01-15T10:00:00Z",
        "created_by": "system"
      }
    ]
  }
}
```

#### POST /v1/weights/rollback
Rollback to a previous policy version.

**Request:**
```json
{
  "version": 1
}
```

---

### Audit & Compliance

#### GET /v1/audit/{request_id}
Get audit record for a screening request.

**Response:**
```json
{
  "success": true,
  "data": {
    "request_id": "req_abc123",
    "tenant_id": "acme",
    "user_id": "user_xyz",
    "request_hash": "sha256:abc123...",
    "query": {
      "name": "Mohammed Ali",
      "dob": "1985-02-10",
      "country": "PK",
      "entity_type": "PERSON"
    },
    "policy_version": 1,
    "list_versions_used": {
      "ofac_sdn": "2025-12-28",
      "eu_sanctions": "2025-01-10"
    },
    "matches": [ ... ],
    "created_at": "2025-01-15T10:00:00Z",
    "execution_time_ms": 145
  }
}
```

#### GET /v1/audit
Search audit records (with filters).

**Query Parameters:**
- `start_date` (ISO 8601): Start date
- `end_date` (ISO 8601): End date
- `limit` (integer): Max results (default: 100, max: 1000)
- `offset` (integer): Pagination offset

**Response:**
```json
{
  "success": true,
  "data": {
    "records": [ ... ],
    "total": 1500,
    "limit": 100,
    "offset": 0
  }
}
```

---

### Usage & Billing

#### GET /v1/usage
Get tenant usage metrics.

**Query Parameters:**
- `period` (string): `YYYY-MM` or `YYYY-MM-DD` (default: current month)

**Response:**
```json
{
  "success": true,
  "data": {
    "tenant_id": "acme",
    "period": "2025-01",
    "usage": {
      "screen_units": 1500,
      "batch_units": 5000,
      "embed_units": 0,
      "monitor_units": 120
    },
    "quota": {
      "screen_units": 10000,
      "batch_units": 50000,
      "embed_units": 0,
      "monitor_units": 1000
    },
    "remaining": {
      "screen_units": 8500,
      "batch_units": 45000,
      "embed_units": 0,
      "monitor_units": 880
    },
    "breakdown": {
      "by_day": [
        {
          "date": "2025-01-15",
          "screen_units": 50,
          "batch_units": 200
        }
      ]
    }
  }
}
```

#### GET /v1/tenants/me
Get current tenant information.

**Response:**
```json
{
  "success": true,
  "data": {
    "tenant_id": "acme",
    "name": "Acme Fintech Inc.",
    "plan": "professional",
    "created_at": "2025-01-01T10:00:00Z",
    "metadata": {
      "contact_email": "admin@acme.com"
    }
  }
}
```

---

### API Keys

#### GET /v1/api-keys
List API keys for the tenant.

**Response:**
```json
{
  "success": true,
  "data": {
    "keys": [
      {
        "key_id": "key_abc123",
        "name": "Production Key",
        "created_at": "2025-01-01T10:00:00Z",
        "last_used_at": "2025-01-15T09:00:00Z",
        "expires_at": null
      }
    ]
  }
}
```

#### POST /v1/api-keys
Create a new API key.

**Request:**
```json
{
  "name": "Staging Key",
  "expires_at": "2026-01-15T10:00:00Z"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "key_id": "key_xyz789",
    "api_key": "ak_live_abc123xyz789",
    "name": "Staging Key",
    "created_at": "2025-01-15T10:00:00Z",
    "expires_at": "2026-01-15T10:00:00Z"
  }
}
```

**Note:** API key is only shown once on creation.

#### DELETE /v1/api-keys/{key_id}
Revoke an API key.

---

## KYC / AML Compliance Workstation

> These endpoints layer customer case-management on top of the screening engine. They
> are **DB-path only**, authenticate with `X-API-Key` (tenant-scoped), and return their
> typed model **directly** (no `{success, data, meta}` envelope). This is a **reference
> implementation, not a compliance product** — see [`../NOTICE`](../NOTICE). SAR
> "export" produces a fileable artifact and does **NOT** submit to FinCEN or any
> government system.

### Customers (onboarding)

#### POST /v1/customers
Onboard a customer. Creates and links a screened WHITELIST entity, screens it against
the enabled sanctions lists, and persists any matches.

**Request:**
```json
{
  "customer_reference": "CUST-001",
  "name": "Jon Q. Fakename",
  "onboarded_by": "analyst@acme.com",
  "country": "US",
  "id_documents": [
    { "doc_type": "passport", "number": "X1234567", "issuing_country": "US", "expiry": "2030-01-01" }
  ]
}
```
- `customer_reference` (string, required, 1–200): your stable customer key (unique per tenant).
- `name` (string, required, 1–500): the customer name to screen.
- `onboarded_by` (string, default `"api"`).
- `country` (string, optional, ISO-3166 alpha-2).
- `id_documents` (array, optional): `{doc_type, number, issuing_country, expiry?}`.

**Response `201`** (`OnboardResponse` = the customer plus `match_entity_ids`):
```json
{
  "customer_id": "f47ac10b-...-uuid",
  "tenant_id": "acme",
  "customer_reference": "CUST-001",
  "onboarding_status": "DRAFT",
  "kyc_risk_rating": null,
  "id_documents": [ { "doc_type": "passport", "number": "X1234567", "issuing_country": "US", "expiry": "2030-01-01" } ],
  "onboarded_by": "analyst@acme.com",
  "screening_entity_id": "wl:acme:CUST-001",
  "created_at": "2026-06-06T10:00:00Z",
  "updated_at": "2026-06-06T10:00:00Z",
  "match_entity_ids": ["ofac:sdn:12345"]
}
```
`onboarding_status` ∈ `DRAFT | PENDING_REVIEW | ACTIVE | REJECTED`;
`kyc_risk_rating` ∈ `LOW | MEDIUM | HIGH | null`.

#### GET /v1/customers
List the tenant's customers, newest first. Query: `limit` (1–1000, default 100),
`offset` (≥0). Returns an array of `CustomerResponse` (the object above without
`match_entity_ids`).

#### GET /v1/customers/{customer_id}
Get one customer (`CustomerResponse`). `404` if not found/owned.

#### PUT /v1/customers/{customer_id}
Update lifecycle fields. Body (all optional): `onboarding_status`, `kyc_risk_rating`,
`customer_reference`. Returns the updated `CustomerResponse`.

#### DELETE /v1/customers/{customer_id}
Delete a customer. `204 No Content`.

---

### Review Board (tiered matches)

#### GET /v1/review/matches
List tiered matches for review, highest score first. Each row joins the match to its
customer and the matched sanctions entity.

**Query Parameters:**
- `tier` (optional): `STRONG | POSSIBLE | WEAK`
- `resolution_status` (optional): e.g. `PENDING | FALSE_POSITIVE | TRUE_POSITIVE | RESOLVED`
- `limit` (1–1000, default 100), `offset` (≥0)

**Response** (array of `ReviewMatchRow`):
```json
[
  {
    "match_id": "9b1deb4d-...-uuid",
    "tier": "STRONG",
    "match_score": 0.91,
    "match_type": "WHITELIST_VS_BLACKLIST",
    "resolution_status": null,
    "reviewer_id": null,
    "review_notes": null,
    "detected_at": "2026-06-06T10:00:00Z",
    "customer_id": "f47ac10b-...-uuid",
    "customer_reference": "CUST-001",
    "customer_name": "Jon Q. Fakename",
    "sanctioned_name": "JON FAKENAME",
    "source_list": "OFAC_SDN"
  }
]
```

#### PUT /v1/review/matches/{match_id}/resolve
Resolve a match, recording the reviewer and notes.

**Query Parameter (required):** `resolution_status` ∈ `FALSE_POSITIVE | TRUE_POSITIVE | RESOLVED`

**Request body:**
```json
{ "reviewer_id": "analyst@acme.com", "review_notes": "Confirmed false positive — different DOB." }
```
Both fields optional. **Response:** the updated `ReviewMatchRow`. `404` if not found.

---

### Available Lists

#### GET /v1/lists/available
List every sanctions list with a registered parser (enable one via `PUT /v1/lists/{id}`).

**Response** (array of `AvailableListResponse`):
```json
[
  { "list_id": "OFAC_SDN" },
  { "list_id": "EU_CONSOLIDATED" },
  { "list_id": "UK_OFSI" },
  { "list_id": "UN_CONSOLIDATED" }
]
```

---

### SARs (Suspicious Activity Reports)

> A SAR can only be created for a **STRONG** match — a non-STRONG match fails closed
> with `422`. **Export produces a fileable artifact only; it does not submit to FinCEN.**

#### POST /v1/sars
Create a SAR for a customer's STRONG match.

**Request:**
```json
{
  "customer_id": "f47ac10b-...-uuid",
  "match_id": "9b1deb4d-...-uuid",
  "jurisdiction": "US",
  "template": "FINCEN",
  "narrative": "Customer matched a sanctioned individual; ...",
  "filer": { "name": "Jane Compliance", "institution": "Acme Bank", "contact": "compliance@acme.com" },
  "created_by": "analyst@acme.com"
}
```
- `customer_id`, `match_id` (required, ≤36).
- `jurisdiction` ∈ `US | UK | AU` (default `US`); `template` ∈ `FINCEN` (default).
- `narrative` (optional, ≤20000) — a SAR with a narrative is `COMPLETED` on create,
  otherwise `DRAFT`.
- `filer` (required): `{name, institution, contact}`.
- `created_by` (default `"api"`).

**Response `201`** (`SarRecord`):
```json
{
  "sar_id": "uuid", "tenant_id": "acme",
  "customer_id": "...", "match_id": "...",
  "jurisdiction": "US", "template": "FINCEN",
  "subject": {
    "customer_reference": "CUST-001", "customer_name": "Jon Q. Fakename",
    "customer_dob": [], "customer_identifiers": [],
    "matched_sanctioned_name": "JON FAKENAME", "matched_source_list": "OFAC_SDN",
    "match_score": 0.91, "match_tier": "STRONG"
  },
  "suspicious_activity_narrative": "Customer matched ...",
  "filer": { "name": "Jane Compliance", "institution": "Acme Bank", "contact": "compliance@acme.com" },
  "status": "COMPLETED", "created_by": "analyst@acme.com",
  "created_at": "...", "updated_at": "...", "filed_at": null
}
```
`status` ∈ `DRAFT | COMPLETED | EXPORTED`. The `subject` is an immutable snapshot at
filing time.

#### GET /v1/sars
List the tenant's SARs, newest first. Query: `status` (`DRAFT|COMPLETED|EXPORTED`),
`customer_id`, plus pagination. Array of `SarRecord`.

#### GET /v1/sars/{sar_id}
Get one SAR (`SarRecord`). `404` if not found.

#### PUT /v1/sars/{sar_id}
Edit `narrative` / `filer` / `status` while the SAR is `DRAFT`/`COMPLETED`. Returns the
updated `SarRecord` (`422` on a disallowed transition).

#### GET /v1/sars/{sar_id}/export
Render the SAR and mark it `EXPORTED`, streaming the artifact.
**Query:** `format` ∈ `pdf` (default) `| json`. Returns the rendered FinCEN report
(`application/pdf` or JSON). **This is a fileable report; it is not submitted anywhere.**

---

### Attestations (screening review badges)

> An attestation is a verifiable record that a customer was screened against the enabled
> lists at known versions on a date, with a result. When a signing key is configured it
> is ed25519-signed against the **pinned bundle trust root**, so it is independently
> verifiable.

#### POST /v1/attestations
Generate / refresh a customer's attestation.

**Request:**
```json
{ "customer_id": "f47ac10b-...-uuid", "require_signature": false }
```
`require_signature: true` fails closed (`422`) if no signing key is configured.

**Response `201`** (`AttestationRecord`):
```json
{
  "attestation_id": "uuid", "tenant_id": "acme",
  "customer_id": "...", "customer_reference": "CUST-001",
  "screened_at": "2026-06-06T10:00:00Z",
  "valid_until": "2026-09-04T10:00:00Z",
  "lists_and_versions": [ { "list_id": "OFAC_SDN", "version": "2026-06-01" } ],
  "result": { "status": "CLEAR", "match_count": 0, "pending_count": 0 },
  "signature": "base64-ed25519-or-null",
  "signing_key_id": "default", "algo": "ed25519",
  "created_at": "..."
}
```
`result.status` ∈ `CLEAR | MATCHES_PENDING | MATCHES_DISPOSITIONED`.

#### GET /v1/attestations
List the latest attestation per customer. Query: `customer_id`, `stale` (bool — filter
to due-for-re-review), plus pagination. Array of `AttestationRecord`.

#### GET /v1/attestations/{attestation_id}
Get one attestation (`AttestationRecord`). `404` if not found.

#### GET /v1/attestations/{attestation_id}/verify
Verify the attestation's signature against the pinned trust-root public key.

**Response** (`VerificationResult` — never raises):
```json
{ "valid": true, "reason": "signature valid" }
```

#### GET /v1/attestations/{attestation_id}/export
Render the attestation badge. **Query:** `format` ∈ `pdf` (default) `| json`. Streams
`application/pdf` or JSON.

---

## Rate Limiting

Rate limits are enforced per API key or user. Limits vary by plan:

- **Starter**: 100 requests/minute
- **Professional**: 1000 requests/minute
- **Enterprise**: 10,000 requests/minute

**Rate Limit Headers:**
```http
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 950
X-RateLimit-Reset: 1642248000
```

When rate limit is exceeded:
- **Status Code**: `429 Too Many Requests`
- **Retry-After**: Seconds until limit resets

---

## Pagination

List endpoints support cursor-based pagination:

**Query Parameters:**
- `limit` (integer): Number of results (default: 20, max: 100)
- `cursor` (string): Pagination cursor (from previous response)

**Response:**
```json
{
  "success": true,
  "data": {
    "items": [ ... ],
    "pagination": {
      "next_cursor": "cursor_abc123",
      "has_more": true
    }
  }
}
```

---

## Webhooks (Future)

Webhooks notify tenants of events:
- Batch job completion
- New list version available
- Quota threshold reached
- Monitoring alerts

**Webhook Payload:**
```json
{
  "event": "batch.completed",
  "timestamp": "2025-01-15T10:05:00Z",
  "data": {
    "job_id": "job_xyz789",
    "status": "completed",
    "matches_found": 5
  }
}
```

**Signature Verification:**
Webhook requests include `X-Webhook-Signature` header for verification.

---

## SDKs (Future)

Planned SDKs:
- Python
- Node.js
- Java
- Go

---

**Document Version**: 1.0  
**Last Updated**: 2025-01-15

