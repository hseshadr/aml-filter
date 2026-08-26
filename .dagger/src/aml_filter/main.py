"""Portable AML Filter CI/CD composed from native Dagger objects."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from shlex import split
from typing import Annotated, Final

from dagger import (
    Container,
    DefaultPath,
    Directory,
    Ignore,
    Secret,
    Service,
    check,
    dag,
    field,
    function,
    object_type,
)

from .policy import (
    ReleaseIdentity,
    ReleaseKind,
    parse_release_identity,
    release_identity,
    release_version,
    whole_bundle_fallback_days,
)

NODE_IMAGE: Final = (
    "node:22.13.0-bookworm@sha256:fa54405993eaa6bab6b6e460f5f3e945a2e2f07942ba31c0e297a7d9c2041f62"
)
UV_IMAGE: Final = (
    "ghcr.io/astral-sh/uv:0.11.32@sha256:"
    "df4cae8f3a96d175e2e5f992e597550000edbe78fdc2594d5cd8de1a217f504c"
)
GITLEAKS_IMAGE: Final = (
    "zricethezav/gitleaks:v8.30.1@sha256:"
    "c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f"
)
EDGEPROC_REPO: Final = "https://github.com/hseshadr/edge-proc"
EDGEPROC_COMMIT: Final = "e3bfb570feb8619c823df63b6c012fd8c8c6a9b6"
LIVE_ORIGIN: Final = "https://aml-filter.com"
PUBLIC_KEY: Final = "/src/frontend/app/public/public.key"
SOURCE_EXCLUDES: Final = split(
    ".git .venv **/.venv **/node_modules **/dist **/.decision-out "
    "**/playwright-report **/test-results frontend/app/public/models"
)
HISTORY_EXCLUDES: Final = split(".venv **/.venv **/node_modules **/dist frontend/app/public/models")
NODE_CACHES: Final = (
    ("/root/.local/share/pnpm/store", "aml-filter-pnpm"),
    ("/root/.cache/corepack", "aml-filter-corepack"),
    ("/src/frontend/app/public/models", "aml-filter-minilm"),
)
QUALITY_CACHES: Final = (
    ("/root/.cache/uv", "aml-filter-uv"),
    ("/root/.cache/ms-playwright", "aml-filter-playwright"),
)
PLAYWRIGHT_INSTALL: Final = split(
    "pnpm --filter aml-filter-app exec playwright install --with-deps chromium firefox webkit"
)
APP_BUILD: Final = split("pnpm --filter aml-filter-app run build")
WRANGLER_DEPLOY: Final = split(
    "pnpm exec wrangler pages deploy /deploy --project-name aml-filter --branch main"
)
FRESHNESS_CHECK: Final = [
    "pnpm",
    "--silent",
    "--filter",
    "@amlfilter/publisher",
    "run",
    "check-published-freshness",
    "--",
    "--base-url",
    f"{LIVE_ORIGIN}/bundle/origin",
    "--pubkey",
    PUBLIC_KEY,
]
PREVIEW_ARGS: Final = split("pnpm --filter aml-filter-app exec vite preview --host --port 4173")
RELEASE_SCRIPT: Final = r"""
set -euo pipefail
rm -rf /release /tmp/bundle-candidate /tmp/verify-cache /tmp/verify-out
mkdir -p /release
SEQUENCE="$(pnpm --silent --filter @amlfilter/publisher run next-published-sequence -- \
  --base-url "$LIVE_BUNDLE" --pubkey "$PUBLIC_KEY")"
umask 077
printf '%s' "$WATCHLIST_SIGNING_KEY" | base64 -d > /run/watchlist-signing.key
[ "$(wc -c < /run/watchlist-signing.key)" -eq 32 ]
trap 'rm -f /run/watchlist-signing.key' EXIT
set +e
pnpm --filter @amlfilter/publisher run build-real-bundle -- \
  --version "$VERSION" --sequence "$SEQUENCE" --key /run/watchlist-signing.key \
  --out /tmp/bundle-candidate \
  --live-base-url "$LIVE_BUNDLE" --pubkey "$PUBLIC_KEY" \
  | tee /tmp/build.out
