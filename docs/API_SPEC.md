# AML-Filter v2 API Specification

> **Scope:** this is the reference for the **server, DB-backed** HTTP tier — the
> FastAPI app over PostgreSQL whose front door is `POST /v1/screen`. The newer
> **edge-proc** paths (the `amlfilter` CLI screening a signed bundle, and the
> in-browser `@amlfilter/browser` tier) have **no HTTP surface** and are not
> described here — see [`ARCHITECTURE.md`](ARCHITECTURE.md) for those.

## Base Information

- **Base URL**: `http://localhost:8000/v1` (local dev; deploy behind your own origin)
- **Protocol**: HTTP(S)
- **Content Type**: `application/json`
- **Authentication**: API Key (`X-API-Key` header) or JWT Bearer token

---

## Authentication

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

