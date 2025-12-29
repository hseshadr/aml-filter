# AML-Filter v2 Implementation Plan

## Overview

This document breaks down the AML-Filter v2 transformation into discrete, deliverable phases. Each phase builds on the previous, allowing for incremental delivery and validation.

---

## Phase 1: OSS Core + API (2-4 weeks)

**Goal**: Working screening engine with Postgres + pgvector that can screen entities against OFAC lists.

### Week 1: Foundation & Infrastructure

#### Day 1-2: Project Setup
- [ ] Create Python project structure (`aml_filter/` with all modules)
- [ ] Set up `pyproject.toml` with dependencies
- [ ] Configure `ruff`, `mypy`, `pytest`
- [ ] Create `.gitignore`, `.editorconfig`
- [ ] Set up pre-commit hooks
- [ ] Create Docker setup (Postgres 15+ with pgvector extension)
- [ ] Basic `docker-compose.yml` (postgres, valkey)

#### Day 3-4: Domain Models
- [ ] Create Pydantic models:
  - `Entity` (canonical model)
  - `SearchQuery`
  - `SearchResponse`
  - `Match` with explanation
- [ ] Create SQLAlchemy models (async):
  - `Entity` table
  - `EntityEmbedding` table
  - `ListVersion` table
- [ ] Set up Alembic migrations
- [ ] Create initial migration with schema
- [ ] Unit tests for domain models

#### Day 5: Name Normalization
- [ ] Implement normalization pipeline:
  - Unicode normalization (NFKD)
  - Punctuation stripping
  - Case normalization
  - Title removal
  - Whitespace canonicalization
- [ ] Tokenization logic
- [ ] Trigram preparation for pg_trgm
- [ ] Unit tests with edge cases

### Week 2: Search Backend

#### Day 1-2: Database Setup
- [ ] Configure async SQLAlchemy with asyncpg
- [ ] Set up connection pooling
- [ ] Create HNSW index on embeddings
- [ ] Create GIN index on name_trigram (pg_trgm)
- [ ] Test connection and indexes

#### Day 3-4: Vector Search Implementation
- [ ] Implement `PgVectorBackend` class
- [ ] Vector search with HNSW (`vector_search` method)
- [ ] Filtering by source_list, risk_category
- [ ] Tune `ef_search` parameter
- [ ] Integration tests with sample data
- [ ] Performance benchmarking

#### Day 5: Lexical Search Implementation
- [ ] Implement `LexicalBackend` using pg_trgm
- [ ] `similarity()` function queries
- [ ] Same filtering as vector search
- [ ] Integration tests
- [ ] Compare results with vector search

### Week 3: Embedding & Scoring

#### Day 1-2: Embedding Service
- [ ] Create `EmbeddingProvider` protocol
- [ ] Implement `SentenceTransformersProvider` (local)
  - Use `sentence-transformers/all-MiniLM-L6-v2`
  - Batch embedding support
- [ ] Embedding caching (in-memory LRU)
- [ ] Unit tests

#### Day 3-4: Scoring Engine
- [ ] Implement `ScoringPolicy` protocol
- [ ] Create `DefaultScoringPolicy`:
  - Signal computation (vector, trigram, alias, DOB, country)
  - Weighted combination
  - Explainability generation
- [ ] Preset weights (Strict/Balanced/Lenient)
- [ ] Unit tests with known matches

#### Day 5: Hybrid Search Integration
- [ ] Implement `HybridSearchService`:
  - Parallel vector + lexical search
  - Candidate union + deduplication
  - Scoring all candidates
  - Filtering by threshold
  - Top-K ranking
- [ ] Integration tests end-to-end

### Week 4: API & Ingestion

#### Day 1-2: FastAPI Setup
- [ ] Create FastAPI app structure
- [ ] `/v1/screen` endpoint implementation
- [ ] Request/response validation (Pydantic)
- [ ] Error handling middleware
- [ ] OpenAPI/Swagger documentation
- [ ] Integration tests

#### Day 3-4: OFAC Ingestion
- [ ] Implement OFAC SDN XML parser
- [ ] Entity extraction and normalization
- [ ] Batch embedding generation
- [ ] Database insertion with transactions
- [ ] List version tracking
- [ ] Test with real OFAC data (sample)