BUILD_STATUS="${PIPESTATUS[0]}"
set -e
if [ "$BUILD_STATUS" -eq 0 ]; then
  mv /tmp/bundle-candidate /release/origin
  printf 'BUNDLE_REFRESHED=true\nSERVED_VERSION=%s\n' "$VERSION" > /release/identity.env
  printf 'SERVED_SEQUENCE=%s\n' "$SEQUENCE" >> /release/identity.env
elif [ "$FALLBACK_DAYS" -gt 0 ]; then
  pnpm --silent --filter @amlfilter/publisher run mirror-published-origin -- \
    --base-url "$LIVE_BUNDLE" --pubkey "$PUBLIC_KEY" \
    --out /release/origin --max-age-days "$FALLBACK_DAYS" > /tmp/mirror.env
  grep -E '^SERVED_(VERSION|SEQUENCE|AGE_DAYS)=' /tmp/mirror.env > /release/identity.env
  printf 'BUNDLE_REFRESHED=false\n' >> /release/identity.env
else
  exit "$BUILD_STATUS"
fi
grep -E '^(ALIAS_(MODE|ADDED)|STALE_LISTS)=' /tmp/build.out >> /release/identity.env || true
uv run --project /edgeproc edgeproc sync \
  --base-url /release/origin --cache-dir /tmp/verify-cache \
  --materialize-to /tmp/verify-out --key "$PUBLIC_KEY" --pretty
"""
VERIFY_SCRIPT: Final = r"""
set -euo pipefail
value() { sed -n "s/^$1=//p" /release/identity.env; }
VERSION="$(value SERVED_VERSION)"
SEQUENCE="$(value SERVED_SEQUENCE)"
[ -n "$VERSION" ] && [ -n "$SEQUENCE" ]
node app/scripts/build-identity.mjs verify \
  --url "$APP_ORIGIN/build.json" --sha "$SOURCE_SHA" --run-id "$RUN_ID"
pnpm --filter @amlfilter/publisher run verify-published-origin -- \
  --base-url "$APP_ORIGIN/bundle/origin" --pubkey "$PUBLIC_KEY" \
  --expect-version "$VERSION" --expect-sequence "$SEQUENCE" \
  --attempts "$ATTEMPTS" --delay-seconds "$DELAY_SECONDS"
"""
CANONICAL_SCRIPT: Final = r"""
set -euo pipefail
curl --fail --silent --show-error --max-time 15 \
  --output /dev/null https://aml-filter.com/
readarray -t redirect < <(curl --silent --show-error --max-time 15 \
  --output /dev/null --write-out '%{http_code}\n%{redirect_url}\n' \
  'https://www.aml-filter.com/settings?source=dagger-check')
