# AML-Filter v2 Database Schema

> **Scope:** this schema backs the **server, DB-backed** screening path only. The
> **edge-proc** paths — the `amlfilter` CLI screening a signed bundle and the
> in-browser `@amlfilter/browser` tier — run **without Postgres** (they sync a
> signed, content-addressed bundle into an in-memory entity set + a localvec FAISS
> index). See [`ARCHITECTURE.md`](ARCHITECTURE.md) for how the tiers relate.

## Overview

PostgreSQL 15+ with extensions:
- `pgvector`: Vector similarity search (HNSW)
- `pg_trgm`: Trigram-based fuzzy text search
- `btree_gin`: GIN index support

---

## Schema Diagram

```
┌─────────────┐
│   tenants   │
└──────┬──────┘
       │
       ├──────────────────┬──────────────────┬──────────────────┐
       │                  │                  │                  │
┌──────┴──────┐  ┌────────┴────────┐  ┌─────┴─────┐  ┌────────┴────────┐
│   entities  │  │ tenant_list_    │  │ scoring_  │  │  search_        │
│             │  │    configs      │  │ policies  │  │  requests       │
└──────┬──────┘  └─────────────────┘  └───────────┘  └─────────────────┘
       │
┌──────┴──────┐
│  entity_    │
│  embeddings │
└─────────────┘

┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│ list_       │  │ api_keys    │  │ usage_      │
│ versions    │  │             │  │ meters      │
└─────────────┘  └─────────────┘  └─────────────┘
```

---

## Tables

### tenants

Stores tenant (organization) information.

```sql
CREATE TABLE tenants (
    tenant_id VARCHAR(100) PRIMARY KEY,
    name VARCHAR(500) NOT NULL,
    plan VARCHAR(50) NOT NULL CHECK (plan IN ('starter', 'professional', 'enterprise')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_tenants_plan ON tenants(plan);
```

**Columns:**
- `tenant_id`: Unique identifier (URL-safe, e.g., "acme")
- `name`: Organization name
- `plan`: Subscription plan tier
- `created_at`: Account creation timestamp
- `updated_at`: Last update timestamp
- `metadata`: Additional JSON data (contact emails, etc.)

---

### entities

Canonical entity model for all screened entities (global sanctions + tenant custom lists).

```sql
CREATE TABLE entities (
    entity_id VARCHAR(500) PRIMARY KEY,
    tenant_id VARCHAR(100),  -- NULL for global, set for custom lists
    entity_type VARCHAR(20) NOT NULL CHECK (entity_type IN ('PERSON', 'ORGANIZATION')),
    primary_name VARCHAR(500) NOT NULL,
    name_canonical VARCHAR(500) NOT NULL,
    name_tokens TEXT[],
    name_trigram VARCHAR(500),
    aliases JSONB DEFAULT '[]'::jsonb,
    dob DATE[],
    countries VARCHAR(2)[],
    nationalities VARCHAR(2)[],
    addresses TEXT[],
    identifiers JSONB DEFAULT '{}'::jsonb,
    risk_category VARCHAR(20) NOT NULL CHECK (risk_category IN ('SANCTION', 'PEP', 'CUSTOM')),
    source_list VARCHAR(100) NOT NULL,
    list_version VARCHAR(50) NOT NULL,
    custom_list_id VARCHAR(200),  -- NULL for global lists
    raw_source JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX idx_entities_tenant ON entities(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX idx_entities_source_list ON entities(source_list, list_version);
CREATE INDEX idx_entities_risk_category ON entities(risk_category);
CREATE INDEX idx_entities_name_trigram ON entities USING gin(name_trigram gin_trgm_ops);
CREATE INDEX idx_entities_name_canonical ON entities(name_canonical);
CREATE INDEX idx_entities_entity_type ON entities(entity_type);
```

**Columns:**
- `entity_id`: Global unique identifier (e.g., "ofac:sdn:12345")
- `tenant_id`: NULL for global entities, set for tenant custom lists
- `entity_type`: PERSON or ORGANIZATION
- `primary_name`: Original primary name
- `name_canonical`: Normalized name (lowercase, punctuation removed)
- `name_tokens`: Array of tokenized words
- `name_trigram`: String for pg_trgm similarity search
- `aliases`: JSON array of alias objects `[{name, name_canonical, source}]`
- `dob`: Array of dates (multiple DOBs possible)
- `countries`: Array of ISO 3166-1 alpha-2 codes
- `nationalities`: Array of country codes
- `addresses`: Array of address strings
- `identifiers`: JSON object `{passport: [...], national_id: [...]}`
- `risk_category`: SANCTION, PEP, or CUSTOM
- `source_list`: List identifier (e.g., "ofac_sdn")
- `list_version`: Version identifier (date or semantic version)
- `custom_list_id`: Identifier for tenant custom list (NULL for global)
- `raw_source`: Original parsed data (JSONB)
- `created_at`, `updated_at`: Timestamps

