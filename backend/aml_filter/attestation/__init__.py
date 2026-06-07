"""Periodic screening-attestation (review-badge) tier.

Builds a verifiable record that a customer was screened against the enabled lists
at known versions on a date, with a result. Reuses the bundle ed25519 trust root to
optionally sign each attestation so a badge is independently verifiable.
"""
