# Multi-stage Dockerfile for AML-Filter v2

FROM python:3.13-slim as base

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    postgresql-client \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install uv
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.cargo/bin:${PATH}"

# Copy dependency files
COPY pyproject.toml uv.lock* ./

# Install Python dependencies using uv
RUN uv sync --frozen --no-dev

# Copy application code
COPY aml_filter/ ./aml_filter/
COPY alembic/ ./alembic/
COPY alembic.ini ./

# API stage
FROM base as api
EXPOSE 8000
CMD ["uv", "run", "uvicorn", "aml_filter.api.main:app", "--host", "0.0.0.0", "--port", "8000"]

# Worker stage
FROM base as worker
CMD ["uv", "run", "rq", "worker", "--url", "${REDIS_URL}", "aml-filter-queue"]
