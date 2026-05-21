"""SQLAlchemy database models."""

from datetime import date, datetime
from typing import Any

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    ARRAY,
    TIMESTAMP,
    Boolean,
    Date,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy.sql import func


class Base(DeclarativeBase):
    """SQLAlchemy declarative base class."""

    pass


class Tenant(Base):
    """Tenant (organization) model."""

    __tablename__ = "tenants"

    tenant_id: Mapped[str] = mapped_column(String(100), primary_key=True)
    name: Mapped[str] = mapped_column(String(500), nullable=False)
    plan: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # starter, professional, enterprise
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
    metadata_json: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSONB, default=dict, nullable=False
    )

    # Relationships
    list_configs: Mapped[list["TenantListConfig"]] = relationship(
        "TenantListConfig", back_populates="tenant", cascade="all, delete-orphan"
    )
    scoring_policies: Mapped[list["ScoringPolicy"]] = relationship(
        "ScoringPolicy", back_populates="tenant", cascade="all, delete-orphan"
    )
    search_requests: Mapped[list["SearchRequest"]] = relationship(
        "SearchRequest", back_populates="tenant", cascade="all, delete-orphan"
    )

    __table_args__ = (Index("idx_tenants_plan", "plan"),)


class Entity(Base):
    """Entity model for screened entities."""

    __tablename__ = "entities"

    entity_id: Mapped[str] = mapped_column(String(500), primary_key=True)
    tenant_id: Mapped[str | None] = mapped_column(
        String(100), ForeignKey("tenants.tenant_id", ondelete="CASCADE"), nullable=True
    )
    entity_type: Mapped[str] = mapped_column(String(20), nullable=False)  # PERSON, ORGANIZATION
    primary_name: Mapped[str] = mapped_column(String(500), nullable=False)
    name_canonical: Mapped[str] = mapped_column(String(500), nullable=False)
    name_tokens: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list, nullable=False)
    name_trigram: Mapped[str] = mapped_column(String(500), nullable=False)
    aliases: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list, nullable=False)
    dob: Mapped[list[date] | None] = mapped_column(ARRAY(Date), nullable=True)
    countries: Mapped[list[str] | None] = mapped_column(ARRAY(String(2)), nullable=True)
    nationalities: Mapped[list[str] | None] = mapped_column(ARRAY(String(2)), nullable=True)
    addresses: Mapped[list[str] | None] = mapped_column(ARRAY(Text), nullable=True)
    identifiers: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, nullable=False)
    risk_category: Mapped[str] = mapped_column(
        String(20), nullable=False
    )  # SANCTION, PEP, CUSTOM, WHITELIST
    source_list: Mapped[str] = mapped_column(String(100), nullable=False)
    list_version: Mapped[str] = mapped_column(String(50), nullable=False)
    custom_list_id: Mapped[str | None] = mapped_column(String(200), nullable=True)
    raw_source: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    # Relationships
    embedding: Mapped["EntityEmbedding | None"] = relationship(
        "EntityEmbedding", back_populates="entity", cascade="all, delete-orphan", uselist=False
    )

    __table_args__ = (
        Index("idx_entities_tenant", "tenant_id", postgresql_where=tenant_id.isnot(None)),
        Index("idx_entities_source_list", "source_list", "list_version"),
        Index("idx_entities_risk_category", "risk_category"),
        Index(
            "idx_entities_name_trigram",
            "name_trigram",
            postgresql_using="gin",
            postgresql_ops={"name_trigram": "gin_trgm_ops"},
        ),
        Index("idx_entities_name_canonical", "name_canonical"),
        Index("idx_entities_entity_type", "entity_type"),
    )


class EntityEmbedding(Base):
    """Entity embedding model for vector storage."""

    __tablename__ = "entity_embeddings"

    entity_id: Mapped[str] = mapped_column(
        String(500), ForeignKey("entities.entity_id", ondelete="CASCADE"), primary_key=True
    )
    embedding: Mapped[list[float] | None] = mapped_column(Vector(384), nullable=True)
    embedding_model: Mapped[str] = mapped_column(String(100), nullable=False)
    model_version: Mapped[str] = mapped_column(String(50), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )

    # Relationships
    entity: Mapped["Entity"] = relationship("Entity", back_populates="embedding")

    __table_args__ = (
        Index(
            "idx_entity_embeddings_hnsw",
            "embedding",
            postgresql_using="hnsw",
            postgresql_with={"m": 32, "ef_construction": 200},
            postgresql_ops={"embedding": "vector_cosine_ops"},
        ),
        Index("idx_entity_embeddings_model", "embedding_model", "model_version"),
    )


