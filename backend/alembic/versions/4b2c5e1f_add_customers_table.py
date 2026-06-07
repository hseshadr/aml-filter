"""Add customers table

Revision ID: 4b2c5e1f
Revises: 3a1b2c3d
Create Date: 2026-06-06
"""

from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "4b2c5e1f"
down_revision: Union[str, Sequence[str], None] = "3a1b2c3d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add the customers table, its unique reference constraint, and indexes."""
    op.create_table(
        "customers",
        sa.Column("customer_id", sa.String(length=36), nullable=False),
        sa.Column("tenant_id", sa.String(length=100), nullable=False),
        sa.Column("customer_reference", sa.String(length=200), nullable=False),
        sa.Column(
            "onboarding_status", sa.String(length=20), server_default="DRAFT", nullable=False
        ),
        sa.Column("kyc_risk_rating", sa.String(length=10), nullable=True),
        sa.Column(
            "id_documents",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default="[]",
            nullable=False,
        ),
        sa.Column("onboarded_by", sa.String(length=200), nullable=False),
        sa.Column("screening_entity_id", sa.String(length=500), nullable=True),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.tenant_id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["screening_entity_id"], ["entities.entity_id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("customer_id"),
        sa.UniqueConstraint(
            "tenant_id", "customer_reference", name="uq_customers_tenant_reference"
        ),
    )
    op.create_index("idx_customers_tenant", "customers", ["tenant_id"])
    op.create_index("idx_customers_status", "customers", ["onboarding_status"])
    op.create_index("idx_customers_screening_entity", "customers", ["screening_entity_id"])


def downgrade() -> None:
    """Remove the customers table and its indexes."""
    op.drop_index("idx_customers_screening_entity", table_name="customers")
    op.drop_index("idx_customers_status", table_name="customers")
    op.drop_index("idx_customers_tenant", table_name="customers")
    op.drop_table("customers")
