from __future__ import annotations

from sqlalchemy import ARRAY, Boolean, Column, DateTime, Float, ForeignKey, Index, Integer, JSON, String, Text, UniqueConstraint
from pgvector.sqlalchemy import Vector
from sqlalchemy.orm import DeclarativeBase, relationship


class Base(DeclarativeBase):
    pass


class Decision(Base):
    __tablename__ = "decisions"

    decision_id = Column(String, primary_key=True)
    user_id = Column(String, nullable=True, index=True)
    decision_category = Column(String, nullable=True, index=True)
    title = Column(String, nullable=False, default="Untitled Decision")
    status = Column(String, nullable=False, default="active")
    parent_decision_id = Column(String, ForeignKey("decisions.decision_id"), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, index=True)
    updated_at = Column(DateTime(timezone=True), nullable=False)
    clarify_draft = Column(JSON, nullable=False, default=dict)
    pressure_test = Column(JSON, nullable=True)
    extraction_schema = Column(JSON, nullable=True)
    extraction_session = Column(JSON, nullable=True)
    decision_output = Column(JSON, nullable=True)
    # Pattern Engine v2 scoring columns
    base_score = Column(Float, nullable=True)
    adjusted_score = Column(Float, nullable=True)
    experiment_group = Column(String, nullable=True)  # 'control' | 'treatment'

    simulation_runs = relationship(
        "SimulationRun",
        back_populates="decision",
        cascade="all, delete-orphan",
        lazy="raise",
    )
    failure_analysis = relationship(
        "FailureAnalysis",
        back_populates="decision",
        uselist=False,
        cascade="all, delete-orphan",
        lazy="raise",
    )


class SimulationRun(Base):
    __tablename__ = "simulation_runs"

    id = Column(String, primary_key=True)
    decision_id = Column(
        String,
        ForeignKey("decisions.decision_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    variables = Column(JSON, nullable=False)
    results = Column(JSON, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False)

    decision = relationship("Decision", back_populates="simulation_runs", lazy="raise")


class FailureAnalysis(Base):
    __tablename__ = "failure_analyses"

    id = Column(String, primary_key=True)
    decision_id = Column(
        String,
        ForeignKey("decisions.decision_id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    what_happened = Column(Text, nullable=False, default="")
    observations = Column(JSON, nullable=False, default=list)
    failed_assumptions = Column(JSON, nullable=False, default=list)
    root_cause = Column(Text, nullable=False, default="")
    likely_root_cause = Column(Text, nullable=False, default="")
    cognitive_bias = Column(Text, nullable=False, default="")
    missed_variable = Column(Text, nullable=False, default="")
    recommendation = Column(Text, nullable=False, default="")
    failure_type = Column(String, nullable=True)
    assumption_gaps = Column(JSON, nullable=True)
    lessons = Column(JSON, nullable=True)
    snapshot = Column(JSON, nullable=True)
    updated_at = Column(DateTime(timezone=True), nullable=False)

    decision = relationship("Decision", back_populates="failure_analysis", lazy="raise")


class PatternProfile(Base):
    __tablename__ = "pattern_profiles"

    user_id = Column(String, primary_key=True)
    patterns = Column(JSON, nullable=False, default=list)  # legacy flat array — preserved
    themes = Column(JSON, nullable=True)                   # new nested shape (themes[])
    blend_weight = Column(Float, nullable=False, default=0.0)
    n_decisions = Column(Integer, nullable=False, default=0)
    n_outcomes = Column(Integer, nullable=False, default=0)
    updated_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=True)
    version = Column(Integer, nullable=False, default=1)


class AggregatePattern(Base):
    __tablename__ = "aggregate_patterns"

    id = Column(String, primary_key=True)
    pattern_type = Column(String, nullable=False)
    decision_category = Column(String, nullable=False, index=True)
    failure_mode = Column(String, nullable=False)
    hold_rate = Column(Float, nullable=False, default=0.5)
    n_samples = Column(Integer, nullable=False, default=0)
    n_contributors = Column(Integer, nullable=False, default=0)
    severity_distribution = Column(JSON, nullable=True)
    cohort_breakdown = Column(JSON, nullable=True)
    confidence_floor = Column(Float, nullable=False, default=0.0)
    embedding = Column(Vector(384), nullable=True)
    last_updated = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        UniqueConstraint("pattern_type", "decision_category", "failure_mode", name="uq_aggregate_pattern"),
    )


class PatternInjectionLog(Base):
    __tablename__ = "pattern_injection_log"

    log_id = Column(String, primary_key=True)
    decision_id = Column(String, ForeignKey("decisions.decision_id"), nullable=False, index=True)
    user_id = Column(String, nullable=False, index=True)
    blend_weight = Column(Float, nullable=False)
    patterns_considered = Column(JSON, nullable=True)   # list[str] UUIDs
    patterns_injected = Column(JSON, nullable=True)     # list[str] UUIDs
    patterns_rejected = Column(JSON, nullable=True)
    lambda_base = Column(JSON, nullable=False)
    lambda_adjusted = Column(JSON, nullable=True)
    experiment_group = Column(String, nullable=True)    # 'control' | 'treatment'
    pass3_injected = Column(Boolean, nullable=False, default=False)
    enrichment_gaps_added = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), nullable=True, index=True)


class PatternContributionLog(Base):
    __tablename__ = "pattern_contribution_log"

    id = Column(String, primary_key=True)
    user_id = Column(String, nullable=False, index=True)
    pattern_type = Column(String, nullable=False)
    category = Column(String, nullable=False)
    contributed_at = Column(DateTime(timezone=True), nullable=True)


class ExtractionMemory(Base):
    __tablename__ = "extraction_memory"

    id = Column(String, primary_key=True)
    decision_category = Column(String, nullable=True, index=True)
    overall_confidence = Column(Float, nullable=False)
    schema_json = Column(JSON, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, index=True)
    embedding = Column(Vector(384), nullable=True)
    consistency_score = Column(Float, nullable=True)


class PatternInstance(Base):
    """Raw evidence store — one row per classified input occurrence."""
    __tablename__ = "pattern_instances"
    __table_args__ = (
        UniqueConstraint("user_id", "decision_id", "slug", "raw_text_hash", name="uq_pattern_instance"),
        Index("ix_pi_user_slug_created", "user_id", "slug", "created_at"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String, nullable=False, index=True)
    decision_id = Column(String, ForeignKey("decisions.decision_id", ondelete="CASCADE"), nullable=False)
    slug = Column(String, nullable=False)
    statement = Column(Text, nullable=False)
    field_type = Column(String, nullable=False)   # assumption|constraint|context|pt_answer|failure_intake
    source = Column(String, nullable=False)       # clarify|pressure_test|failure_analysis
    raw_text = Column(String(500), nullable=False)
    raw_text_hash = Column(String(64), nullable=False)  # sha256[:32]
    created_at = Column(DateTime(timezone=True), nullable=False)
