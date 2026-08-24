"""Portable checks and build output composed from native Dagger objects."""

from typing import Annotated, Final

from dagger import (
    Container,
    DefaultPath,
    Directory,
    Ignore,
    check,
    dag,
    field,
    function,
    object_type,
)

NODE_IMAGE: Final = (
    "node:22.13.0-bookworm@sha256:"
    "fa54405993eaa6bab6b6e460f5f3e945a2e2f07942ba31c0e297a7d9c2041f62"
)
UV_IMAGE: Final = (
    "ghcr.io/astral-sh/uv:0.11.32@sha256:"
    "df4cae8f3a96d175e2e5f992e597550000edbe78fdc2594d5cd8de1a217f504c"
)

SOURCE_EXCLUDES: Final = [
    ".git",
    ".venv",
    "**/.venv",
    "**/node_modules",
    "**/dist",
    "**/.decision-out",
    "**/playwright-report",
    "**/test-results",
    "frontend/app/public/models",
]
NODE_CACHES: Final = (
    ("/root/.local/share/pnpm/store", "aml-filter-pnpm"),
    ("/root/.cache/corepack", "aml-filter-corepack"),
    ("/src/frontend/app/public/models", "aml-filter-minilm"),
)
QUALITY_CACHES: Final = (
    ("/root/.cache/uv", "aml-filter-uv"),
    ("/root/.cache/ms-playwright", "aml-filter-playwright"),
)
PLAYWRIGHT_INSTALL: Final = [
    "pnpm",
    "--filter",
    "aml-filter-app",
    "exec",
    "playwright",
    "install",
    "--with-deps",
    "chromium",
    "firefox",
    "webkit",
]


def mount_caches(
    container: Container, caches: tuple[tuple[str, str], ...]
) -> Container:
    """Mount named caches without hiding Dagger's native cache contract."""
    for path, name in caches:
        container = container.with_mounted_cache(path, dag.cache_volume(name))
    return container


@object_type
class AmlFilter:
    """Compose the repository's existing commands; keep policy in the repository."""

    source: Annotated[Directory, DefaultPath("/"), Ignore(SOURCE_EXCLUDES)] = field()

    def _node(self) -> Container:
        container = (
            mount_caches(dag.container().from_(NODE_IMAGE), NODE_CACHES)
            .with_directory("/src", self.source)
            .with_workdir("/src/frontend")
            .with_env_variable("COREPACK_HOME", "/root/.cache/corepack")
            .with_exec(["npm", "install", "--global", "corepack@0.34.5"])
            .with_exec(["corepack", "enable"])
        )
        return container.with_exec(["pnpm", "install", "--frozen-lockfile"])

    def _quality(self) -> Container:
        uv = dag.container().from_(UV_IMAGE).file("/uv")
        container = (
            self._node()
            .with_file("/usr/local/bin/uv", uv)
            .with_env_variable("UV_PYTHON", "3.13.5")
            .with_env_variable("SSL_CERT_FILE", "/etc/ssl/certs/ca-certificates.crt")
        )
        cached = mount_caches(container, QUALITY_CACHES)
        synced = cached.with_exec(["uv", "sync", "--project", "../eval", "--frozen"])
        return synced.with_exec(PLAYWRIGHT_INSTALL)

    @function
    @check
    def quality(self) -> Container:
        """Run the repository's complete canonical release gate."""
        return self._quality().with_exec(["pnpm", "run", "gate"])

    @function
    def build(self) -> Directory:
        """Return the production-static application as a lazy Dagger Directory."""
        built = self._node().with_exec(
            ["pnpm", "--filter", "aml-filter-app", "run", "build"]
        )
        return built.directory("/src/frontend/app/dist")
