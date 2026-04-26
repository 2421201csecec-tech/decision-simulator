from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class RuleResult:
    passed: bool
    rule_id: str
    message: str = ""
    re_run_pass: int = 0          # which LLM pass to re-run on failure (0 = n/a)
    field_path: str = ""          # dotted path to the offending field
    repaired_schema: dict = field(default_factory=dict)  # schema after soft fix applied
    fix_description: str = ""     # human-readable description of the auto-fix


@dataclass
class ValidationResult:
    passed: bool
    hard_errors: list[dict] = field(default_factory=list)
    soft_fixes: list[dict] = field(default_factory=list)
    warnings: list[dict] = field(default_factory=list)
    schema: dict = field(default_factory=dict)  # schema after soft fixes applied