**Aliases JSON Structure:**
```json
[
  {
    "name": "MUHAMMAD ALI",
    "name_canonical": "muhammad ali",
    "source": "OFAC"
  }
]
```

---

### entity_embeddings

Stores vector embeddings for entities.

```sql
CREATE TABLE entity_embeddings (
    entity_id VARCHAR(500) PRIMARY KEY,
    embedding vector(384),  -- Dimension depends on model (384 for all-MiniLM-L6-v2, 1536 for OpenAI)
    embedding_model VARCHAR(100) NOT NULL,
    model_version VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    FOREIGN KEY (entity_id) REFERENCES entities(entity_id) ON DELETE CASCADE
);

-- HNSW index for vector similarity search
CREATE INDEX idx_entity_embeddings_hnsw ON entity_embeddings 
USING hnsw (embedding vector_cosine_ops)
WITH (m = 32, ef_construction = 200);

-- Additional indexes
CREATE INDEX idx_entity_embeddings_model ON entity_embeddings(embedding_model, model_version);
```

**Columns:**
- `entity_id`: Foreign key to entities
- `embedding`: Vector embedding (pgvector type)
- `embedding_model`: Model identifier (e.g., "text-embedding-3-small")
- `model_version`: Model version string
- `created_at`: Embedding generation timestamp

**HNSW Index Parameters:**
- `m = 32`: Number of bi-directional links per node
- `ef_construction = 200`: Candidate set size during index construction
- `vector_cosine_ops`: Operator class for cosine similarity

**Query Performance:**
- Use `SET LOCAL hnsw.ef_search = 100` for query tuning
- Default ef_search: 40
- Higher ef_search = better recall, slower query

---

### list_versions

Tracks versions of ingested lists (global and tenant custom).

```sql
CREATE TABLE list_versions (
    list_id VARCHAR(100) NOT NULL,
    version VARCHAR(50) NOT NULL,
    source_url TEXT,
    entity_count INTEGER,
    ingested_at TIMESTAMPTZ NOT NULL,
    activated_at TIMESTAMPTZ,
    status VARCHAR(20) NOT NULL CHECK (status IN ('PENDING', 'ACTIVE', 'ARCHIVED')),
    metadata JSONB DEFAULT '{}'::jsonb,
    
    PRIMARY KEY (list_id, version)
);

CREATE INDEX idx_list_versions_status ON list_versions(list_id, status);
CREATE INDEX idx_list_versions_activated ON list_versions(list_id, activated_at DESC);
```

**Columns:**
- `list_id`: List identifier (e.g., "ofac_sdn", "acme-watchlist")
- `version`: Version string (date "2025-12-28" or semantic "v1.0")
- `source_url`: Source URL if applicable
- `entity_count`: Number of entities in this version
- `ingested_at`: When ingestion completed
- `activated_at`: When version was activated (NULL if pending)
- `status`: PENDING, ACTIVE, or ARCHIVED
- `metadata`: Additional metadata (checksums, etc.)

---

### tenant_list_configs

Tenant-specific list enablement configuration.

```sql
CREATE TABLE tenant_list_configs (
    tenant_id VARCHAR(100) NOT NULL,
    list_id VARCHAR(100) NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    version_override VARCHAR(50),  -- NULL = use latest active
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    PRIMARY KEY (tenant_id, list_id),
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE
);

CREATE INDEX idx_tenant_list_configs_enabled ON tenant_list_configs(tenant_id, enabled);
```

**Columns:**
- `tenant_id`: Foreign key to tenants
- `list_id`: List identifier
- `enabled`: Whether list is enabled for this tenant
- `version_override`: Specific version to use (NULL = latest active)
- `updated_at`: Last update timestamp

---

### scoring_policies

Versioned scoring policies (weights + threshold).

```sql
CREATE TABLE scoring_policies (
    policy_id VARCHAR(200) PRIMARY KEY,
    tenant_id VARCHAR(100) NOT NULL,
    name VARCHAR(200) NOT NULL,
    weights JSONB NOT NULL,
    threshold NUMERIC(3,2) NOT NULL CHECK (threshold >= 0 AND threshold <= 1),
    version INTEGER NOT NULL,
    preset VARCHAR(50),  -- 'strict', 'balanced', 'lenient', 'custom'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by VARCHAR(200),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    UNIQUE (tenant_id, version)
);

CREATE INDEX idx_scoring_policies_tenant ON scoring_policies(tenant_id, is_active);
CREATE INDEX idx_scoring_policies_active ON scoring_policies(tenant_id) WHERE is_active = TRUE;
```

