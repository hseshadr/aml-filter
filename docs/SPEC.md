# AML-Filter v2 Platform Specification

## Version
v2.0.0 - Python Migration

## Table of Contents
1. [Vision & Positioning](#vision--positioning)
2. [Architecture Overview](#architecture-overview)
3. [Technology Stack](#technology-stack)
4. [Data Model](#data-model)
5. [Core Interfaces & Abstractions](#core-interfaces--abstractions)
6. [API Specification](#api-specification)
7. [Search & Scoring Engine](#search--scoring-engine)
8. [Multi-Tenancy](#multi-tenancy)
9. [Security & Compliance](#security--compliance)
10. [Implementation Phases](#implementation-phases)
11. [Code Quality Standards](#code-quality-standards)

---

## Vision & Positioning

AML-Filter v2 is a Python-first, open-source AML screening engine that combines:
- Classical sanctions screening (OFAC, EU, UN, UK)
- Modern vector embeddings for semantic matching
- Hybrid relevance scoring (vector + lexical + rules)
- First-class explainability
- Multi-tenant isolation
- Affordable SaaS deployment

**Design Goals:**
- Replace brittle exact-match AML systems
- Dramatically reduce false positives through semantic understanding
- Be affordable for startups and global SMBs
- Enable low-cost hosted SaaS without vendor lock-in
- Single datastore (Postgres) to reduce complexity and cost

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        Client Layer                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Web UI     │  │   API Client │  │  Batch Jobs  │      │
│  │  (React)     │  │  (REST/JSON) │  │  (Async)     │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────┴────────────────────────────────────────┐
│                      API Layer (FastAPI)                     │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  /v1/screen     /v1/batch    /v1/lists             │   │
│  │  /v1/audit     /v1/weights  /v1/tenants            │   │
│  └─────────────────────────────────────────────────────┘   │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────┴────────────────────────────────────────┐
│                   Core Service Layer                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Search     │  │   Scoring    │  │  Ingest      │      │
│  │   Engine     │  │   Engine     │  │  Pipeline    │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  Embedding   │  │  Normalize   │  │  Audit       │      │
│  │  Service     │  │  Service     │  │  Service     │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└────────────────────┬────────────────────────────────────────┘
                     │
        ┌────────────┴────────────┐
        │                         │
┌───────┴────────┐      ┌─────────┴─────────┐
│   Postgres     │      │    Background     │
│   + pgvector   │      │    Worker (RQ)    │
│   + pg_trgm    │      │                   │
└────────────────┘      └───────────────────┘
```

### Key Components

1. **API Layer**: FastAPI REST endpoints, request validation, authentication
2. **Search Engine**: Hybrid retrieval (vector + lexical), candidate generation
3. **Scoring Engine**: Weighted signal combination, explainability
4. **Ingest Pipeline**: List parsing (OFAC/EU/UN/UK), normalization, embedding
5. **Embedding Service**: Pluggable providers (OpenAI, Gemini, local models)
6. **Audit Service**: Immutable logging, compliance reporting
7. **Worker Service**: Background jobs for batch processing, list ingestion

---

## Technology Stack

### Core
- **Language**: Python 3.13+
- **API Framework**: FastAPI 0.104+
- **Validation**: Pydantic v2
- **Database**: PostgreSQL 15+
- **Vector Extension**: pgvector (with HNSW indexing)
- **Fuzzy Text**: pg_trgm extension

### Async/Jobs
- **Job Queue**: RQ (Redis Queue) - simple, fast, Python-native
- **Cache/Queue Store**: Valkey (Redis fork) or Redis 7+

### Embeddings
- **Providers**: Pluggable interface
  - OpenAI (text-embedding-3-small/large)
  - Google Gemini (embedding-001)
  - Local: sentence-transformers (all-MiniLM-L6-v2, multilingual)

### Testing
- **Framework**: pytest
- **Type Checking**: mypy
- **Linting**: Ruff
- **Coverage**: pytest-cov

### Infrastructure
- **Deployment**: Docker + docker-compose
- **SaaS Hosting**: Render.com compatible
- **UI**: React + TypeScript (separate repository/package)

---

## Data Model

### Core Entities

#### Tenant
Represents a company/organization using AML-Filter.

```python
{
  "tenant_id": "acme",  # Primary key, URL-safe
  "name": "Acme Fintech Inc.",
  "plan": "starter" | "professional" | "enterprise",
  "created_at": "2025-01-15T10:00:00Z",
  "updated_at": "2025-01-15T10:00:00Z",
  "metadata": {
    "contact_email": "admin@acme.com",
    "billing_email": "billing@acme.com"
  }
}
```

#### Entity (Canonical Model)
All screened entities normalize into this schema.

```python
{
  "entity_id": "ofac:sdn:12345",  # Global unique ID
  "entity_type": "PERSON" | "ORGANIZATION",
  "primary_name": "MOHAMMED ALI",
  "name_canonical": "mohammed ali",  # Normalized
  "name_tokens": ["mohammed", "ali"],  # Tokenized
  "name_trigram": "mohammed ali",  # For pg_trgm
  "aliases": [
    {
      "name": "MUHAMMAD ALI",
      "name_canonical": "muhammad ali",
      "source": "OFAC"
    }
  ],
  "dob": ["1985-02-10"],  # List of dates
  "countries": ["PK"],  # ISO 3166-1 alpha-2
  "nationalities": ["PK"],
  "addresses": ["Karachi, Pakistan"],
  "identifiers": {
    "passport": ["AB123456"],
    "national_id": ["12345-67890"]
  },
  "risk_category": "SANCTION" | "PEP" | "CUSTOM",
  "source_list": "OFAC_SDN" | "EU_SANCTIONS" | "UN_SC" | "UK_HMT" | "CUSTOM",
  "list_version": "2025-12-28",  # Date or semantic version
  "tenant_id": null,  # null for global lists, set for custom lists
  "custom_list_id": null,  # null for global, set for tenant custom
  "raw_source": {...},  # Original parsed data (JSONB)
  "created_at": "2025-01-15T10:00:00Z",
  "updated_at": "2025-01-15T10:00:00Z"
}
```

#### EntityEmbedding
Stores vector embeddings for entities.

```python
{
  "entity_id": "ofac:sdn:12345",
  "embedding": [0.123, -0.456, ...],  # pgvector vector(384)
  "embedding_model": "all-MiniLM-L6-v2",
  "model_version": "v1.0",
  "created_at": "2025-01-15T10:00:00Z"
}
```

#### ListVersion
Tracks versions of ingested lists.

```python
{
  "list_id": "ofac_sdn",
  "version": "2025-12-28",
  "source_url": "https://...",
  "entity_count": 15000,
  "ingested_at": "2025-01-15T10:00:00Z",
  "activated_at": "2025-01-15T11:00:00Z",
  "status": "ACTIVE" | "PENDING" | "ARCHIVED"
}
```

#### TenantListConfig
Tenant-specific list enablement.

```python
{
  "tenant_id": "acme",
  "list_id": "ofac_sdn",
  "enabled": true,
  "version_override": null,  # null = use latest active
  "updated_at": "2025-01-15T10:00:00Z"
}
```

#### ScoringPolicy
Versioned scoring weights.

```python
{
  "policy_id": "acme-default-v1",
  "tenant_id": "acme",
  "name": "Balanced",
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
```

#### SearchRequest (Audit)
Immutable audit record of every screening.

```python
{
  "request_id": "req_abc123",
  "tenant_id": "acme",
  "user_id": "user_xyz",  # Optional
  "request_hash": "sha256:...",  # Hash of inputs
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
  "matches": [
    {
      "entity_id": "ofac:sdn:12345",
      "score": 0.87,
      "reasons": [...]
    }
  ],
  "created_at": "2025-01-15T10:00:00Z",
  "execution_time_ms": 145
}
```

#### UsageMeter
Tracks tenant usage for billing.

```python
{
  "usage_id": "usage_123",
  "tenant_id": "acme",
  "event_type": "screen" | "batch_row" | "embed" | "monitor_run",
  "units": 1,
  "request_id": "req_abc123",
  "created_at": "2025-01-15T10:00:00Z"
}
```

---

## Core Interfaces & Abstractions

### EmbeddingProvider (Protocol)

```python
from typing import Protocol, List
import numpy as np

class EmbeddingProvider(Protocol):
    """Pluggable embedding provider interface."""
    
    model_name: str
    model_version: str
    dimension: int
    
    async def embed_texts(self, texts: List[str]) -> np.ndarray:
        """
        Embed a batch of texts.
        Returns: (n_texts, dimension) numpy array
        """
        ...
    
    async def embed_text(self, text: str) -> np.ndarray:
        """Embed a single text."""
        ...
```

### SearchBackend (Protocol)

```python
from typing import Protocol, List, Optional
import numpy as np
from ..domain import Entity, SearchFilters

class SearchBackend(Protocol):
    """Search backend interface for hybrid retrieval."""
    
    async def vector_search(
        self,
        tenant_id: Optional[str],
        embedding: np.ndarray,
        k: int,
        filters: Optional[SearchFilters] = None
    ) -> List[tuple[Entity, float]]:
        """
        Vector similarity search using HNSW.
        Returns: List of (Entity, cosine_similarity) tuples
        """
        ...
    
    async def lexical_search(
        self,
        tenant_id: Optional[str],
        query_text: str,
        k: int,
        filters: Optional[SearchFilters] = None
    ) -> List[tuple[Entity, float]]:
        """
        Lexical fuzzy search using pg_trgm.
        Returns: List of (Entity, similarity_score) tuples
        """
        ...
```

### ScoringPolicy (Protocol)

```python
from typing import Protocol, Dict, Any
from ..domain import Entity, SearchQuery, MatchExplanation

class ScoringPolicy(Protocol):
    """Scoring policy interface."""
    
    policy_id: str
    weights: Dict[str, float]
    threshold: float
    
    def score(
        self,
        candidate: Entity,
        query: SearchQuery,
        vector_sim: float,
        lexical_sim: float
    ) -> tuple[float, MatchExplanation]:
        """
        Score a candidate entity.
        Returns: (final_score, explanation_dict)
        """
        ...
```

### ListProvider (Protocol)

```python
from typing import Protocol, List
from ..domain import ListVersion, TenantListConfig

class ListProvider(Protocol):
    """List management interface."""
    
    async def get_enabled_lists(
        self,
        tenant_id: str
    ) -> List[TenantListConfig]:
        """Get all enabled lists for a tenant."""
        ...
    
    async def get_active_versions(
        self,
        list_ids: List[str]
    ) -> Dict[str, str]:
        """Get active version for each list."""
        ...
```

---

## API Specification

### Base URL
- Development: `http://localhost:8000`
- Production: `https://api.amlfilter.io`

### Authentication
- API Key in header: `X-API-Key: {tenant_api_key}`
- JWT tokens (SaaS mode): `Authorization: Bearer {token}`

### Endpoints

#### POST /v1/screen
Screen a single entity.

**Request:**
```json
{
  "name": "Mohammed Ali",
  "dob": "1985-02-10",
  "country": "PK",
  "entity_type": "PERSON",
  "threshold": 0.65,
  "k": 20,
  "lists": ["ofac_sdn", "eu_sanctions"],  // Optional: filter to specific lists
  "policy_id": null  // Optional: override default policy
}
```

**Response:**
```json
{
  "request_id": "req_abc123",
  "matches": [
    {
      "entity_id": "ofac:sdn:12345",
      "score": 0.87,
      "risk_category": "SANCTION",
      "source_list": "OFAC_SDN",
      "list_version": "2025-12-28",
      "reasons": [
        {
          "signal": "name_vector",
          "value": 0.92,
          "description": "Strong semantic name similarity"
        },
        {
          "signal": "alias",
          "value": "MUHAMMAD ALI",
          "description": "Matched alias"
        },
        {
          "signal": "country_match",
          "value": "PK",
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
}
```

#### POST /v1/batch
Batch screen multiple entities (async).

**Request:**
```json
{
  "records": [
    {
      "id": "record_1",
      "name": "Mohammed Ali",
      "dob": "1985-02-10",
      "country": "PK"
    }
  ],
  "threshold": 0.65,
  "policy_id": null
}
```

**Response:**
```json
{
  "job_id": "job_xyz789",
  "status": "queued",
  "estimated_completion": "2025-01-15T10:05:00Z"
}
```

#### GET /v1/batch/{job_id}
Get batch job status and results.

**Response:**
```json
{
  "job_id": "job_xyz789",
  "status": "completed",
  "total_records": 1000,
  "processed": 1000,
  "matches_found": 5,
  "results_url": "/v1/batch/job_xyz789/results",
  "created_at": "2025-01-15T10:00:00Z",
  "completed_at": "2025-01-15T10:05:00Z"
}
```

#### GET /v1/audit/{request_id}
Get audit record for a screening request.

**Response:**
```json
{
  "request_id": "req_abc123",
  "tenant_id": "acme",
  "query": {...},
  "matches": [...],
  "list_versions_used": {...},
  "created_at": "2025-01-15T10:00:00Z"
}
```

#### GET /v1/lists
Get available lists and tenant configuration.

**Response:**
```json
{
  "global_lists": [
    {
      "list_id": "ofac_sdn",
      "name": "OFAC SDN",
      "active_version": "2025-12-28",
      "enabled": true,
      "entity_count": 15000
    }
  ],
  "custom_lists": [
    {
      "list_id": "acme-watchlist-v1",
      "name": "Acme Watchlist",
      "version": "v1",
      "entity_count": 250
    }
  ]
}
```

#### POST /v1/lists/custom/upload
Upload a custom list (CSV/JSON).

**Request:** multipart/form-data
- `file`: CSV or JSON file
- `list_name`: Name for the list
- `field_mapping`: JSON mapping of fields

**Response:**
```json
{
  "list_id": "acme-watchlist-v2",
  "status": "validating",
  "preview": {
    "total_rows": 250,
    "valid_rows": 248,
    "errors": [...]
  }
}
```

#### GET /v1/weights
Get current scoring policy.

**Response:**
```json
{
  "policy_id": "acme-default-v1",
  "name": "Balanced",
  "weights": {
    "name_vector": 0.55,
    "name_trigram": 0.20,
    "alias_match": 0.10,
    "dob_match": 0.10,
    "country_match": 0.05
  },
  "threshold": 0.65,
  "preset": "balanced"
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
  "preset": "strict"
}
```

#### GET /v1/usage
Get tenant usage metrics.

**Response:**
```json
{
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
    "batch_units": 50000
  },
  "remaining": {
    "screen_units": 8500,
    "batch_units": 45000
  }
}
```

---

## Search & Scoring Engine

### Hybrid Retrieval Strategy

#### Step 1: Candidate Generation (Parallel)

1. **Vector Search (HNSW)**
   - Query embedding: `embed(query.name + " " + query.country)`
   - Search with `ef_search=100` (tunable)
   - Filter by `tenant_id`, `risk_category`, `source_list` (post-filter)
   - Return top K (default: 50) candidates

2. **Lexical Search (pg_trgm)**
   - Query: normalized canonical name
   - Use `similarity(name_trigram, query)` function
   - Same filters as vector search
   - Return top K (default: 50) candidates

3. **Union & Deduplication**
   - Merge results by `entity_id`
   - Keep max score per entity
   - Final candidate set: up to 100 unique entities

#### Step 2: Scoring

For each candidate, compute signals:

1. **name_vec_sim**: Cosine similarity from vector search (0-1)
2. **name_trgm_sim**: pg_trgm similarity score (0-1)
3. **alias_match**: Binary boost (0 or 0.1) if any alias matches query name
4. **dob_match**: 
   - Exact match: 1.0
   - Year match: 0.5
   - No match: 0.0
5. **country_match**: Jaccard similarity of country sets (0-1)
6. **entity_type_match**: Binary (0 or 1)

**Weighted Score Formula:**
```
score = 
  weights.name_vector * name_vec_sim +
  weights.name_trigram * name_trgm_sim +
  weights.alias_match * alias_boost +
  weights.dob_match * dob_score +
  weights.country_match * country_score
```

Normalize to 0-1 range.

#### Step 3: Filtering & Ranking

1. Filter candidates below `threshold`
2. Sort by score (descending)
3. Return top K (request parameter)

#### Step 4: Explainability

For each match, generate explanation:

```python
{
  "signals": [
    {"name": "name_vector", "value": 0.92, "weight": 0.55, "contribution": 0.506},
    {"name": "name_trigram", "value": 0.85, "weight": 0.20, "contribution": 0.170},
    {"name": "alias", "value": "MUHAMMAD ALI", "weight": 0.10, "contribution": 0.100},
    {"name": "country_match", "value": 1.0, "weight": 0.05, "contribution": 0.050}
  ],
  "total_score": 0.826,
  "summary": "High confidence match due to strong name similarity..."
}
```

### Name Normalization Pipeline

Applied consistently to stored entities and incoming queries:

1. **Unicode Normalization**: NFKD decomposition
2. **Strip Punctuation**: Remove special chars except spaces
3. **Case Normalization**: Convert to lowercase
4. **Title Removal**: Strip Mr/Mrs/Dr/Prof/etc.
5. **Whitespace Canonicalization**: Multiple spaces → single space, trim
6. **Optional Transliteration**: Arabic, Cyrillic to Latin (future)

**Stored Fields:**
- `name_canonical`: Fully normalized string
- `name_tokens`: List of tokenized words
- `name_trigram`: String for pg_trgm indexing

### HNSW Index Configuration

**Default Parameters:**
- `m = 32`: Number of bi-directional links per node
- `ef_construction = 200`: Size of candidate set during construction
- `ef_search = 100`: Size of candidate set during search (tunable per query)

**Index Creation:**
```sql
CREATE INDEX ON entity_embeddings 
USING hnsw (embedding vector_cosine_ops)
WITH (m = 32, ef_construction = 200);
```

**Performance Targets:**
- Query latency: < 100ms (p95)
- Recall@20: > 0.95
- Index build time: < 30min for 100K entities

---

## Multi-Tenancy

### Tenant Isolation Strategy

**OSS Mode (Default):**
- Application-level filtering: all queries include `WHERE tenant_id = ?`
- No database-level enforcement (for simplicity)
- Single database instance

**SaaS Mode (Production):**
- PostgreSQL Row Level Security (RLS)
- Policies enforce tenant_id from `current_setting('app.tenant_id')`
- Separate schema per tenant (optional, for extreme isolation)

### Tenant Context

All API requests derive tenant from:
1. API key lookup → tenant_id
2. JWT token claim → tenant_id
3. Never trust tenant_id from request payload

### Custom Lists

- Stored with `tenant_id` set
- Queried only for owning tenant
- Versioned independently per tenant
- Can be activated/deactivated per tenant

---

## Security & Compliance

### Authentication & Authorization

- **API Keys**: Per-tenant, can be rotated
- **JWT Tokens**: For SaaS UI (OAuth2/OIDC)
- **Rate Limiting**: Per API key, configurable limits
- **IP Whitelisting**: Optional, enterprise plans

### PII Handling

- **Input Redaction**: Configurable PII redaction in logs
- **Encryption at Rest**: Managed Postgres encryption (AWS RDS, etc.)
- **Encryption in Transit**: TLS 1.3 required
- **Retention Policies**: Configurable per plan

### Audit Trail

Every screening creates immutable audit record:
- Request hash (SHA-256 of inputs)
- List versions used
- Scoring policy version
- Results returned
- User decisions (TP/FP) + reviewer identity
- Retention: 7 years (configurable)

### Abuse Prevention

- **Rate Limits**: Per API key (e.g., 1000 req/min)
- **File Upload Limits**: Max 100MB, max 100K rows
- **Query Throttling**: Detect excessive queries, back off
- **Malware Scanning**: Scan uploaded files (optional)

---

## Implementation Phases

### Phase 1: OSS Core + API (2-4 weeks)
**Goal**: Working screening engine with Postgres + pgvector

**Deliverables:**
- [ ] Project structure with clean module separation
- [ ] Postgres schema + migrations (Alembic)
- [ ] Core domain models (Entity, Tenant, etc.)
- [ ] Name normalization pipeline
- [ ] Embedding service (sentence-transformers local first)
- [ ] Hybrid search backend (pgvector + pg_trgm)
- [ ] Scoring engine with explainability
- [ ] `/v1/screen` endpoint
- [ ] Basic audit logging
- [ ] Docker compose setup
- [ ] Unit tests (90%+ coverage - compliance requirement)

**Interfaces Created:**
- `EmbeddingProvider`
- `SearchBackend`
- `ScoringPolicy`
- `AuditLogger`

**Tech Stack:**
- FastAPI, Pydantic v2
- SQLAlchemy 2.0 (async)
- pgvector, pg_trgm
- pytest, mypy, ruff

### Phase 2: SaaS Tenant Core (2-3 weeks)
**Goal**: Multi-tenant isolation + API keys + usage metering

**Deliverables:**
- [ ] Tenant management (CRUD)
- [ ] API key generation + rotation
- [ ] Row Level Security (RLS) policies
- [ ] Tenant context middleware
- [ ] Usage metering service
- [ ] Tenant list configuration
- [ ] Basic rate limiting
- [ ] `/v1/tenants`, `/v1/usage` endpoints

### Phase 3: Dashboard MVP (3-5 weeks)
**Goal**: Web UI for interactive search + results review

**Deliverables:**
- [ ] React + TypeScript frontend
- [ ] Authentication (JWT)
- [ ] Google-style search UI
- [ ] Results list with filters
- [ ] Match detail page with explainability
- [ ] List management UI (enable/disable)
- [ ] Basic exports (CSV/JSON)
- [ ] Usage/billing page (read-only)

**Tech Stack:**
- React 18+, TypeScript
- Vite (build tool)
- MUI or shadcn/ui (components)
- React Query (data fetching)

### Phase 4: Weights + Presets + Governance (3-4 weeks)
**Goal**: Configurable scoring + policy versioning

**Deliverables:**
- [ ] Scoring policy CRUD
- [ ] Preset weights (Strict/Balanced/Lenient)
- [ ] Policy versioning + rollback
- [ ] Policy audit trail
- [ ] `/v1/weights` endpoints
- [ ] UI for weight configuration
- [ ] A/B evaluation harness (optional)

### Phase 5: Workflows + Monitoring + Reports (4-8 weeks)
**Goal**: Batch processing + scheduled screening + reporting

**Deliverables:**
- [ ] Batch screening job queue (RQ)
- [ ] `/v1/batch` endpoints
- [ ] Onboarding wizard (UI)
- [ ] Scheduled monitoring jobs
- [ ] Alerting (email/webhooks)
- [ ] PDF report generation
- [ ] Case management (TP/FP decisions)
- [ ] Worker service deployment

### Phase 6: Enterprise/Scale Enhancements (later)
**Optional enhancements:**
- [ ] Reranking model (cross-encoder)
- [ ] Additional lists (custom parsers)
- [ ] SSO/SAML integration
- [ ] SOC2 controls
- [ ] OpenSearch backend option
- [ ] GraphQL API
- [ ] Webhook notifications

---

## Code Quality Standards

### Structure
```
aml_filter/
  __init__.py
  domain/              # Pydantic models, value objects
    __init__.py
    entity.py
    tenant.py
    search.py
    scoring.py
  ingest/              # List parsers, normalizers
    __init__.py
    parsers/
      ofac.py
      eu.py
      un.py
      uk.py
    normalizer.py
  embedding/           # Embedding providers
    __init__.py
    providers/
      openai.py
      sentence_transformers.py
      base.py
  search/              # Search backends
    __init__.py
    pgvector_backend.py
    lexical_backend.py
    hybrid.py
  scoring/             # Scoring policies
    __init__.py
    policy.py
    presets.py
  api/                 # FastAPI routers
    __init__.py
    v1/
      screen.py
      batch.py
      lists.py
      weights.py
      audit.py
      usage.py
    middleware.py
  worker/              # Background jobs
    __init__.py
    tasks.py
    batch_processor.py
  security/            # Auth, RLS, rate limiting
    __init__.py
    auth.py
    rls.py
    rate_limit.py
  audit/               # Audit logging
    __init__.py
    logger.py
    reports.py
  usage/               # Metering
    __init__.py
    meter.py
  db/                  # Database setup
    __init__.py
    models.py          # SQLAlchemy models
    migrations/        # Alembic migrations
    session.py
tests/
  unit/
  integration/
  fixtures/
docs/
docker/
  Dockerfile.api
  Dockerfile.worker
  docker-compose.yml
```

### Code Standards

1. **Type Hints**: Required everywhere (enforced by mypy)
2. **Pydantic Models**: All API boundaries use Pydantic v2
3. **Async/Await**: Use async SQLAlchemy, async HTTP clients
4. **Error Handling**: Structured exceptions, proper HTTP status codes
5. **Logging**: Structured logging (JSON in production)
6. **Testing**: 
   - Unit tests: 90%+ coverage (minimum for compliance)
   - Integration tests: Critical paths
   - Type checking: `mypy --strict`
   - Linting: `ruff check`
7. **Dependencies**: All dependencies managed in `pyproject.toml` (using uv)
8. **Documentation**: Docstrings for all public functions/classes

### Example Code Style

```python
from typing import List, Optional
from pydantic import BaseModel, Field
import asyncpg

class SearchQuery(BaseModel):
    """Query for entity screening."""
    name: str = Field(..., min_length=1, max_length=500)
    dob: Optional[str] = Field(None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    country: Optional[str] = Field(None, min_length=2, max_length=2)
    entity_type: Optional[str] = Field(None, pattern="^(PERSON|ORGANIZATION)$")
    threshold: float = Field(0.65, ge=0.0, le=1.0)
    k: int = Field(20, ge=1, le=100)

async def search_entities(
    query: SearchQuery,
    tenant_id: str,
    backend: SearchBackend
) -> List[Match]:
    """
    Search for matching entities using hybrid retrieval.
    
    Args:
        query: Search query parameters
        tenant_id: Tenant identifier for isolation
        backend: Search backend implementation
        
    Returns:
        List of matches sorted by score (descending)
    """
    # Implementation...
```

---

## Database Schema (PostgreSQL)

### Core Tables

```sql
-- Tenants
CREATE TABLE tenants (
    tenant_id VARCHAR(100) PRIMARY KEY,
    name VARCHAR(500) NOT NULL,
    plan VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB
);

-- Entities (global + tenant custom)
CREATE TABLE entities (
    entity_id VARCHAR(500) PRIMARY KEY,
    tenant_id VARCHAR(100),  -- NULL for global, set for custom
    entity_type VARCHAR(20) NOT NULL,
    primary_name VARCHAR(500) NOT NULL,
    name_canonical VARCHAR(500) NOT NULL,
    name_tokens TEXT[],
    name_trigram VARCHAR(500),
    aliases JSONB,  -- Array of {name, name_canonical, source}
    dob DATE[],
    countries VARCHAR(2)[],
    nationalities VARCHAR(2)[],
    addresses TEXT[],
    identifiers JSONB,
    risk_category VARCHAR(20) NOT NULL,
    source_list VARCHAR(100) NOT NULL,
    list_version VARCHAR(50) NOT NULL,
    custom_list_id VARCHAR(200),  -- NULL for global
    raw_source JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_entities_tenant ON entities(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX idx_entities_source_list ON entities(source_list, list_version);
CREATE INDEX idx_entities_name_trigram ON entities USING gin(name_trigram gin_trgm_ops);

-- Entity Embeddings
CREATE TABLE entity_embeddings (
    entity_id VARCHAR(500) PRIMARY KEY REFERENCES entities(entity_id) ON DELETE CASCADE,
    embedding vector(384),  -- Default: 384 for all-MiniLM-L6-v2 (adjust per model)
    embedding_model VARCHAR(100) NOT NULL,
    model_version VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_entity_embeddings_hnsw ON entity_embeddings 
USING hnsw (embedding vector_cosine_ops)
WITH (m = 32, ef_construction = 200);

-- List Versions
CREATE TABLE list_versions (
    list_id VARCHAR(100) NOT NULL,
    version VARCHAR(50) NOT NULL,
    source_url TEXT,
    entity_count INTEGER,
    ingested_at TIMESTAMPTZ NOT NULL,
    activated_at TIMESTAMPTZ,
    status VARCHAR(20) NOT NULL,
    PRIMARY KEY (list_id, version)
);

-- Tenant List Configuration
CREATE TABLE tenant_list_configs (
    tenant_id VARCHAR(100) NOT NULL,
    list_id VARCHAR(100) NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    version_override VARCHAR(50),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, list_id),
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id)
);

-- Scoring Policies
CREATE TABLE scoring_policies (
    policy_id VARCHAR(200) PRIMARY KEY,
    tenant_id VARCHAR(100) NOT NULL,
    name VARCHAR(200) NOT NULL,
    weights JSONB NOT NULL,
    threshold NUMERIC(3,2) NOT NULL,
    version INTEGER NOT NULL,
    preset VARCHAR(50),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by VARCHAR(200),
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id)
);

-- Search Requests (Audit)
CREATE TABLE search_requests (
    request_id VARCHAR(200) PRIMARY KEY,
    tenant_id VARCHAR(100) NOT NULL,
    user_id VARCHAR(200),
    request_hash VARCHAR(64) NOT NULL,
    query JSONB NOT NULL,
    policy_version INTEGER,
    list_versions_used JSONB NOT NULL,
    matches JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    execution_time_ms INTEGER,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id)
);

CREATE INDEX idx_search_requests_tenant ON search_requests(tenant_id, created_at);

-- Usage Metering
CREATE TABLE usage_meters (
    usage_id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(100) NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    units INTEGER NOT NULL,
    request_id VARCHAR(200),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id)
);

CREATE INDEX idx_usage_meters_tenant ON usage_meters(tenant_id, created_at);

-- API Keys
CREATE TABLE api_keys (
    key_id VARCHAR(200) PRIMARY KEY,
    tenant_id VARCHAR(100) NOT NULL,
    key_hash VARCHAR(255) NOT NULL,  -- bcrypt hash
    name VARCHAR(200),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id)
);

CREATE INDEX idx_api_keys_hash ON api_keys(key_hash) WHERE revoked_at IS NULL;
```

### Row Level Security (SaaS Mode)

```sql
-- Enable RLS
ALTER TABLE entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_list_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE scoring_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_requests ENABLE ROW LEVEL SECURITY;

-- Policy: Entities (custom lists only)
CREATE POLICY tenant_entities_isolation ON entities
    FOR ALL
    USING (
        tenant_id IS NULL OR  -- Global entities visible to all
        tenant_id = current_setting('app.tenant_id')::VARCHAR
    );

-- Policy: Tenant configs
CREATE POLICY tenant_configs_isolation ON tenant_list_configs
    FOR ALL
    USING (tenant_id = current_setting('app.tenant_id')::VARCHAR);

-- Similar policies for other tenant-scoped tables...
```

---

## Next Steps

1. **Review this spec** - Validate architecture, API design, phases
2. **Refine phases** - Adjust timelines, add/remove features per priorities
3. **Generate OpenAPI spec** - Formal API contract
4. **Create DB migration** - Alembic setup with initial schema
5. **Start Phase 1** - Begin implementation with core domain models

---

## Appendix

### Preset Scoring Weights

**Strict (Low False Negatives):**
```json
{
  "name_vector": 0.50,
  "name_trigram": 0.25,
  "alias_match": 0.15,
  "dob_match": 0.05,
  "country_match": 0.05,
  "threshold": 0.60
}
```

**Balanced (Default):**
```json
{
  "name_vector": 0.55,
  "name_trigram": 0.20,
  "alias_match": 0.10,
  "dob_match": 0.10,
  "country_match": 0.05,
  "threshold": 0.65
}
```

**Lenient (Low False Positives):**
```json
{
  "name_vector": 0.60,
  "name_trigram": 0.15,
  "alias_match": 0.15,
  "dob_match": 0.05,
  "country_match": 0.05,
  "threshold": 0.75
}
```

### Supported Lists

- **OFAC SDN**: Office of Foreign Assets Control Specially Designated Nationals
- **OFAC Non-SDN**: Additional sanctions lists
- **EU Consolidated Sanctions**: European Union consolidated list
- **UN Security Council**: UNSC sanctions
- **UK HMT**: UK Treasury sanctions
- **PEP**: Politically Exposed Persons (public datasets)
- **Custom**: Tenant-provided lists

---

**Document Version**: 1.0  
**Last Updated**: 2025-01-15  
**Author**: AML-Filter Team

