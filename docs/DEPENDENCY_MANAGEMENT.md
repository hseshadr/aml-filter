# Dependency Management

This project uses **uv** for dependency management, which uses `pyproject.toml` as the single source of truth.

## Why uv?

- **Fast**: Much faster than pip
- **Modern**: Uses `pyproject.toml` standard (PEP 621)
- **Reliable**: Deterministic lock files
- **Simple**: One file (`pyproject.toml`) instead of multiple requirements files

## Dependency Files

### `pyproject.toml`
- **All dependencies** are defined here
- Main dependencies in `[project.dependencies]`
- Dev dependencies in `[project.optional-dependencies.dev]`
- This is the **only** source of truth for dependencies

### `uv.lock`
- Auto-generated lock file (created by `uv sync`)
- Ensures reproducible builds
- Should be committed to version control

## Common Commands

```bash
# Install all dependencies (including dev)
uv sync

# Install only production dependencies
uv sync --no-dev

# Add a new dependency
uv add package-name

# Add a dev dependency
uv add --dev package-name

# Remove a dependency
uv remove package-name

# Update dependencies
uv sync --upgrade

# Run a command in the virtual environment
uv run python script.py
uv run pytest
uv run uvicorn ...
```

## Migration from requirements.txt

If you're used to `requirements.txt`:

- **Old way**: `pip install -r requirements.txt`
- **New way**: `uv sync`

All dependencies are now in `pyproject.toml` under:
- `[project.dependencies]` - Production dependencies
- `[project.optional-dependencies.dev]` - Development dependencies

## No More requirements.txt

We **do not** use `requirements.txt` or `requirements-dev.txt` because:
1. `uv` uses `pyproject.toml` natively
2. Having multiple dependency files causes confusion
3. `pyproject.toml` is the modern Python standard (PEP 621)

## Docker

The Dockerfile uses `uv` to install dependencies:
```dockerfile
COPY pyproject.toml uv.lock* ./
RUN uv sync --frozen --no-dev
```

This ensures Docker builds use the exact same dependencies as local development.

