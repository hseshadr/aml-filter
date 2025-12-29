import pytest
from fastapi import Request, Response, FastAPI
from fastapi.testclient import TestClient
from aml_filter.api.middleware import SecurityHeadersMiddleware, RateLimitMiddleware
from unittest.mock import AsyncMock, patch

def test_security_headers_middleware():
    app = FastAPI()
    app.add_middleware(SecurityHeadersMiddleware)
    
    @app.get("/")
    async def root():
        return {"message": "ok"}
    
    client = TestClient(app)
    response = client.get("/")
    
    assert response.status_code == 200
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["X-Frame-Options"] == "DENY"
    assert response.headers["X-XSS-Protection"] == "1; mode=block"
    assert "Strict-Transport-Security" in response.headers
    assert "Content-Security-Policy" in response.headers

@pytest.mark.asyncio
async def test_rate_limit_middleware_skips_health():
    app = FastAPI()
    app.add_middleware(RateLimitMiddleware)
    
    @app.get("/health")
    async def health():
        return {"status": "ok"}
    
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200

@pytest.mark.asyncio
async def test_rate_limit_middleware_allowed():
    app = FastAPI()
    app.add_middleware(RateLimitMiddleware)
    
    @app.get("/v1/screen")
    async def screen(request: Request):
        return {"status": "ok"}
    
    # Mock check_rate_limit to allow
    with patch("aml_filter.api.middleware.check_rate_limit", new_callable=AsyncMock) as mock_check:
        mock_check.return_value = (True, 99, 60)
        
        client = TestClient(app)
        # We need to set tenant_id in request.state. In TestClient, we can use a dependency or middleware.
        # But RateLimitMiddleware looks at request.state.tenant_id which is set by another middleware.
        
        # Let's add a dummy middleware to set tenant_id
        @app.middleware("http")
        async def add_tenant_id(request: Request, call_next):
            request.state.tenant_id = "test-tenant"
            return await call_next(request)
            
        response = client.get("/v1/screen")
        assert response.status_code == 200
        assert response.headers["X-RateLimit-Remaining"] == "99"
        assert response.headers["X-RateLimit-Reset"] == "60"

@pytest.mark.asyncio
async def test_rate_limit_middleware_exceeded():
    app = FastAPI()
    app.add_middleware(RateLimitMiddleware)
    
    @app.get("/v1/screen")
    async def screen(request: Request):
        return {"status": "ok"}
    
    @app.middleware("http")
    async def add_tenant_id(request: Request, call_next):
        request.state.tenant_id = "test-tenant"
        return await call_next(request)
        
    with patch("aml_filter.api.middleware.check_rate_limit", new_callable=AsyncMock) as mock_check:
        mock_check.return_value = (False, 0, 30)
        
        client = TestClient(app)
        response = client.get("/v1/screen")
        assert response.status_code == 429
        assert "Rate limit exceeded" in response.json()["detail"]
        assert response.headers["X-RateLimit-Remaining"] == "0"
        assert response.headers["X-RateLimit-Reset"] == "30"
        assert response.headers["Retry-After"] == "30"

@pytest.mark.asyncio
async def test_rate_limit_middleware_fail_open():
    app = FastAPI()
    app.add_middleware(RateLimitMiddleware)
    
    @app.get("/v1/screen")
    async def screen(request: Request):
        return {"status": "ok"}
    
    @app.middleware("http")
    async def add_tenant_id(request: Request, call_next):
        request.state.tenant_id = "test-tenant"
        return await call_next(request)
        
    with patch("aml_filter.api.middleware.check_rate_limit", side_effect=Exception("Redis down")):
        client = TestClient(app)
        response = client.get("/v1/screen")
        assert response.status_code == 200

