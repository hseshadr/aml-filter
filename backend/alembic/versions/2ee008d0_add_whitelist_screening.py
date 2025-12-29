"""Add whitelist screening tables

Revision ID: 2ee008d0
Revises: e733f800e9ca
Create Date: 2025-01-15
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '2ee008d0'
down_revision: Union[str, Sequence[str], None] = 'e733f800e9ca'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add whitelist screening tables and indexes."""
    # Create whitelist_blacklist_matches table
    op.create_table(
        'whitelist_blacklist_matches',
        sa.Column('match_id', postgresql.UUID(as_uuid=False), nullable=False),
        sa.Column('tenant_id', sa.String(length=100), nullable=False),
        sa.Column('whitelist_entity_id', sa.String(length=500), nullable=False),
        sa.Column('blacklist_entity_id', sa.String(length=500), nullable=False),
        sa.Column('match_score', sa.Numeric(precision=5, scale=4), nullable=False),
        sa.Column('match_type', sa.String(length=50), nullable=False),
        sa.Column('list_version', sa.String(length=50), nullable=True),
        sa.Column('detected_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('notified_at', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column('resolved_at', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column('resolution_status', sa.String(length=20), nullable=True),
        sa.Column('metadata', postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default='{}'),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.tenant_id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['whitelist_entity_id'], ['entities.entity_id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['blacklist_entity_id'], ['entities.entity_id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('match_id')
    )
    
    # Create screening_jobs table
    op.create_table(
        'screening_jobs',
        sa.Column('job_id', postgresql.UUID(as_uuid=False), nullable=False),
        sa.Column('tenant_id', sa.String(length=100), nullable=True),
        sa.Column('job_type', sa.String(length=50), nullable=False),
        sa.Column('trigger_type', sa.String(length=50), nullable=True),
        sa.Column('list_id', sa.String(length=100), nullable=True),
        sa.Column('list_version', sa.String(length=50), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('entities_scanned', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('matches_found', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('started_at', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column('completed_at', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('metadata', postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default='{}'),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.tenant_id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('job_id')
    )
    
    # Create indexes for whitelist_blacklist_matches
    op.create_index('idx_wb_matches_tenant', 'whitelist_blacklist_matches', ['tenant_id'])
    op.create_index('idx_wb_matches_detected', 'whitelist_blacklist_matches', ['detected_at'])
    op.create_index('idx_wb_matches_status', 'whitelist_blacklist_matches', ['resolution_status'])
    op.create_index('idx_wb_matches_whitelist', 'whitelist_blacklist_matches', ['whitelist_entity_id'])
    op.create_index('idx_wb_matches_blacklist', 'whitelist_blacklist_matches', ['blacklist_entity_id'])
    
    # Create indexes for screening_jobs
    op.create_index('idx_screening_jobs_tenant', 'screening_jobs', ['tenant_id'])
    op.create_index('idx_screening_jobs_status', 'screening_jobs', ['status'])
    op.create_index('idx_screening_jobs_type', 'screening_jobs', ['job_type'])
    op.create_index('idx_screening_jobs_started', 'screening_jobs', ['started_at'])
    
    # Add index on entities.risk_category for whitelist queries (if not exists)
    # Note: This index may already exist from initial migration, but adding it here for clarity
    op.create_index('idx_entities_risk_category_tenant', 'entities', ['risk_category', 'tenant_id'], 
                    postgresql_where=sa.text("risk_category = 'WHITELIST'"))


def downgrade() -> None:
    """Remove whitelist screening tables and indexes."""
    # Drop indexes
    op.drop_index('idx_entities_risk_category_tenant', table_name='entities')
    op.drop_index('idx_screening_jobs_started', table_name='screening_jobs')
    op.drop_index('idx_screening_jobs_type', table_name='screening_jobs')
    op.drop_index('idx_screening_jobs_status', table_name='screening_jobs')
    op.drop_index('idx_screening_jobs_tenant', table_name='screening_jobs')
    op.drop_index('idx_wb_matches_blacklist', table_name='whitelist_blacklist_matches')
    op.drop_index('idx_wb_matches_whitelist', table_name='whitelist_blacklist_matches')
    op.drop_index('idx_wb_matches_status', table_name='whitelist_blacklist_matches')
    op.drop_index('idx_wb_matches_detected', table_name='whitelist_blacklist_matches')
    op.drop_index('idx_wb_matches_tenant', table_name='whitelist_blacklist_matches')
    
    # Drop tables
    op.drop_table('screening_jobs')
    op.drop_table('whitelist_blacklist_matches')

