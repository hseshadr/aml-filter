"""Align whitelist_blacklist_matches.match_id with the ORM (uuid -> varchar(36))

The ORM model declares ``match_id`` as ``String(36)`` (UUID stored as text), but the
original ``2ee008d0`` migration created the column as a native ``uuid``. On a real
migrated database this drift makes ``GET /v1/review/matches`` 500 with a Pydantic
``string_type`` error (asyncpg returns ``uuid.UUID``; ``ReviewMatchRow.match_id`` is a
``str``) and breaks inserts (``varchar`` expression vs ``uuid`` column). This migration
makes the live schema match the model. Scoped strictly to ``match_id``; sibling id
columns and other tables are intentionally untouched.

Revision ID: 6d4e7a1b
Revises: 5c3d6f2a
Create Date: 2026-06-06
"""

from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "6d4e7a1b"
down_revision: Union[str, Sequence[str], None] = "5c3d6f2a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Convert match_id from native uuid to varchar(36) to match the ORM."""
    op.alter_column(
        "whitelist_blacklist_matches",
        "match_id",
        existing_type=postgresql.UUID(as_uuid=False),
        type_=sa.String(length=36),
        existing_nullable=False,
        postgresql_using="match_id::text",
    )


def downgrade() -> None:
    """Restore match_id to native uuid."""
    op.alter_column(
        "whitelist_blacklist_matches",
        "match_id",
        existing_type=sa.String(length=36),
        type_=postgresql.UUID(as_uuid=False),
        existing_nullable=False,
        postgresql_using="match_id::uuid",
    )
