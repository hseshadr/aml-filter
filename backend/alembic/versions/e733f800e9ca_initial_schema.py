"""Initial schema

Revision ID: e733f800e9ca
Revises: 
Create Date: 2025-12-28 14:49:59.370974

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'e733f800e9ca'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema - create all tables and indexes."""
    # Enable required extensions
    op.execute('CREATE EXTENSION IF NOT EXISTS vector')
    op.execute('CREATE EXTENSION IF NOT EXISTS pg_trgm')
    op.execute('CREATE EXTENSION IF NOT EXISTS btree_gin')

    # Create tenants table
    op.create_table(
        'tenants',
        sa.Column('tenant_id', sa.String(length=100), nullable=False),
        sa.Column('name', sa.String(length=500), nullable=False),
        sa.Column('plan', sa.String(length=50), nullable=False),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('metadata', postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default='{}'),
        sa.PrimaryKeyConstraint('tenant_id')
    )
    op.create_index('idx_tenants_plan', 'tenants', ['plan'])

    # Create entities table
    op.create_table(
        'entities',
        sa.Column('entity_id', sa.String(length=500), nullable=False),
        sa.Column('tenant_id', sa.String(length=100), nullable=True),
        sa.Column('entity_type', sa.String(length=20), nullable=False),
        sa.Column('primary_name', sa.String(length=500), nullable=False),
        sa.Column('name_canonical', sa.String(length=500), nullable=False),
        sa.Column('name_tokens', postgresql.ARRAY(sa.Text()), nullable=False, server_default='{}'),
        sa.Column('name_trigram', sa.String(length=500), nullable=False),
        sa.Column('aliases', postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default='[]'),
        sa.Column('dob', postgresql.ARRAY(sa.Date()), nullable=True),
        sa.Column('countries', postgresql.ARRAY(sa.String(length=2)), nullable=True),
        sa.Column('nationalities', postgresql.ARRAY(sa.String(length=2)), nullable=True),
        sa.Column('addresses', postgresql.ARRAY(sa.Text()), nullable=True),
        sa.Column('identifiers', postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default='{}'),
        sa.Column('risk_category', sa.String(length=20), nullable=False),
        sa.Column('source_list', sa.String(length=100), nullable=False),
        sa.Column('list_version', sa.String(length=50), nullable=False),
        sa.Column('custom_list_id', sa.String(length=200), nullable=True),
        sa.Column('raw_source', postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default='{}'),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.tenant_id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('entity_id')
    )
    op.create_index('idx_entities_tenant', 'entities', ['tenant_id'], postgresql_where=sa.text('tenant_id IS NOT NULL'))
    op.create_index('idx_entities_source_list', 'entities', ['source_list', 'list_version'])
    op.create_index('idx_entities_risk_category', 'entities', ['risk_category'])
    op.create_index('idx_entities_name_trigram', 'entities', ['name_trigram'], postgresql_using='gin', postgresql_ops={'name_trigram': 'gin_trgm_ops'})
    op.create_index('idx_entities_name_canonical', 'entities', ['name_canonical'])
    op.create_index('idx_entities_entity_type', 'entities', ['entity_type'])

    # Create entity_embeddings table
    # Note: pgvector's Vector type needs to be created directly as vector type
    op.execute("""
        CREATE TABLE entity_embeddings (
            entity_id VARCHAR(500) PRIMARY KEY,
            embedding vector(384),
            embedding_model VARCHAR(100) NOT NULL,
            model_version VARCHAR(50) NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            FOREIGN KEY (entity_id) REFERENCES entities(entity_id) ON DELETE CASCADE
        )
    """)
    # Create HNSW index
    op.execute("""
        CREATE INDEX idx_entity_embeddings_hnsw ON entity_embeddings 
        USING hnsw (embedding vector_cosine_ops)
        WITH (m = 32, ef_construction = 200)
    """)
    op.create_index('idx_entity_embeddings_model', 'entity_embeddings', ['embedding_model', 'model_version'])

    # Create list_versions table
    op.create_table(
        'list_versions',
        sa.Column('list_id', sa.String(length=100), nullable=False),
        sa.Column('version', sa.String(length=50), nullable=False),
        sa.Column('source_url', sa.Text(), nullable=True),
        sa.Column('entity_count', sa.Integer(), nullable=True),
        sa.Column('ingested_at', sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column('activated_at', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('metadata', postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default='{}'),
        sa.PrimaryKeyConstraint('list_id', 'version')
    )
    op.create_index('idx_list_versions_status', 'list_versions', ['list_id', 'status'])
    op.create_index('idx_list_versions_activated', 'list_versions', ['list_id', 'activated_at'])

    # Create tenant_list_configs table
    op.create_table(
        'tenant_list_configs',
        sa.Column('tenant_id', sa.String(length=100), nullable=False),
        sa.Column('list_id', sa.String(length=100), nullable=False),
        sa.Column('enabled', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('version_override', sa.String(length=50), nullable=True),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.tenant_id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('tenant_id', 'list_id')
    )
    op.create_index('idx_tenant_list_configs_enabled', 'tenant_list_configs', ['tenant_id', 'enabled'])

    # Create scoring_policies table
    op.create_table(
        'scoring_policies',
        sa.Column('policy_id', sa.String(length=200), nullable=False),
        sa.Column('tenant_id', sa.String(length=100), nullable=False),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('weights', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('threshold', sa.Numeric(precision=3, scale=2), nullable=False),
        sa.Column('version', sa.Integer(), nullable=False),
        sa.Column('preset', sa.String(length=50), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('created_by', sa.String(length=200), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.tenant_id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('policy_id'),
        sa.UniqueConstraint('tenant_id', 'version')
    )
    op.create_index('idx_scoring_policies_tenant', 'scoring_policies', ['tenant_id', 'is_active'])
    op.create_index('idx_scoring_policies_active', 'scoring_policies', ['tenant_id'], postgresql_where=sa.text('is_active = true'))

    # Create search_requests table
    op.create_table(
        'search_requests',
        sa.Column('request_id', sa.String(length=200), nullable=False),
        sa.Column('tenant_id', sa.String(length=100), nullable=False),
        sa.Column('user_id', sa.String(length=200), nullable=True),
        sa.Column('request_hash', sa.String(length=64), nullable=False),
        sa.Column('query', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('policy_version', sa.Integer(), nullable=True),
        sa.Column('list_versions_used', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('matches', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('execution_time_ms', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.tenant_id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('request_id')
    )
    op.create_index('idx_search_requests_tenant', 'search_requests', ['tenant_id', 'created_at'])
    op.create_index('idx_search_requests_hash', 'search_requests', ['request_hash'])
    op.create_index('idx_search_requests_created', 'search_requests', ['created_at'])

    # Create usage_meters table
    op.create_table(
        'usage_meters',
        sa.Column('usage_id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('tenant_id', sa.String(length=100), nullable=False),
        sa.Column('event_type', sa.String(length=50), nullable=False),
        sa.Column('units', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('request_id', sa.String(length=200), nullable=True),
        sa.Column('job_id', sa.String(length=200), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.tenant_id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('usage_id')
    )
    op.create_index('idx_usage_meters_tenant', 'usage_meters', ['tenant_id', 'created_at'])
    op.create_index('idx_usage_meters_event_type', 'usage_meters', ['tenant_id', 'event_type', 'created_at'])
    # Functional index removed to avoid ambiguous function error with asyncpg
    # op.execute("CREATE INDEX idx_usage_meters_period ON usage_meters (tenant_id, date_trunc('month', created_at))")

    # Create api_keys table
    op.create_table(
        'api_keys',
        sa.Column('key_id', sa.String(length=200), nullable=False),
        sa.Column('tenant_id', sa.String(length=100), nullable=False),
        sa.Column('key_hash', sa.String(length=255), nullable=False),
        sa.Column('name', sa.String(length=200), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('expires_at', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column('revoked_at', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column('last_used_at', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.tenant_id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('key_id')
    )
    op.create_index('idx_api_keys_hash', 'api_keys', ['key_hash'], postgresql_where=sa.text('revoked_at IS NULL'))
    op.create_index('idx_api_keys_tenant', 'api_keys', ['tenant_id', 'revoked_at'])


def downgrade() -> None:
    """Downgrade schema - drop all tables."""
    op.drop_index('idx_api_keys_tenant', table_name='api_keys')
    op.drop_index('idx_api_keys_hash', table_name='api_keys')
    op.drop_table('api_keys')
    op.drop_index('idx_usage_meters_period', table_name='usage_meters')
    op.drop_index('idx_usage_meters_event_type', table_name='usage_meters')
    op.drop_index('idx_usage_meters_tenant', table_name='usage_meters')
    op.drop_table('usage_meters')
    op.drop_index('idx_search_requests_created', table_name='search_requests')
    op.drop_index('idx_search_requests_hash', table_name='search_requests')
    op.drop_index('idx_search_requests_tenant', table_name='search_requests')
    op.drop_table('search_requests')
    op.drop_index('idx_scoring_policies_active', table_name='scoring_policies')
    op.drop_index('idx_scoring_policies_tenant', table_name='scoring_policies')
    op.drop_table('scoring_policies')
    op.drop_index('idx_tenant_list_configs_enabled', table_name='tenant_list_configs')
    op.drop_table('tenant_list_configs')
    op.drop_index('idx_list_versions_activated', table_name='list_versions')
    op.drop_index('idx_list_versions_status', table_name='list_versions')
    op.drop_table('list_versions')
    op.drop_index('idx_entity_embeddings_model', table_name='entity_embeddings')
    op.execute('DROP INDEX IF EXISTS idx_entity_embeddings_hnsw')
    op.drop_table('entity_embeddings')
    op.drop_index('idx_entities_entity_type', table_name='entities')
    op.drop_index('idx_entities_name_canonical', table_name='entities')
    op.drop_index('idx_entities_name_trigram', table_name='entities')
    op.drop_index('idx_entities_risk_category', table_name='entities')
    op.drop_index('idx_entities_source_list', table_name='entities')
    op.drop_index('idx_entities_tenant', table_name='entities')
    op.drop_table('entities')
    op.drop_index('idx_tenants_plan', table_name='tenants')
    op.drop_table('tenants')
