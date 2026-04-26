from __future__ import annotations

import re
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field, field_validator, model_validator


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class VariableType(str, Enum):
    continuous = "continuous"
    discrete = "discrete"
    boolean = "boolean"
    categorical = "categorical"
    ordinal = "ordinal"


class ImportanceLevel(str, Enum):
    critical = "critical"
    high = "high"
    medium = "medium"
    low = "low"


class Direction(str, Enum):
    maximize = "maximize"
    minimize = "minimize"
    neutral = "neutral"


class SourceType(str, Enum):
    explicit = "explicit"
    inferred = "inferred"
    domain_prior = "domain_prior"


class ObservabilityType(str, Enum):
    realtime = "realtime"
    lagged = "lagged"
    terminal = "terminal"


class DecisionCategory(str, Enum):
    hiring = "hiring"
    product = "product"
    strategy = "strategy"
    financial = "financial"
    ops = "ops"
    other = "other"


class ConstraintOperator(str, Enum):
    gte = ">="
    lte = "<="
    gt = ">"
    lt = "<"
    eq = "=="
    ne = "!="


class ConstraintType(str, Enum):
    numeric = "numeric"
    categorical = "categorical"
    boolean = "boolean"


# ---------------------------------------------------------------------------
# Sub-models
# ---------------------------------------------------------------------------

class ConstraintV1(BaseModel):
    constraint_id: str
    operator: ConstraintOperator
    target: str  # variable_id
    value: Any
    unit: str | None = None
    is_hard: bool = True
    type: ConstraintType = ConstraintType.numeric


class VariableV1(BaseModel):
    variable_id: str
    name: str
    type: VariableType
    importance: ImportanceLevel
    direction: Direction | None = None
    range: list[float] | None = None
    default_value: float | None = None
    unit: str | None = None
    source: SourceType = SourceType.inferred
    extraction_confidence: float = Field(ge=0.0, le=1.0)
    observability: ObservabilityType = ObservabilityType.lagged
    controlled_by: str | None = None
    affects: list[str] = Field(default_factory=list)  # list of variable_ids
    rationale: str | None = None
    missing_info: str | None = None
    enrichment_needed: bool = False

    @field_validator("range")
    @classmethod
    def range_must_have_two_elements(cls, v):
        if v is not None and len(v) != 2:
            raise ValueError("range must have exactly 2 elements [min, max]")
        return v


class ActionV1(BaseModel):
    action_id: str
    label: str
    is_baseline: bool = False


class AssumptionV1(BaseModel):
    assumption_id: str
    text: str
    fragility: float = Field(default=0.5, ge=0.0, le=1.0)
    variable_ids: list[str] = Field(default_factory=list)


class RiskV1(BaseModel):
    risk_id: str
    text: str
    severity: float = Field(default=0.5, ge=0.0, le=1.0)
    probability: float = Field(default=0.5, ge=0.0, le=1.0)
    variable_ids: list[str] = Field(default_factory=list)


class ConfidenceSummary(BaseModel):
    overall_confidence: float = Field(ge=0.0, le=1.0)
    evidence_strength: float = Field(ge=0.0, le=1.0)
    type_clarity: float = Field(ge=0.0, le=1.0)
    range_clarity: float = Field(ge=0.0, le=1.0)
    dependency_clarity: float = Field(ge=0.0, le=1.0)
    constraint_alignment: float = Field(ge=0.0, le=1.0)


class ValidationSummary(BaseModel):
    hard_passed: bool
    rule_failures: list[dict] = Field(default_factory=list)
    soft_fixes: list[dict] = Field(default_factory=list)
    retry_count: int = 0


class ConsistencyReport(BaseModel):
    cycles: list[list[str]] = Field(default_factory=list)
    temporal_warnings: list[str] = Field(default_factory=list)
    constraint_conflicts: list[str] = Field(default_factory=list)
    overall_score: float = 1.0


class TelemetrySummary(BaseModel):
    pass_latencies_ms: dict[str, int] = Field(default_factory=dict)
    models_used: dict[str, str] = Field(default_factory=dict)
    prompt_versions: dict[str, str] = Field(default_factory=dict)
    total_tokens_in: int = 0
    total_tokens_out: int = 0
    enrichment_applied: bool = False


# ---------------------------------------------------------------------------
# Top-level output contract
# ---------------------------------------------------------------------------

class ExtractionV1_1(BaseModel):
    schema_version: str = "1.1.0"

    # Pass 1 fields
    decision: str
    decision_category: DecisionCategory
    actions: list[ActionV1]
    actors: list[str] = Field(default_factory=list)
    time_horizon: str
    constraints: list[ConstraintV1] = Field(default_factory=list)
    success_criteria: list[str] = Field(default_factory=list)

    # Pass 2 fields
    variables: list[VariableV1] = Field(default_factory=list)

    # Pass 3 fields
    assumptions: list[AssumptionV1] = Field(default_factory=list)
    risks: list[RiskV1] = Field(default_factory=list)
    hidden_deps: list[str] = Field(default_factory=list)
    known_unknowns: list[str] = Field(default_factory=list)

    # Enrichment output
    action_variable_map: dict[str, dict[str, Any]] = Field(default_factory=dict)

    # Metadata
    confidence: ConfidenceSummary | None = None
    validation: ValidationSummary | None = None
    consistency_report: ConsistencyReport | None = None
    telemetry: TelemetrySummary = Field(default_factory=TelemetrySummary)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def generate_variable_id(name: str) -> str:
    """Generate a stable machine key from a variable name.

    Example: "MRR Growth Rate" -> "var_mrr_growth_rate"
    """
    slug = re.sub(r"[^a-z0-9]+", "_", name.lower().strip()).strip("_")
    return f"var_{slug}"