class ListVersion(Base):
    """List version tracking model."""

    __tablename__ = "list_versions"

    list_id: Mapped[str] = mapped_column(String(100), primary_key=True)
    version: Mapped[str] = mapped_column(String(50), primary_key=True)
    source_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    entity_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    ingested_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False)
    activated_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False)  # PENDING, ACTIVE, ARCHIVED
    metadata_json: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSONB, default=dict, nullable=False
    )

    __table_args__ = (
        Index("idx_list_versions_status", "list_id", "status"),
        Index("idx_list_versions_activated", "list_id", "activated_at"),
    )


class TenantListConfig(Base):
    """Tenant list configuration model."""

    __tablename__ = "tenant_list_configs"

    tenant_id: Mapped[str] = mapped_column(
        String(100), ForeignKey("tenants.tenant_id", ondelete="CASCADE"), primary_key=True
    )
    list_id: Mapped[str] = mapped_column(String(100), primary_key=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    version_override: Mapped[str | None] = mapped_column(String(50), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    # Relationships
    tenant: Mapped["Tenant"] = relationship("Tenant", back_populates="list_configs")

    __table_args__ = (Index("idx_tenant_list_configs_enabled", "tenant_id", "enabled"),)


class ScoringPolicy(Base):
    """Scoring policy model."""

    __tablename__ = "scoring_policies"

    policy_id: Mapped[str] = mapped_column(String(200), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(
        String(100), ForeignKey("tenants.tenant_id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    weights: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    threshold: Mapped[float] = mapped_column(Numeric(3, 2), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    preset: Mapped[str | None] = mapped_column(String(50), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )
    created_by: Mapped[str | None] = mapped_column(String(200), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Relationships
    tenant: Mapped["Tenant"] = relationship("Tenant", back_populates="scoring_policies")

    __table_args__ = (
        Index("idx_scoring_policies_tenant", "tenant_id", "is_active"),
        Index(
            "idx_scoring_policies_active",
            "tenant_id",
            postgresql_where=is_active.is_(True),
        ),
        UniqueConstraint("tenant_id", "version"),
    )


class SearchRequest(Base):
    """Search request audit model."""

    __tablename__ = "search_requests"

    request_id: Mapped[str] = mapped_column(String(200), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(
        String(100), ForeignKey("tenants.tenant_id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[str | None] = mapped_column(String(200), nullable=True)
    request_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    query: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    policy_version: Mapped[int | None] = mapped_column(Integer, nullable=True)
    list_versions_used: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    matches: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )
    execution_time_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Relationships
    tenant: Mapped["Tenant"] = relationship("Tenant", back_populates="search_requests")

    __table_args__ = (
        Index("idx_search_requests_tenant", "tenant_id", "created_at"),
        Index("idx_search_requests_hash", "request_hash"),
        Index("idx_search_requests_created", "created_at"),
    )


class UsageMeter(Base):
    """Usage metering model."""

    __tablename__ = "usage_meters"

    usage_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[str] = mapped_column(
        String(100), ForeignKey("tenants.tenant_id", ondelete="CASCADE"), nullable=False
    )
    event_type: Mapped[str] = mapped_column(String(50), nullable=False)
    units: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    request_id: Mapped[str | None] = mapped_column(String(200), nullable=True)
    job_id: Mapped[str | None] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        Index("idx_usage_meters_tenant", "tenant_id", "created_at"),
        Index("idx_usage_meters_event_type", "tenant_id", "event_type", "created_at"),
    )


class ApiKey(Base):
    """API key model."""

    __tablename__ = "api_keys"

    key_id: Mapped[str] = mapped_column(String(200), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(
        String(100), ForeignKey("tenants.tenant_id", ondelete="CASCADE"), nullable=False
    )
    key_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )
    expires_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
    last_used_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True), nullable=True)

    __table_args__ = (
        Index(
            "idx_api_keys_hash",
            "key_hash",
            postgresql_where=revoked_at.is_(None),
        ),
        Index("idx_api_keys_tenant", "tenant_id", "revoked_at"),
    )


class WhitelistBlacklistMatch(Base):
    """Match between whitelist customer and blacklist entity."""

    __tablename__ = "whitelist_blacklist_matches"

    match_id: Mapped[str] = mapped_column(String(36), primary_key=True)  # UUID as string
    tenant_id: Mapped[str] = mapped_column(
        String(100), ForeignKey("tenants.tenant_id", ondelete="CASCADE"), nullable=False
    )
    whitelist_entity_id: Mapped[str] = mapped_column(
        String(500), ForeignKey("entities.entity_id", ondelete="CASCADE"), nullable=False
    )
    blacklist_entity_id: Mapped[str] = mapped_column(
        String(500), ForeignKey("entities.entity_id", ondelete="CASCADE"), nullable=False
    )
    match_score: Mapped[float] = mapped_column(Numeric(5, 4), nullable=False)
    match_type: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # WHITELIST_VS_BLACKLIST, BLACKLIST_VS_WHITELIST
    list_version: Mapped[str | None] = mapped_column(String(50), nullable=True)
    detected_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )
    notified_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
    resolution_status: Mapped[str | None] = mapped_column(
        String(20), nullable=True
    )  # PENDING, FALSE_POSITIVE, TRUE_POSITIVE, RESOLVED
    metadata_json: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSONB, default=dict, nullable=False
    )

    __table_args__ = (
        Index("idx_wb_matches_tenant", "tenant_id"),
        Index("idx_wb_matches_detected", "detected_at"),
        Index("idx_wb_matches_status", "resolution_status"),
        Index("idx_wb_matches_whitelist", "whitelist_entity_id"),
        Index("idx_wb_matches_blacklist", "blacklist_entity_id"),
    )


class ScreeningJob(Base):
    """Background job for bidirectional screening."""

    __tablename__ = "screening_jobs"

    job_id: Mapped[str] = mapped_column(String(36), primary_key=True)  # UUID as string
    tenant_id: Mapped[str | None] = mapped_column(
        String(100), ForeignKey("tenants.tenant_id", ondelete="CASCADE"), nullable=True
    )
    job_type: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # WHITELIST_SCAN, BLACKLIST_SCAN, BIDIRECTIONAL
    trigger_type: Mapped[str | None] = mapped_column(
        String(50), nullable=True
    )  # LIST_UPDATE, MANUAL, SCHEDULED
    list_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    list_version: Mapped[str | None] = mapped_column(String(50), nullable=True)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False
    )  # PENDING, RUNNING, COMPLETED, FAILED
    entities_scanned: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    matches_found: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    started_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    metadata_json: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSONB, default=dict, nullable=False
    )

    __table_args__ = (
        Index("idx_screening_jobs_tenant", "tenant_id"),
        Index("idx_screening_jobs_status", "status"),
        Index("idx_screening_jobs_type", "job_type"),
        Index("idx_screening_jobs_started", "started_at"),
    )


class BatchJob(Base):
    """Batch screening job model."""

    __tablename__ = "batch_jobs"

    job_id: Mapped[str] = mapped_column(String(36), primary_key=True)  # UUID as string
    tenant_id: Mapped[str] = mapped_column(
        String(100), ForeignKey("tenants.tenant_id", ondelete="CASCADE"), nullable=False
    )
    job_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    status: Mapped[str] = mapped_column(
        String(20), default="PENDING", nullable=False
    )  # PENDING, RUNNING, COMPLETED, FAILED
    total_records: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    processed_records: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    matches_found: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )
    started_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    metadata_json: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSONB, default=dict, nullable=False
    )

    tenant: Mapped["Tenant"] = relationship("Tenant")

    __table_args__ = (
        Index("idx_batch_jobs_tenant", "tenant_id", "status"),
        Index("idx_batch_jobs_status", "status", "created_at"),
    )
