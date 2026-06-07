#!/usr/bin/env python3
"""Mint a matching ed25519 keypair for the attestation signing/verify pin.

Writes the raw private key and its raw public half to the two given paths, reusing
edge-proc's ``generate_keypair`` (the same crypto the bundle trust root uses). The
public file becomes ``VERIFY_KEY_PATH`` (the pinned trust root) and the private file
``ATTESTATION_SIGNING_KEY_PATH``; ``assert_signing_pair_pinned`` checks the public
half of the private key equals the public file, so a freshly-minted pair satisfies
the app's fail-closed startup pin. Idempotent: if both files already exist, do nothing.

Usage::

    uv run python scripts/gen_attestation_keypair.py <private_path> <public_path>
"""

from __future__ import annotations

import sys
from pathlib import Path

from edgeproc.bundles.signing import generate_keypair

_EXPECTED_ARGC = 3  # script name + private path + public path


def main() -> None:
    """Write a matching ed25519 (private, public) raw keypair to the two argv paths."""
    if len(sys.argv) != _EXPECTED_ARGC:
        raise SystemExit("usage: gen_attestation_keypair.py <private_path> <public_path>")
    private_path = Path(sys.argv[1])
    public_path = Path(sys.argv[2])
    if private_path.is_file() and public_path.is_file():
        print(f"✓ Keypair already present: {private_path}, {public_path}")
        return
    private, public = generate_keypair()
    private_path.parent.mkdir(parents=True, exist_ok=True)
    public_path.parent.mkdir(parents=True, exist_ok=True)
    private_path.write_bytes(private.private_bytes_raw())
    public_path.write_bytes(public.public_bytes_raw())
    print(f"✓ Wrote ed25519 keypair: private={private_path} public={public_path}")


if __name__ == "__main__":
    main()