status="${redirect[0]:-missing}"
target="${redirect[1]:-missing}"
expected='https://aml-filter.com/settings?source=dagger-check'
{ [ "$status" = 301 ] || [ "$status" = 308 ]; } && [ "$target" = "$expected" ]
"""


@dataclass(frozen=True)
class PublishRequest:
    """Secrets and exact identity for one production publication."""

    kind: ReleaseKind
    signing_key: Secret
    api_token: Secret
    account_id: Secret
    release_id: str


def mount_caches(container: Container, caches: tuple[tuple[str, str], ...]) -> Container:
    for path, name in caches:
        container = container.with_mounted_cache(path, dag.cache_volume(name))
    return container


@object_type
class AmlFilter:
    """Run every repository-authored CI/CD operation through Dagger."""

    source: Annotated[Directory, DefaultPath("/"), Ignore(SOURCE_EXCLUDES)] = field()
    history: Annotated[Directory, DefaultPath("/"), Ignore(HISTORY_EXCLUDES)] = field()

    def _node(self) -> Container:
        container = mount_caches(dag.container().from_(NODE_IMAGE), NODE_CACHES)
        container = container.with_directory("/src", self.source).with_workdir("/src/frontend")
        container = container.with_env_variable("COREPACK_HOME", "/root/.cache/corepack")
        container = container.with_exec(["npm", "install", "--global", "corepack@0.34.5"])
        container = container.with_exec(["corepack", "enable"])
        return container.with_exec(["pnpm", "install", "--frozen-lockfile"])

    def _with_uv(self, container: Container) -> Container:
        uv = dag.container().from_(UV_IMAGE).file("/uv")
        container = container.with_file("/usr/local/bin/uv", uv)
        container = container.with_env_variable("UV_PYTHON", "3.13.5")
        return container.with_env_variable("SSL_CERT_FILE", "/etc/ssl/certs/ca-certificates.crt")

    def _release_base(self) -> Container:
        container = mount_caches(self._with_uv(self._node()), QUALITY_CACHES[:1])
        edgeproc = dag.git(EDGEPROC_REPO).commit(EDGEPROC_COMMIT).tree()
        container = container.with_directory("/edgeproc", edgeproc)
        container = container.with_exec(
            ["uv", "sync", "--project", "/edgeproc", "--extra", "bundles"]
        )
        container = container.with_exec(["node", "app/scripts/download-model.mjs"])
        return container

    def _signed_release(self, signing_key: Secret, version: str, kind: ReleaseKind) -> Container:
        fallback = 0 if kind is ReleaseKind.WATCHLIST else whole_bundle_fallback_days(kind)
        container = self._release_base()
        container = container.with_secret_variable("WATCHLIST_SIGNING_KEY", signing_key)
        container = container.with_env_variable("VERSION", version)
        container = container.with_env_variable("FALLBACK_DAYS", str(fallback))
        container = container.with_env_variable("LIVE_BUNDLE", f"{LIVE_ORIGIN}/bundle/origin")
        container = container.with_env_variable("PUBLIC_KEY", PUBLIC_KEY)
        return container.with_exec(["bash", "-ceu", RELEASE_SCRIPT])

    def _release_app(self, release: Directory, source_sha: str, run_id: str) -> Container:
        container = self._node().without_directory("/src/frontend/app/public/bundle/origin")
        container = container.with_directory(
            "/src/frontend/app/public/bundle/origin", release.directory("origin")
        )
        stamp = ["node", "app/scripts/build-identity.mjs", "stamp", "--dist", "app/dist"]
        stamp += ["--sha", source_sha, "--run-id", run_id]
        return container.with_exec(APP_BUILD).with_exec(stamp)

    def _verify_container(
        self, release: Directory, identity: ReleaseIdentity, origin: str
    ) -> Container:
        container = self._node().with_directory("/release", release)
        container = container.with_env_variable("APP_ORIGIN", origin)
        container = container.with_env_variable("SOURCE_SHA", identity.source_sha)
        container = container.with_env_variable("RUN_ID", identity.run_id)
        container = container.with_env_variable("PUBLIC_KEY", PUBLIC_KEY)
        return container

    def _preview_verify(
        self, app: Directory, release: Directory, identity: ReleaseIdentity
    ) -> Container:
        container = self._verify_container(release, identity, "http://preview:4173")
        container = container.with_service_binding("preview", self.preview(app))
        container = container.with_env_variable("ATTEMPTS", "1")
        container = container.with_env_variable("DELAY_SECONDS", "0")
        return container.with_exec(["bash", "-ceu", VERIFY_SCRIPT])

    def _upload(self, app: Directory, token: Secret, account_id: Secret) -> Container:
        container = self._node().with_directory("/deploy", app)
        container = container.with_secret_variable("CLOUDFLARE_API_TOKEN", token)
        container = container.with_secret_variable("CLOUDFLARE_ACCOUNT_ID", account_id)
        return container.with_exec(WRANGLER_DEPLOY)

    def _live_verify(self, release: Directory, identity: ReleaseIdentity) -> Container:
        container = self._verify_container(release, identity, LIVE_ORIGIN)
        container = container.with_env_variable("ATTEMPTS", "10")
        container = container.with_env_variable("DELAY_SECONDS", "15")
        container = container.with_exec(["bash", "-ceu", VERIFY_SCRIPT])
        return container.with_exec(["bash", "-ceu", CANONICAL_SCRIPT])

    async def _publish(
        self,
        request: PublishRequest,
    ) -> str:
        identity = parse_release_identity(request.release_id)
        stamp = release_version("", datetime.now(UTC).date())
        release = self._signed_release(request.signing_key, stamp, request.kind).directory(
            "/release"
        )
        built = self._release_app(release, identity.source_sha, identity.run_id)
        app = built.directory("/src/frontend/app/dist")
        await self._preview_verify(app, release, identity).sync()
        uploaded = await self._upload(app, request.api_token, request.account_id).stdout()
        verified = await self._live_verify(release, identity).stdout()
        return f"{uploaded}\n{verified}"

    @function
    @check
    def secret_scan(self) -> Container:
        """Scan the complete Git history with the current pinned gitleaks rules."""
        container = dag.container().from_(GITLEAKS_IMAGE)
        container = container.with_directory("/repo", self.history)
        container = container.with_directory("/source", self.source)
        container = container.with_exec(["git", "-C", "/repo", "rev-parse", "--git-dir"])
        common = ["--config", "/repo/.gitleaks.toml", "--redact=100"]
        container = container.with_exec(["gitleaks", "dir", *common, "/source"])
        return container.with_exec(["gitleaks", "git", *common, "--log-opts=--all", "/repo"])

    @function
    @check
    def dependency_audit(self) -> Container:
        """Audit the locked frontend dependency graph without suppressions."""
        return self._node().with_exec(["pnpm", "audit", "--audit-level", "low"])

    @function
    @check
    def quality(self) -> Container:
        """Run the repository's complete canonical product gate."""
        container = mount_caches(self._with_uv(self._node()), QUALITY_CACHES)
        container = container.with_exec(["uv", "sync", "--project", "../eval", "--frozen"])
        container = container.with_exec(PLAYWRIGHT_INSTALL)
        return container.with_exec(["pnpm", "run", "gate"])

    @function
    def preview(self, app: Directory) -> Service:
        """Serve an application Directory for pre-upload verification."""
        container = self._node().with_directory("/src/frontend/app/dist", app)
        container = container.with_exposed_port(4173)
        return container.as_service(args=PREVIEW_ARGS)

    @function
    def signed_origin(
        self,
        signing_key: Secret,
        version: str = "",
        code_deploy: bool = False,
    ) -> Directory:
        """Build and verify an isolated, monotonically sequenced signed origin."""
        kind = ReleaseKind.CODE if code_deploy else ReleaseKind.WATCHLIST
        stamp = release_version(version, datetime.now(UTC).date())
        container = self._signed_release(signing_key, stamp, kind)
        return container.directory("/release")

    @function
    def freshness(self) -> Container:
        """Fail closed unless the live signed sanctions origin is fresh."""
        return self._node().with_exec(FRESHNESS_CHECK)

    @function
    def live_verify(self, release: Directory, source_sha: str, run_id: str) -> Container:
        """Verify exact live app, signed bundle, source, run, and canonical identity."""
        identity = release_identity(source_sha, run_id)
        return self._live_verify(release, identity)

    @function
    async def deploy(
        self,
        signing_key: Secret,
        cloudflare_api_token: Secret,
        cloudflare_account_id: Secret,
        release_id: str,
    ) -> str:
        """Build, verify, upload, and live-verify an exact code release."""
        request = PublishRequest(
            ReleaseKind.CODE, signing_key, cloudflare_api_token, cloudflare_account_id, release_id
        )
        return await self._publish(request)

    @function
    async def publish_watchlist(
        self,
        signing_key: Secret,
        cloudflare_api_token: Secret,
        cloudflare_account_id: Secret,
        release_id: str,
    ) -> str:
        request = PublishRequest(
            ReleaseKind.WATCHLIST,
            signing_key,
            cloudflare_api_token,
            cloudflare_account_id,
            release_id,
        )
        return await self._publish(request)
