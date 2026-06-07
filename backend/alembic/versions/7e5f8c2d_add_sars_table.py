"""Add the sars table (Suspicious Activity Reports)

Creates ``sars`` for the SAR filing tier. A SAR is generated for a customer who is a
STRONG match to a sanctioned entity. ``subject`` and ``filer`` are JSONB snapshots so
the report is immutable even if the customer later changes. ``match_id`` is
``varchar(36)`` to match the corrected ``whitelist_blacklist_matches.match_id`` type
(see migration ``6d4e7a1b``). Chains onto ``6d4e7a1b``; the separate ``add_rls_policies``
head is intentionally left unmerged.

Revision ID: 7e5f8c2d
Revises: 6d4e7a1b
Create Date: 2026-06-06
"""

from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "7e5f8c2d"
down_revision: Union[str, Sequence[str], None] = "6d4e7a1b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create the sars table and its indexes."""
    op.create_table(
        "sars",
        sa.Column("sar_id", sa.String(length=36), nullable=False),
        sa.Column("tenant_id", sa.String(length=100), nullable=False),
        sa.Column("customer_id", sa.String(length=36), nullable=False),
        sa.Column("match_id", sa.String(length=36), nullable=False),
        sa.Column("jurisdiction", sa.String(length=10), nullable=False),
        sa.Column("template", sa.String(length=20), nullable=False),
        sa.Column("subject", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("suspicious_activity_narrative", sa.Text(), nullable=True),
        sa.Column("filer", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="DRAFT"),
        sa.Column("created_by", sa.String(length=200), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("filed_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.tenant_id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["customer_id"], ["customers.customer_id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["match_id"], ["whitelist_blacklist_matches.match_id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("sar_id"),
    )
    op.create_index("idx_sars_tenant", "sars", ["tenant_id"])
    op.create_index("idx_sars_customer", "sars", ["customer_id"])
    op.create_index("idx_sars_status", "sars", ["tenant_id", "status"])


def downgrade() -> None:
    """Drop the sars table and its indexes."""
    op.drop_index("idx_sars_status", table_name="sars")
    op.drop_index("idx_sars_customer", table_name="sars")
    op.drop_index("idx_sars_tenant", table_name="sars")
    op.drop_table("sars")