#### Day 5: Polish & Testing
- [ ] End-to-end test: ingest → search → results
- [ ] Performance testing (latency, throughput)
- [ ] Fix bugs, optimize queries
- [ ] Update README with setup instructions
- [ ] Docker compose example with sample data

### Phase 1 Deliverables

**Code:**
- Working `/v1/screen` API endpoint
- Hybrid search (vector + lexical)
- OFAC SDN ingestion pipeline
- Full test coverage (90%+ - compliance requirement)

**Documentation:**
- API documentation (OpenAPI/Swagger)
- Setup guide
- Architecture diagram

**Infrastructure:**
- Docker compose setup
- Database migrations
- CI/CD basics (GitHub Actions)

---

## Phase 2: SaaS Tenant Core (2-3 weeks)

**Goal**: Multi-tenant isolation, API keys, usage metering.

### Week 1: Tenant Management

#### Day 1-2: Tenant Model & API
- [ ] SQLAlchemy `Tenant` model
- [ ] Migration for tenants table
- [ ] CRUD endpoints (`/v1/tenants`)
- [ ] Tenant validation logic
- [ ] Unit tests

#### Day 3-4: API Key Authentication
- [ ] `ApiKey` model (with bcrypt hashing)
- [ ] Key generation endpoint
- [ ] Key rotation logic
- [ ] Authentication middleware:
  - Extract API key from header
  - Validate and lookup tenant
  - Set tenant context
- [ ] Integration tests

#### Day 5: Row Level Security (RLS)
- [ ] Enable RLS on tenant-scoped tables
- [ ] Create RLS policies:
  - `entities` (custom lists)
  - `tenant_list_configs`
  - `scoring_policies`
  - `search_requests`
- [ ] Test isolation between tenants
- [ ] Document RLS setup

### Week 2: Tenant Configuration

#### Day 1-2: List Configuration
- [ ] `TenantListConfig` model
- [ ] Endpoints to enable/disable lists
- [ ] List version override per tenant
- [ ] Search filtering by enabled lists
- [ ] Tests

#### Day 3-4: Usage Metering
- [ ] `UsageMeter` model
- [ ] Usage tracking service:
  - Record screen events
  - Record batch events
  - Aggregate by period
- [ ] `/v1/usage` endpoint
- [ ] Quota checking middleware (optional)
- [ ] Tests

#### Day 5: Rate Limiting
- [ ] Rate limit middleware (Redis-based)
- [ ] Configurable limits per tenant/plan
- [ ] Rate limit headers in responses
- [ ] Tests

### Week 3: Entity Isolation & Testing

#### Day 1-2: Custom List Support
- [ ] Update entity queries to filter by tenant_id
- [ ] Test tenant isolation:
  - Tenant A can't see Tenant B's custom lists
  - Global lists visible to all
- [ ] Update search backend for tenant context
- [ ] Integration tests

#### Day 3-4: Security Hardening
- [ ] Input validation on all endpoints
- [ ] SQL injection prevention (parameterized queries)
- [ ] XSS prevention (response sanitization)
- [ ] Security headers middleware
- [ ] Audit logging setup (basic)

#### Day 5: Documentation & Testing
- [ ] Update API docs with authentication
- [ ] Tenant setup guide
- [ ] Integration test suite
- [ ] Load testing (multi-tenant)

### Phase 2 Deliverables

**Code:**
- Multi-tenant API with authentication
- API key management
- Usage metering
- RLS policies

**Documentation:**
- Authentication guide
- Tenant setup guide
- Security practices

---

## Phase 3: Dashboard MVP (3-5 weeks)

**Goal**: Web UI for interactive search and results review.

### Week 1: Frontend Foundation

#### Day 1-2: React Setup
- [ ] Create React + TypeScript project (separate repo/package)
- [ ] Set up Vite build system
- [ ] Configure ESLint, Prettier
- [ ] Set up routing (React Router)
- [ ] Basic layout components

#### Day 3-4: Authentication UI
- [ ] Login page
- [ ] API key management page
- [ ] JWT token handling (if using JWT)
- [ ] Auth context provider
- [ ] Protected routes

