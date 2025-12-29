# Integration Tests

Integration tests require a running PostgreSQL database with pgvector extension and optionally Valkey (Redis).

## Setup

1. **Start test database:**
   ```bash
   # Using docker-compose
   docker-compose up -d postgres redis
   
   # Or use existing database
   export TEST_DATABASE_URL="postgresql+asyncpg://user:pass@localhost:5432/amlfilter_test"
   export TEST_REDIS_URL="redis://localhost:6379/1"
   ```

2. **Create test database:**
   ```bash
   # The test fixtures will automatically create the test database if it doesn't exist
   # Or create manually:
   createdb amlfilter_test
   ```

3. **Run integration tests:**
   ```bash
   # Run all integration tests
   uv run pytest tests/integration -m integration -v
   
   # Run specific test file
   uv run pytest tests/integration/test_search_integration.py -v
   ```

## Test Structure

- `conftest.py` - Shared fixtures for PostgreSQL and database setup
- `test_search_integration.py` - End-to-end search pipeline tests
- `test_ingestion_integration.py` - Ingestion pipeline tests
- `test_api_integration.py` - API endpoint tests

## Requirements

- PostgreSQL 15+ with pgvector extension
- Test database will be created automatically
- Each test runs in a transaction that is rolled back after the test
- Tables are created and dropped for each test session

## Notes

- Integration tests are marked with `@pytest.mark.integration`
- Tests use real database connections (not mocks)
- Database is cleaned between tests using transactions
- Tests verify actual pgvector and pg_trgm functionality

