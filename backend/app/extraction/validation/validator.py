from __future__ import annotations

import copy

from .result import ValidationResult
from .rules import HARD_RULES, SOFT_RULES


class SchemaValidator:
    def validate(self, schema: dict) -> ValidationResult:
        """Run all 18 rules against schema. HARD rules collect all failures before returning.
        SOFT rules apply auto-fixes in-place and record what changed.
        """
        schema = copy.deepcopy(schema)
        hard_errors: list[dict] = []
        soft_fixes: list[dict] = []
        warnings: list[dict] = []

        for rule_id, rule_fn in HARD_RULES.items():
            result = rule_fn(schema)
            if not result.passed:
                hard_errors.append({
                    "rule_id": rule_id,
                    "message": result.message,
                    "re_run_pass": result.re_run_pass,
                    "field": result.field_path,
                })

        for rule_id, rule_fn in SOFT_RULES.items():
            result = rule_fn(schema)
            if not result.passed:
                if result.repaired_schema:
                    schema = result.repaired_schema
                soft_fixes.append({
                    "rule_id": rule_id,
                    "field": result.field_path,
                    "fix_applied": result.fix_description,
                    "message": result.message,
                })

        return ValidationResult(
            passed=len(hard_errors) == 0,
            hard_errors=hard_errors,
            soft_fixes=soft_fixes,
            warnings=warnings,
            schema=schema,
        )

    def get_error_context(self, result: ValidationResult) -> str:
        """Format hard errors for injection into a retry prompt."""
        lines = ["PREVIOUS ATTEMPT FAILED THESE VALIDATION RULES:"]
        for e in result.hard_errors:
            lines.append(f"- {e['rule_id']}: {e['message']}")
        lines.append("Fix these specific issues. Do not change anything else.")
        return "\n".join(lines)

    def get_passes_to_rerun(self, result: ValidationResult) -> set[int]:
        return {e["re_run_pass"] for e in result.hard_errors if e["re_run_pass"] > 0}
