"""Add Row Level Security (RLS) policies for tenant isolation.

Revision ID: add_rls_policies
Revises: e733f800e9ca
Create Date: 2025-01-15
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_rls_policies'
down_revision = 'e733f800e9ca'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Enable RLS and create policies for tenant isolation."""
    # Enable RLS on tenant-scoped tables
    op.execute("ALTER TABLE entities ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE tenant_list_configs ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE scoring_policies ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE search_requests ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE usage_meters ENABLE ROW LEVEL SECURITY")

    # Create policies for entities table
    # Global entities (tenant_id IS NULL) are visible to all
    # Tenant-specific entities are only visible to that tenant
    op.execute("""
        CREATE POLICY entities_tenant_isolation ON entities
        FOR ALL
        USING (
            tenant_id IS NULL OR
            tenant_id = current_setting('app.current_tenant_id', true)::text
        )
    """)

    # Create policies for tenant_list_configs
    op.execute("""
        CREATE POLICY tenant_list_configs_isolation ON tenant_list_configs
        FOR ALL
        USING (tenant_id = current_setting('app.current_tenant_id', true)::text)
    """)

    # Create policies for scoring_policies
    op.execute("""
        CREATE POLICY scoring_policies_isolation ON scoring_policies
        FOR ALL
        USING (tenant_id = current_setting('app.current_tenant_id', true)::text)
    """)

    # Create policies for search_requests
    op.execute("""
        CREATE POLICY search_requests_isolation ON search_requests
        FOR ALL
        USING (tenant_id = current_setting('app.current_tenant_id', true)::text)
    """)

    # Create policies for api_keys
    op.execute("""
        CREATE POLICY api_keys_isolation ON api_keys
        FOR ALL
        USING (tenant_id = current_setting('app.current_tenant_id', true)::text)
    """)

    # Create policies for usage_meters
    op.execute("""
        CREATE POLICY usage_meters_isolation ON usage_meters
        FOR ALL
        USING (tenant_id = current_setting('app.current_tenant_id', true)::text)
    """)


def downgrade() -> None:
    """Remove RLS policies and disable RLS."""
    # Drop policies
    op.execute("DROP POLICY IF EXISTS entities_tenant_isolation ON entities")
    op.execute("DROP POLICY IF EXISTS tenant_list_configs_isolation ON tenant_list_configs")
    op.execute("DROP POLICY IF EXISTS scoring_policies_isolation ON scoring_policies")
    op.execute("DROP POLICY IF EXISTS search_requests_isolation ON search_requests")
    op.execute("DROP POLICY IF EXISTS api_keys_isolation ON api_keys")
    op.execute("DROP POLICY IF EXISTS usage_meters_isolation ON usage_meters")

    # Disable RLS
    op.execute("ALTER TABLE entities DISABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE tenant_list_configs DISABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE scoring_policies DISABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE search_requests DISABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE api_keys DISABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE usage_meters DISABLE ROW LEVEL SECURITY")

