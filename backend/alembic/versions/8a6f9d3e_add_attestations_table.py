"""Add the attestations table (periodic screening review badges)

Creates ``attestations`` for the periodic-attestation tier. An attestation is a
verifiable record that a customer was screened against the enabled lists at known
versions on ``screened_at`` with a ``status`` (CLEAR / MATCHES_PENDING /
MATCHES_DISPOSITIONED). ``valid_until`` drives the "due for re-review" staleness
query. ``signature``/``signing_key_id``/``algo`` are nullable: an attestation is
signed (detached ed25519 over the canonical payload, reusing the bundle trust root)
only when a signing key is configured; otherwise it is persisted unsigned.

Chains onto ``7e5f8c2d``; the separate ``add_rls_policies`` head is intentionally
left unmerged.

Revision ID: 8a6f9d3e
Revises: 7e5f8c2d
Create Date: 2026-06-06
"""

from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "8a6f9d3e"
down_revision: Union[str, Sequence[str], None] = "7e5f8c2d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create the attestations table and its indexes."""
    op.create_table(
        "attestations",
        sa.Column("attestation_id", sa.String(length=36), nullable=False),
        sa.Column("tenant_id", sa.String(length=100), nullable=False),
        sa.Column("customer_id", sa.String(length=36), nullable=False),
        sa.Column("customer_reference", sa.String(length=200), nullable=False),
        sa.Column("screened_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("valid_until", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column(
            "lists_and_versions", postgresql.JSONB(astext_type=sa.Text()), nullable=False
        ),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("match_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("pending_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("signature", sa.Text(), nullable=True),
        sa.Column("signing_key_id", sa.String(length=200), nullable=True),
        sa.Column("algo", sa.String(length=20), nullable=True),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.tenant_id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["customer_id"], ["customers.customer_id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("attestation_id"),
    )
    op.create_index("idx_attestations_tenant", "attestations", ["tenant_id"])
    op.create_index(
        "idx_attestations_customer", "attestations", ["tenant_id", "customer_id"]
    )
    op.create_index(
        "idx_attestations_valid_until", "attestations", ["tenant_id", "valid_until"]
    )


def downgrade() -> None:
    """Drop the attestations table and its indexes."""
    op.drop_index("idx_attestations_valid_until", table_name="attestations")
    op.drop_index("idx_attestations_customer", table_name="attestations")
    op.drop_index("idx_attestations_tenant", table_name="attestations")
    op.drop_table("attestations")
