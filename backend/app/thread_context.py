from __future__ import annotations


def build_thread_context(thread: dict) -> str:
    """
    Build a compacted narrative of this thread for LLM injection.
    Accepts dicts with camelCase keys (clarifyDraft, pressureTest, extractionSchema).
    Returns "" when nothing meaningful is available so callers can skip the section.

    Token budget: ~500 tokens — enough for the LLM to give specific, grounded bullets.
    """
    parts: list[str] = []

    # --- Clarify draft (founder's original framing) ---
    draft = thread.get("clarifyDraft") or {}
    if draft:
        if draft.get("title"):
            parts.append(f"DECISION: {draft['title'][:150]}")
        if draft.get("coreProblem"):
            parts.append(f"CORE PROBLEM: {draft['coreProblem'][:400]}")
        if draft.get("desiredOutcome"):
            parts.append(f"DESIRED OUTCOME: {draft['desiredOutcome'][:250]}")
        if draft.get("context"):
            parts.append(f"CONTEXT: {draft['context'][:400]}")
        constraints = [c[:150] for c in (draft.get("constraints") or []) if c][:5]
        if constraints:
            parts.append("CONSTRAINTS:\n" + "\n".join(f"  - {c}" for c in constraints))
        assumptions = [a[:150] for a in (draft.get("assumptions") or []) if a][:5]
        if assumptions:
            parts.append("FOUNDER ASSUMPTIONS:\n" + "\n".join(f"  - {a}" for a in assumptions))

    # --- Extraction schema highlights (high-signal only) ---
    schema = thread.get("extractionSchema") or {}
    if schema:
        fragile = [
            a for a in (schema.get("assumptions") or [])
            if isinstance(a, dict) and a.get("fragility", 0) >= 0.7
        ][:3]
        if fragile:
            lines = [
                f"  - {a.get('text', '')[:100]} (fragility {a.get('fragility', 0):.2f})"
                for a in fragile
            ]
            parts.append("HIGH FRAGILITY ASSUMPTIONS:\n" + "\n".join(lines))

        high_risks = [
            r for r in (schema.get("risks") or [])
            if isinstance(r, dict) and r.get("severity", 0) >= 0.7
        ][:3]
        if high_risks:
            lines = [
                f"  - {(r.get('description') or r.get('text', ''))[:100]}"
                for r in high_risks
            ]
            parts.append("HIGH SEVERITY RISKS:\n" + "\n".join(lines))

        hdeps: list[str] = []
        for h in (schema.get("hidden_deps") or [])[:2]:
            if isinstance(h, str) and h:
                hdeps.append(h[:80])
            elif isinstance(h, dict):
                text = (h.get("dependency") or h.get("text") or "")[:80]
                if text:
                    hdeps.append(text)
        if hdeps:
            parts.append("HIDDEN DEPENDENCIES: " + "; ".join(hdeps))

    # --- Pressure test responses ---
    # v2: use compact synthesis when available; v1: fall back to raw Q&A
    pressure = thread.get("pressureTest") or {}
    if pressure.get("synthesized") and pressure.get("summary"):
        summary = pressure["summary"]
        beliefs = [b[:100] for b in (summary.get("what_founder_believed") or []) if b][:2]
        commitments = [c[:80] for c in (summary.get("commitments_made") or []) if c][:1]
        unresolved = [u[:80] for u in (summary.get("unresolved_risks") or []) if u][:1]
        if beliefs or commitments:
            lines = [f"  - {b}" for b in beliefs]
            if commitments:
                lines += [f"  - Committed: {c}" for c in commitments]
            if unresolved:
                lines += [f"  - Unresolved: {u}" for u in unresolved]
            parts.append("PRESSURE TEST SYNTHESIS:\n" + "\n".join(lines))
    else:
        # v2 raw (not yet synthesized): pull answers from rootScenarios
        root_scenarios = pressure.get("rootScenarios") or []
        if root_scenarios:
            answered_roots = [
                r for r in root_scenarios
                if r.get("answer") and not r.get("status") == "open"
            ][:5]
            if answered_roots:
                qa_parts = ["PRESSURE TEST — FOUNDER'S RESPONSES:"]
                for root in answered_roots:
                    q = (root.get("question") or "")[:150]
                    a = (root.get("answer") or "")[:300]
                    qa_parts.append(f"  Q: {q}\n  A: {a}")
                parts.append("\n".join(qa_parts))
        else:
            # v1 flat scenarios
            scenarios = {str(s["id"]): s for s in (pressure.get("scenarios") or [])}
            answered = [
                (sid, r)
                for sid, r in (pressure.get("responses") or {}).items()
                if isinstance(r, dict) and not r.get("skipped") and (r.get("answer") or "").strip()
            ][:5]
            if answered:
                qa_parts = ["PRESSURE TEST — FOUNDER'S RESPONSES:"]
                for sid, resp in answered:
                    s = scenarios.get(sid, {})
                    q = (s.get("scenario") or s.get("question") or "")[:150]
                    a = resp["answer"][:300]
                    qa_parts.append(f"  Q: {q}\n  A: {a}")
                parts.append("\n".join(qa_parts))

    return "\n\n".join(parts)
