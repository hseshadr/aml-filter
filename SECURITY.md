# Security Policy

aml-filter is a **signing- and verification-adjacent** app: it pins an Ed25519 trust key,
verifies signed, content-addressed watchlist bundles **fail-closed** in the browser tab
before any list is trusted, and does all customer screening locally with no server in the
path. We treat cryptographic and supply-chain issues with the seriousness that posture
demands. If a verification, signature, content-addressing, or trust-pinning path can be
bypassed, weakened, or made to silently accept tampered or unsigned watchlist data, that is
a high-severity bug.

## Reporting a vulnerability

**Please do not open a public GitHub issue, pull request, or discussion for a security
vulnerability** — that discloses it before a fix exists.

Instead, report it privately by email to:

> **harish.seshadri@gmail.com**

Please include, as far as you can:

- A description of the issue and the impact (what a malicious publisher / CDN / network
  attacker could achieve).
- The affected version(s) or commit.
- Steps to reproduce, or a minimal proof of concept.
- Any suggested remediation.

You can expect an acknowledgement within a few days. We will work with you to confirm the
issue, develop a fix, and coordinate disclosure. We are happy to credit you in the release
notes unless you prefer to remain anonymous.

## Supported versions

aml-filter is an engineering-portfolio demo. Security fixes land on `main` and ship in the
next release. We support the **latest released version**; please upgrade to it before
reporting, in case the issue is already fixed.

| Version | Supported          |
| ------- | ------------------ |
| 3.x     | :white_check_mark: |
| < 3.0   | :x:                |

## Scope notes

- The trust model is **pinned-key, fail-closed**: the app trusts only the Ed25519
  `public.key` baked into its own build at
  [`frontend/app/public/public.key`](frontend/app/public/public.key) — never a key carried
  in the bundle. The signed `latest` pointer, the content-addressed manifest, and every
  chunk are verified (Ed25519 + SHA-256) **before** any list is promoted into the running
  engine; the same check re-runs over bytes served from the durable cache. Reports that
  demonstrate trust without the pinned key, signature acceptance after tampering, a
  content-address bypass, or a verification failure turned into a silent fallback are in
  scope and prioritized.
- aml-filter is **not** a compliance product (see [`NOTICE`](NOTICE)). Reports about
  regulatory adequacy of the screening itself are out of scope; reports about the integrity
  of the verify-then-trust pipeline are in scope.
- Issues in third-party dependencies (e.g. `transformers.js`, `@noble/ed25519`,
  `@sqlite.org/sqlite-wasm`) should be reported upstream; if aml-filter's *use* of them is
  the weakness, report it here.
