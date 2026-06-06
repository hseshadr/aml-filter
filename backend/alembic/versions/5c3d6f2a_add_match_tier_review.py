"""Add match_tier + review metadata to whitelist_blacklist_matches

Revision ID: 5c3d6f2a
Revises: 4b2c5e1f
Create Date: 2026-06-06
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "5c3d6f2a"
down_revision: Union[str, Sequence[str], None] = "4b2c5e1f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add match_tier (indexed) plus reviewer_id and review_notes columns."""
    op.add_column(
        "whitelist_blacklist_matches",
        sa.Column("match_tier", sa.String(length=20), nullable=True),
    )
    op.add_column(
        "whitelist_blacklist_matches",
        sa.Column("reviewer_id", sa.String(length=200), nullable=True),
    )
    op.add_column(
        "whitelist_blacklist_matches",
        sa.Column("review_notes", sa.Text(), nullable=True),
    )
    op.create_index(
        "idx_wb_matches_tier", "whitelist_blacklist_matches", ["match_tier"]
    )


def downgrade() -> None:
    """Drop the tier index and the tier/review columns."""
    op.drop_index("idx_wb_matches_tier", table_name="whitelist_blacklist_matches")
    op.drop_column("whitelist_blacklist_matches", "review_notes")
    op.drop_column("whitelist_blacklist_matches", "reviewer_id")
    op.drop_column("whitelist_blacklist_matches", "match_tier")
