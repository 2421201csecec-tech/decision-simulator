from __future__ import annotations

from app.pattern_engine.constants import INJECT_THRESHOLD, MAX_PATTERNS_INJECTED


def build_pass3_injection_block(active_patterns: list[dict]) -> str:
    """
    Build the PATTERN_INJECTION_BLOCK string to append to the Pass 3 system prompt.
    Takes top-3 patterns by confidence. Returns "" when no patterns qualify.
    """
    top = [
        p for p in active_patterns
        if float(p.get("confidence", 0)) >= INJECT_THRESHOLD
    ][:MAX_PATTERNS_INJECTED]

    if not top:
        return ""

    lines = [
        "\n\n---\nPATTERN CONTEXT (from user's past failure analyses — use for risk calibration only):"
    ]
    for i, pat in enumerate(top, 1):
        conf = float(pat.get("confidence", 0))
        lines.append(
            f"\n[Pattern {i}] Type: {pat.get('pattern_type', 'unknown')} | "
            f"Confidence: {conf:.2f}\n"
            f"Statement: {pat.get('statement', '')}\n"
            f"Failure mode: {pat.get('failure_mode', '')}"
        )
    lines.append("\nUse these patterns to flag matching risks or assumptions — do not fabricate new variables.")
    return "\n".join(lines)
