"""Add batch_jobs table

Revision ID: 3a1b2c3d
Revises: 2ee008d0
Create Date: 2025-01-15
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '3a1b2c3d'
down_revision: Union[str, Sequence[str], None] = '2ee008d0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add batch_jobs table and indexes."""
    op.create_table(
        'batch_jobs',
        sa.Column('job_id', sa.String(length=36), nullable=False),
        sa.Column('tenant_id', sa.String(length=100), nullable=False),
        sa.Column('job_name', sa.String(length=200), nullable=True),
        sa.Column('status', sa.String(length=20), server_default='PENDING', nullable=False),
        sa.Column('total_records', sa.Integer(), server_default='0', nullable=False),
        sa.Column('processed_records', sa.Integer(), server_default='0', nullable=False),
        sa.Column('matches_found', sa.Integer(), server_default='0', nullable=False),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('started_at', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column('completed_at', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('metadata', postgresql.JSONB(astext_type=sa.Text()), server_default='{}', nullable=False),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.tenant_id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('job_id')
    )
    
    # Create indexes
    op.create_index('idx_batch_jobs_tenant', 'batch_jobs', ['tenant_id', 'status'])
    op.create_index('idx_batch_jobs_status', 'batch_jobs', ['status', 'created_at'])


def downgrade() -> None:
    """Remove batch_jobs table."""
    op.drop_index('idx_batch_jobs_status', table_name='batch_jobs')
    op.drop_index('idx_batch_jobs_tenant', table_name='batch_jobs')
    op.drop_table('batch_jobs')

