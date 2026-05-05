from __future__ import annotations

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, JSON, String, Text
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
    decision_output = Column(JSON, nullable=True)

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
    patterns = Column(JSON, nullable=False, default=list)
    updated_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=True)
    version = Column(Integer, nullable=False, default=1)


class ExtractionMemory(Base):
    __tablename__ = "extraction_memory"

    id = Column(String, primary_key=True)
    decision_category = Column(String, nullable=True, index=True)
    overall_confidence = Column(Float, nullable=False)
    schema_json = Column(JSON, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, index=True)