#### Day 5: API Client
- [ ] Axios/Fetch wrapper with auth
- [ ] TypeScript types from OpenAPI spec
- [ ] Error handling
- [ ] Loading states

### Week 2: Search UI

#### Day 1-2: Search Page
- [ ] Google-style search bar
- [ ] Form fields (name, DOB, country, entity type)
- [ ] Advanced filters panel (collapsible)
- [ ] List selection checkboxes
- [ ] Threshold slider
- [ ] Search button with loading state

#### Day 3-4: Results List
- [ ] Results table/list view
- [ ] Score display with color coding
- [ ] Risk badge (High/Med/Low)
- [ ] List source badges
- [ ] Pagination
- [ ] Sorting by score

#### Day 5: Match Detail View
- [ ] Modal or detail page
- [ ] Entity information display
- [ ] Explanation panel (reasons)
- [ ] Matched fields highlighting
- [ ] Export button

### Week 3: List Management

#### Day 1-2: Lists Page
- [ ] Global lists display
- [ ] Enable/disable toggles
- [ ] Version information
- [ ] Last refresh timestamp
- [ ] Entity counts

#### Day 3-4: Custom Lists UI
- [ ] Custom lists list view
- [ ] Upload button
- [ ] File upload dialog (CSV/JSON)
- [ ] Preview table
- [ ] Validation errors display
- [ ] Activate/rollback buttons

#### Day 5: List Configuration
- [ ] Per-list settings
- [ ] Version override selector
- [ ] Tests

### Week 4: Exports & Usage

#### Day 1-2: Export Functionality
- [ ] CSV export for results
- [ ] JSON export
- [ ] Download button
- [ ] Batch export (all results)

#### Day 3-4: Usage Dashboard
- [ ] Usage metrics display
- [ ] Period selector (month, week)
- [ ] Breakdown by event type
- [ ] Quota indicators
- [ ] Usage charts (optional)

#### Day 5: Polish & Testing
- [ ] UI/UX improvements
- [ ] Responsive design
- [ ] Error states
- [ ] Loading skeletons
- [ ] E2E tests (Playwright/Cypress)

### Week 5: Integration & Deploy

#### Day 1-2: Backend Integration
- [ ] Connect frontend to API
- [ ] CORS configuration
- [ ] Error handling
- [ ] End-to-end testing

#### Day 3-4: Deployment
- [ ] Build frontend for production
- [ ] Serve as static files (FastAPI or nginx)
- [ ] Environment configuration
- [ ] Deployment guide

#### Day 5: Documentation
- [ ] User guide
- [ ] Screenshots/video walkthrough
- [ ] Troubleshooting guide

### Phase 3 Deliverables

**Code:**
- Working React dashboard
- Search UI
- Results review
- List management
- Basic exports

**Documentation:**
- User guide
- Deployment guide

---

## Phase 4: Weights + Presets + Governance (3-4 weeks)

**Goal**: Configurable scoring policies with versioning.

### Week 1: Scoring Policy API

#### Day 1-2: Policy Model
- [ ] `ScoringPolicy` SQLAlchemy model
- [ ] Policy versioning logic
- [ ] Migration
- [ ] Unit tests

#### Day 3-4: Policy Endpoints
- [ ] `GET /v1/weights` (current policy)
- [ ] `PUT /v1/weights` (update policy)
- [ ] `GET /v1/weights/history` (version history)
- [ ] `POST /v1/weights/rollback` (revert to version)
- [ ] Validation logic
- [ ] Tests

#### Day 5: Policy Application
- [ ] Update search service to use tenant policy
- [ ] Default policy creation on tenant creation
- [ ] Policy inheritance (global → tenant)
- [ ] Tests

### Week 2: Presets & UI

#### Day 1-2: Preset Implementation
- [ ] Define preset weights (Strict/Balanced/Lenient)
- [ ] Preset application logic
- [ ] Preset validation
- [ ] Unit tests

#### Day 3-4: Weights Configuration UI
- [ ] Weights configuration page
- [ ] Sliders for each weight
- [ ] Preset selector with preview
- [ ] Real-time validation
- [ ] Save button

#### Day 5: Policy History UI
- [ ] Version history table
- [ ] Compare versions
- [ ] Rollback confirmation dialog
- [ ] Tests

