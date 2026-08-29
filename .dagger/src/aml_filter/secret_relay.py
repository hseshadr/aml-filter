"""Temporary, allowlisted relay from repository secrets to production."""

from __future__ import annotations

from typing import Final, Literal

from dagger import Container, File, Secret, dag

BASE_IMAGE: Final = (
    "node:22.13.0-bookworm@sha256:fa54405993eaa6bab6b6e460f5f3e945a2e2f07942ba31c0e297a7d9c2041f62"
)
REPOSITORY: Final = "hseshadr/aml-filter"
ENVIRONMENT: Final = "production"
SOURCE_PATH: Final = "/run/secrets/source"
CLI_PATH: Final = "/usr/local/bin/gh"
PREPARED_CLI_PATH: Final = "/opt/secret-relay/gh/bin/gh"
DOWNLOAD_SCRIPT: Final = """\
set -euo pipefail
archive=/opt/secret-relay/gh.tar.gz
root=/opt/secret-relay/gh
mkdir -p "$root"
url='https://github.com/cli/cli/releases/download/'
url="${url}v2.98.0/gh_2.98.0_linux_amd64.tar.gz"
digest='3b8ac6b30336802fc1a858d7c084e11cdf24ac1a761ca90b68022d7d729208de'
curl --fail --location --silent --show-error --output "$archive" "$url"
printf '%s  %s\\n' "$digest" "$archive" | sha256sum --check --status
tar --extract --gzip --file "$archive" --directory "$root" --strip-components=1
test -x "$root/bin/gh"
"""
STATIC_ENVIRONMENT: Final = (
    ("GH_PROMPT_DISABLED", "1"),
    ("GH_NO_UPDATE_NOTIFIER", "1"),
    ("DO_NOT_TRACK", "1"),
    ("GH_CONFIG_DIR", "/run/gh-config"),
)
Destination = Literal["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID", "WATCHLIST_SIGNING_KEY"]
DESTINATIONS: Final[tuple[Destination, ...]] = (
    "CLOUDFLARE_API_TOKEN",
    "CLOUDFLARE_ACCOUNT_ID",
    "WATCHLIST_SIGNING_KEY",
)


def _base() -> Container:
    """Create one fresh digest-pinned relay container."""
    return dag.container().from_(BASE_IMAGE)


def _github_cli() -> File:
    """Materialize the checksum-verified immutable GitHub CLI release."""
    return _base().with_exec(["bash", "-ceu", DOWNLOAD_SCRIPT]).file(PREPARED_CLI_PATH)


def _relay_script(destination: Destination) -> str:
    """Build one fixed allowlisted stdin-only GitHub CLI command."""
    return (
        "set -euo pipefail\n"
        "umask 077\n"
        'mkdir -p "$GH_CONFIG_DIR"\n'
        f"gh secret set {destination} --repo {REPOSITORY} "
        f"--env {ENVIRONMENT} < {SOURCE_PATH}\n"
    )


def _with_environment(container: Container, operation_id: str) -> Container:
    """Apply non-secret CLI controls and the explicit cache-buster."""
    for name, value in (*STATIC_ENVIRONMENT, ("SECRET_RELAY_OPERATION_ID", operation_id)):
        container = container.with_env_variable(name, value)
    return container


def _relay_container(
    cli: File,
    admin_token: Secret,
    source: Secret,
    destination: Destination,
    operation_id: str,
) -> Container:
    """Build one isolated destination transaction."""
    container = _base().with_file(CLI_PATH, cli)
    container = container.with_mounted_secret(SOURCE_PATH, source)
    container = container.with_secret_variable("GH_TOKEN", admin_token)
    container = _with_environment(container, operation_id)
    return container.with_exec(["bash", "-ceu", _relay_script(destination)])


async def relay(
    admin_token: Secret,
    sources: tuple[Secret, Secret, Secret],
    operation_id: str,
) -> str:
    """Synchronize the exact allowlist sequentially, one fresh container each."""
    cli = _github_cli()
    for destination, source in zip(DESTINATIONS, sources, strict=True):
        await _relay_container(cli, admin_token, source, destination, operation_id).sync()
    return "relayed 3 secrets to the production environment"
