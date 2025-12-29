# AML-Filter v2 Documentation

## Overview

This directory contains the complete specification and implementation documentation for AML-Filter v2, an open-source AI-native AML screening engine with Python backend and React frontend.

## Core Documents

### [SPEC.md](./SPEC.md)
**Comprehensive Technical Specification**
- Architecture overview
- Technology stack
- Data model
- Core interfaces
- API specification
- Search & scoring engine design
- Multi-tenancy model
- Security & compliance

**Read this first** for a complete understanding of the system design.

### [API_SPEC.md](./API_SPEC.md)
**API Reference Documentation**
- Complete REST API specification
- Request/response schemas
- Authentication methods
- Rate limiting
- Error handling
- Example requests/responses

### [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md)
**Database Design Documentation**
- Complete PostgreSQL schema
- Table definitions and relationships
- Indexes and performance considerations
- Row Level Security (RLS) policies

### [QUICKSTART.md](./QUICKSTART.md)
**Quick Start Guide**
- Prerequisites
- Setup steps
- Running the API
- Testing the API

## Additional Documentation

- [DEPENDENCY_MANAGEMENT.md](./DEPENDENCY_MANAGEMENT.md) - Using uv for dependency management
- [VECTOR_LIBRARY.md](./VECTOR_LIBRARY.md) - Integration with shared-libs-python
- [HNSW_PARTITIONING_STRATEGY.md](./HNSW_PARTITIONING_STRATEGY.md) - Pointer to vector partitioning docs

## Archive

Historical implementation tracking documents are in [archive/](./archive/):
- Implementation plans (completed)
- Status tracking documents

## Architecture Summary

```
Client → FastAPI → Core Services → Postgres (pgvector + pg_trgm)
              ↓
         Background Worker (RQ)
```

**Key Technologies:**
- Python 3.13+
- FastAPI
- PostgreSQL 15+ with pgvector (HNSW)
- Redis/Valkey (job queue)
- React + TypeScript (dashboard)
- sentence-transformers (all-MiniLM-L6-v2, 384 dimensions)

## Quick Start

1. **Read the spec**: Start with [SPEC.md](./SPEC.md) to understand the system
2. **Set up environment**: See [QUICKSTART.md](./QUICKSTART.md)
3. **Reference API**: See [API_SPEC.md](./API_SPEC.md) for endpoints
4. **Database schema**: See [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md)

---

**Last Updated**: 2025-12-29