### Week 3: Audit & Governance

#### Day 1-2: Policy Audit Trail
- [ ] Track policy changes (who, when, what)
- [ ] Audit log model
- [ ] Display in UI
- [ ] Export audit logs

#### Day 3-4: A/B Evaluation (Optional)
- [ ] Side-by-side policy comparison
- [ ] Test dataset runner
- [ ] Metrics comparison (precision, recall)
- [ ] UI for results

#### Day 5: Documentation
- [ ] Scoring policy guide
- [ ] Best practices
- [ ] Performance impact analysis

### Phase 4 Deliverables

**Code:**
- Policy CRUD API
- Policy versioning
- UI for weight configuration
- Audit trail

**Documentation:**
- Scoring guide
- Policy best practices

---

## Phase 5: Workflows + Monitoring + Reports (4-8 weeks)

**Goal**: Batch processing, scheduled screening, reporting.

### Week 1-2: Batch Processing

#### Day 1-3: Job Queue Setup
- [ ] Set up RQ (Redis Queue)
- [ ] Worker service structure
- [ ] Job model (SQLAlchemy)
- [ ] Job status tracking
- [ ] Error handling and retries

#### Day 4-5: Batch API
- [ ] `POST /v1/batch` endpoint
- [ ] File upload handling (CSV/JSON)
- [ ] Job creation and queuing
- [ ] `GET /v1/batch/{job_id}` status
- [ ] `GET /v1/batch/{job_id}/results` download
- [ ] Tests

#### Day 6-8: Batch Processing Logic
- [ ] CSV/JSON parser
- [ ] Record validation
- [ ] Parallel processing (chunked)
- [ ] Progress tracking
- [ ] Result aggregation
- [ ] Error reporting
- [ ] Tests

#### Day 9-10: Batch UI
- [ ] Batch upload page
- [ ] Job list view
- [ ] Progress indicators
- [ ] Results download
- [ ] Error display

### Week 3: Onboarding Workflow

#### Day 1-2: Onboarding Data Model
- [ ] Onboarding step tracking
- [ ] Wizard state persistence
- [ ] Tests

#### Day 3-4: Onboarding API
- [ ] Step completion endpoints
- [ ] Test screening endpoint
- [ ] Onboarding report generation
- [ ] Tests

#### Day 5: Onboarding UI
- [ ] Multi-step wizard
- [ ] Step 1: Choose lists
- [ ] Step 2: Upload custom lists (optional)
- [ ] Step 3: Configure weights
- [ ] Step 4: Test screening
- [ ] Step 5: Review report
- [ ] Completion screen

### Week 4: Monitoring & Alerts

#### Day 1-2: Monitoring Data Model
- [ ] Monitoring job model
- [ ] Schedule model (cron-like)
- [ ] Alert rules model
- [ ] Tests

#### Day 3-4: Monitoring Service
- [ ] Scheduled job runner (cron/scheduler)
- [ ] Re-run prior datasets
- [ ] Compare with previous runs
- [ ] Detect new matches
- [ ] Detect score changes
- [ ] Tests

#### Day 5: Alerting
- [ ] Email notification service
- [ ] Webhook notification service
- [ ] Alert rule evaluation
- [ ] Alert history
- [ ] Tests

### Week 5-6: Reports

#### Day 1-2: Report Data Model
- [ ] Report model
- [ ] Report template model
- [ ] Tests

#### Day 3-4: PDF Generation
- [ ] Template engine (Jinja2)
- [ ] PDF library (ReportLab/WeasyPrint)
- [ ] Report templates:
  - Audit Summary
  - High Risk Matches
  - False Positive Review
- [ ] Tests

#### Day 5-6: Report API
- [ ] `POST /v1/reports/generate` endpoint
- [ ] Report generation job
- [ ] `GET /v1/reports/{report_id}/download`
- [ ] Report list endpoint
- [ ] Tests

#### Day 7-8: Report UI
- [ ] Report generation page
- [ ] Template selection
- [ ] Parameter configuration
- [ ] Report list view
- [ ] Download links

### Week 7: Case Management

#### Day 1-2: Case Model
- [ ] Case model (TP/FP/Needs Review)
- [ ] Decision tracking
- [ ] Reviewer identity
- [ ] Notes and attachments
- [ ] Tests