**Columns:**
- `policy_id`: Unique identifier (e.g., "acme-default-v1")
- `tenant_id`: Foreign key to tenants
- `name`: Policy name
- `weights`: JSON object with weight values
  ```json
  {
    "name_vector": 0.55,
    "name_trigram": 0.20,
    "alias_match": 0.10,
    "dob_match": 0.10,
    "country_match": 0.05
  }
  ```
- `threshold`: Minimum score threshold (0.0-1.0)
- `version`: Sequential version number (1, 2, 3, ...)
- `preset`: Preset name or "custom"
- `created_at`: Creation timestamp
- `created_by`: User/System that created the policy
- `is_active`: Whether this is the active policy for the tenant

---

### search_requests

Immutable audit records of all screening requests.

```sql
CREATE TABLE search_requests (
    request_id VARCHAR(200) PRIMARY KEY,
    tenant_id VARCHAR(100) NOT NULL,
    user_id VARCHAR(200),  -- Optional user identifier
    request_hash VARCHAR(64) NOT NULL,  -- SHA-256 hash of query inputs
    query JSONB NOT NULL,
    policy_version INTEGER,
    list_versions_used JSONB NOT NULL,
    matches JSONB NOT NULL,  -- Full match results
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    execution_time_ms INTEGER,
    
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE
);

CREATE INDEX idx_search_requests_tenant ON search_requests(tenant_id, created_at DESC);
CREATE INDEX idx_search_requests_hash ON search_requests(request_hash);
CREATE INDEX idx_search_requests_created ON search_requests(created_at DESC);
```

**Columns:**
- `request_id`: Unique request identifier
- `tenant_id`: Foreign key to tenants
- `user_id`: Optional user identifier (for audit)
- `request_hash`: SHA-256 hash of query inputs (for deduplication)
- `query`: JSON query object
  ```json
  {
    "name": "Mohammed Ali",
    "dob": "1985-02-10",
    "country": "PK",
    "entity_type": "PERSON"
  }
  ```
- `policy_version`: Scoring policy version used
- `list_versions_used`: JSON object mapping list_id to version
  ```json
  {
    "ofac_sdn": "2025-12-28",
    "eu_sanctions": "2025-01-10"
  }
  ```
- `matches`: Full match results array
- `created_at`: Request timestamp
- `execution_time_ms`: Query execution time in milliseconds

---

### usage_meters

Tracks tenant usage for billing/quota management.

```sql
CREATE TABLE usage_meters (
    usage_id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(100) NOT NULL,
    event_type VARCHAR(50) NOT NULL CHECK (event_type IN ('screen', 'batch_row', 'embed', 'monitor_run')),
    units INTEGER NOT NULL DEFAULT 1,
    request_id VARCHAR(200),
    job_id VARCHAR(200),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE
);

CREATE INDEX idx_usage_meters_tenant ON usage_meters(tenant_id, created_at DESC);
CREATE INDEX idx_usage_meters_event_type ON usage_meters(tenant_id, event_type, created_at);
CREATE INDEX idx_usage_meters_period ON usage_meters(tenant_id, DATE_TRUNC('month', created_at));
```

**Columns:**
- `usage_id`: Auto-increment primary key
- `tenant_id`: Foreign key to tenants
- `event_type`: Type of usage event
  - `screen`: Single screening
  - `batch_row`: One row in batch job
  - `embed`: Embedding generation
  - `monitor_run`: Scheduled monitoring run
- `units`: Number of units consumed (usually 1)
- `request_id`: Related request ID (if applicable)
- `job_id`: Related job ID (if applicable)
- `created_at`: Event timestamp

---

### api_keys

API key authentication.

```sql
CREATE TABLE api_keys (
    key_id VARCHAR(200) PRIMARY KEY,
    tenant_id VARCHAR(100) NOT NULL,
    key_hash VARCHAR(255) NOT NULL,  -- bcrypt hash
    name VARCHAR(200),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE
);

CREATE INDEX idx_api_keys_hash ON api_keys(key_hash) WHERE revoked_at IS NULL;
CREATE INDEX idx_api_keys_tenant ON api_keys(tenant_id, revoked_at);
```