#### Day 3-4: Case API
- [ ] `POST /v1/cases` (create from match)
- [ ] `PUT /v1/cases/{case_id}` (update decision)
- [ ] `GET /v1/cases` (list with filters)
- [ ] Notes/attachments endpoints
- [ ] Tests

#### Day 5: Case UI
- [ ] Case list view
- [ ] Case detail page
- [ ] Decision buttons (TP/FP/Review)
- [ ] Notes editor
- [ ] Attachment upload

### Week 8: Integration & Polish

#### Day 1-2: End-to-end Testing
- [ ] Full workflow tests
- [ ] Performance testing
- [ ] Bug fixes

#### Day 3-4: Documentation
- [ ] Workflow guides
- [ ] Monitoring setup guide
- [ ] Report templates documentation

#### Day 5: Deployment
- [ ] Worker service deployment
- [ ] Scheduler setup
- [ ] Production configuration

### Phase 5 Deliverables

**Code:**
- Batch processing API + UI
- Onboarding wizard
- Monitoring and alerts
- PDF report generation
- Case management

**Documentation:**
- Workflow guides
- Monitoring guide
- Report templates

---

## Phase 6: Enterprise/Scale Enhancements (Future)

**Optional enhancements based on needs:**

### Reranking
- [ ] Cross-encoder model integration
- [ ] Reranking service
- [ ] Configuration UI
- [ ] Performance optimization

### Additional Lists
- [ ] UN Security Council parser
- [ ] UK HMT parser
- [ ] Custom parser plugin system

### SSO/SAML
- [ ] SAML 2.0 integration
- [ ] OAuth2/OIDC support
- [ ] User management UI

### SOC2 Controls
- [ ] Access logging
- [ ] Data encryption audit
- [ ] Compliance reports

### OpenSearch Backend
- [ ] OpenSearch backend implementation
- [ ] Migration tool
- [ ] Configuration

---

## Dependencies Between Phases

```
Phase 1 (Core)
    ↓
Phase 2 (Tenants) ──┐
    ↓                │
Phase 3 (Dashboard) │
    ↓                │
Phase 4 (Weights)   │
    ↓                │
Phase 5 (Workflows) │
    ↓                │
Phase 6 (Enterprise)┘
```

**Critical Path:**
- Phase 1 must complete before any other phase
- Phase 2 required for Phase 3 (dashboard needs tenants)
- Phase 3 can start in parallel with Phase 2 (frontend can mock API)
- Phase 4 depends on Phase 2 (policies are tenant-scoped)
- Phase 5 depends on Phase 2 and Phase 3 (needs tenant + UI)

---

## Risk Mitigation

### Technical Risks

1. **pgvector HNSW Performance**
   - **Mitigation**: Benchmark early, tune parameters, have OpenSearch as fallback

2. **Embedding Quality**
   - **Mitigation**: Test multiple models, allow model switching

3. **Multi-tenant Isolation**
   - **Mitigation**: RLS + application-level checks, extensive testing

### Timeline Risks

1. **Scope Creep**
   - **Mitigation**: Strict phase boundaries, feature freeze per phase

2. **Integration Complexity**
   - **Mitigation**: Clear interfaces, integration tests early

### Resource Risks

1. **Developer Availability**
   - **Mitigation**: Modular design allows parallel work, clear documentation

---

## Success Metrics

### Phase 1
- [ ] API responds in < 200ms (p95)
- [ ] 95%+ recall on test dataset
- [ ] 90%+ test coverage (compliance requirement)

### Phase 2
- [ ] Zero tenant data leakage in tests
- [ ] API key authentication works
- [ ] Usage metering accurate

### Phase 3
- [ ] Dashboard loads in < 2s
- [ ] Search completes in < 3s end-to-end
- [ ] User can complete screening flow

### Phase 4
- [ ] Policy changes apply correctly
- [ ] Version rollback works
- [ ] No performance degradation

### Phase 5
- [ ] Batch jobs process 1000 records in < 5min
- [ ] Reports generate in < 30s
- [ ] Monitoring runs on schedule

---

**Document Version**: 1.0  
**Last Updated**: 2025-01-15