**Columns:**
- `key_id`: Unique key identifier
- `tenant_id`: Foreign key to tenants
- `key_hash`: Bcrypt hash of API key (never store plaintext)
- `name`: Key name/description
- `created_at`: Creation timestamp
- `expires_at`: Expiration timestamp (NULL = no expiration)
- `revoked_at`: Revocation timestamp (NULL = active)
- `last_used_at`: Last usage timestamp

---

## Row Level Security (RLS)

For SaaS deployments, enable RLS for tenant isolation:

```sql
-- Enable RLS
ALTER TABLE entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_list_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE scoring_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_meters ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

-- Policy: Entities
CREATE POLICY tenant_entities_isolation ON entities
    FOR ALL
    USING (
        tenant_id IS NULL OR  -- Global entities visible to all
        tenant_id = current_setting('app.tenant_id', TRUE)::VARCHAR
    );

-- Policy: Tenant List Configs
CREATE POLICY tenant_configs_isolation ON tenant_list_configs
    FOR ALL
    USING (tenant_id = current_setting('app.tenant_id', TRUE)::VARCHAR);

-- Policy: Scoring Policies
CREATE POLICY tenant_policies_isolation ON scoring_policies
    FOR ALL
    USING (tenant_id = current_setting('app.tenant_id', TRUE)::VARCHAR);

-- Policy: Search Requests
CREATE POLICY tenant_requests_isolation ON search_requests
    FOR ALL
    USING (tenant_id = current_setting('app.tenant_id', TRUE)::VARCHAR);

-- Policy: Usage Meters
CREATE POLICY tenant_usage_isolation ON usage_meters
    FOR ALL
    USING (tenant_id = current_setting('app.tenant_id', TRUE)::VARCHAR);

-- Policy: API Keys
CREATE POLICY tenant_api_keys_isolation ON api_keys
    FOR ALL
    USING (tenant_id = current_setting('app.tenant_id', TRUE)::VARCHAR);
```

**Setting Tenant Context:**
```sql
SET LOCAL app.tenant_id = 'acme';
```

This is set automatically by the application middleware after authentication.

---

## Indexes Summary

### Performance-Critical Indexes

1. **Vector Search (HNSW)**: `idx_entity_embeddings_hnsw`
   - Enables sub-100ms vector similarity queries
   - Critical for search performance

2. **Lexical Search (GIN)**: `idx_entities_name_trigram`
   - Enables fast pg_trgm similarity queries
   - Critical for fuzzy name matching

3. **Tenant Isolation**: `idx_entities_tenant`, `idx_search_requests_tenant`
   - Ensures fast tenant-scoped queries
   - Critical for multi-tenant performance

4. **List Filtering**: `idx_entities_source_list`
   - Enables fast filtering by list
   - Used in every search query

### Maintenance Indexes

- `idx_tenants_plan`: For plan-based queries
- `idx_list_versions_status`: For list management
- `idx_usage_meters_period`: For usage aggregation
- `idx_api_keys_hash`: For API key lookups

---

## Constraints

### Foreign Keys
- `entities.tenant_id` → `tenants.tenant_id`
- `entity_embeddings.entity_id` → `entities.entity_id`
- `tenant_list_configs.tenant_id` → `tenants.tenant_id`
- `scoring_policies.tenant_id` → `tenants.tenant_id`
- `search_requests.tenant_id` → `tenants.tenant_id`
- `usage_meters.tenant_id` → `tenants.tenant_id`
- `api_keys.tenant_id` → `tenants.tenant_id`

### Check Constraints
- `tenants.plan`: Must be valid plan type
- `entities.entity_type`: PERSON or ORGANIZATION
- `entities.risk_category`: SANCTION, PEP, or CUSTOM
- `list_versions.status`: PENDING, ACTIVE, or ARCHIVED
- `scoring_policies.threshold`: 0.0-1.0
- `usage_meters.event_type`: Valid event types

---

## Partitioning (Future)

For very large deployments, consider partitioning `search_requests` by date:

```sql
-- Example: Monthly partitioning
CREATE TABLE search_requests_2025_01 PARTITION OF search_requests
    FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
```

---

## Backup & Recovery

### Critical Tables (Backup Daily)
- `entities`
- `entity_embeddings`
- `search_requests`
- `scoring_policies`

### Less Critical (Backup Weekly)
- `tenants`
- `tenant_list_configs`
- `list_versions`
- `usage_meters`
- `api_keys`

### Backup Strategy
1. **Point-in-Time Recovery (PITR)**: Enable WAL archiving
2. **Full Backups**: Daily at low-traffic times
3. **Test Restores**: Monthly verification

---

**Document Version**: 1.0  
**Last Updated**: 2025-01-15

