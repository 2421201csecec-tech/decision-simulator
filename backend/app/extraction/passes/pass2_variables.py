from __future__ import annotations

import json
import logging
import time
from pathlib import Path

from app.config import settings
from app.extraction.schemas import generate_variable_id
from app.extraction.telemetry.emitter import emit_pass
from .llm_client import call_llm, LLMError

logger = logging.getLogger("extraction.pass2")

_PROMPT_DIR = Path(__file__).parent.parent / "prompts"
_PASS_NUM = 2
_MAX_TOKENS = 2500


class PassParseError(Exception):
    pass


def _load_prompt() -> str:
    path = _PROMPT_DIR / f"pass2_v{settings.prompt_version}.txt"
    return path.read_text(encoding="utf-8")


def _inject_variable_ids(variables: list[dict]) -> list[dict]:
    """Backend owns variable_id generation. LLM outputs name only."""
    seen: dict[str, int] = {}
    for var in variables:
        name = var.get("name", "unknown")
        base_id = generate_variable_id(name)
        # Deduplicate: append _2, _3 if same id appears more than once
        if base_id in seen:
            seen[base_id] += 1
            var["variable_id"] = f"{base_id}_{seen[base_id]}"
        else:
            seen[base_id] = 1
            var["variable_id"] = base_id
    return variables


def _break_cycles(variables: list[dict]) -> list[dict]:
    """Remove affects[] edges that form cycles. LLMs often get causal direction wrong."""
    try:
        import networkx as nx
    except ImportError:
        return variables

    id_to_var = {v["variable_id"]: v for v in variables if v.get("variable_id")}
    G = nx.DiGraph()
    for var in variables:
        vid = var.get("variable_id")
        if vid:
            G.add_node(vid)
            for target in var.get("affects", []):
                G.add_edge(vid, target)

    removed = []
    while True:
        cycles = list(nx.simple_cycles(G))
        if not cycles:
            break
        cycle = cycles[0]
        # Remove the last edge in the cycle (u → cycle[0])
        u, v = cycle[-1], cycle[0]
        G.remove_edge(u, v)
        removed.append((u, v))

    if removed:
        logger.info("cycle-breaker removed %d affects[] edge(s): %s", len(removed), removed)
        for var in variables:
            vid = var.get("variable_id")
            if vid and vid in id_to_var:
                var["affects"] = list(G.successors(vid))

    return variables


def _translate_affects_to_ids(variables: list[dict]) -> list[dict]:
    """LLM outputs affects[] as variable names; translate to variable_ids."""
    name_to_id = {v["name"]: v["variable_id"] for v in variables}
    for var in variables:
        resolved = []
        for target_name in var.get("affects", []):
            # Try exact match first, then generate_variable_id of the name
            if target_name in name_to_id:
                resolved.append(name_to_id[target_name])
            else:
                candidate = generate_variable_id(target_name)
                # Only keep if we have that id in the schema
                if candidate in name_to_id.values():
                    resolved.append(candidate)
                # else: drop — V007/V009 will catch broken edges
        var["affects"] = resolved
    return variables


async def run_pass2(
    user_input: str,
    pass1_schema: dict,
    memory_context: str = "",
    error_context: str = "",
) -> list[dict]:
    """Run Pass 2: extract variables[]. Returns list with variable_ids injected.

    Raises PassParseError on bad JSON. Raises LLMError on model failure.
    """
    prompt = _load_prompt().format(
        user_input=user_input,
        prior_schema=json.dumps(pass1_schema, indent=2),
        memory_context=memory_context or "No prior context available.",
        error_context=error_context,
    )

    start = time.monotonic()
    raw, model_used, tokens_in, tokens_out = await call_llm(
        prompt, temperature=0.1, max_tokens=_MAX_TOKENS
    )
    latency_ms = int((time.monotonic() - start) * 1000)

    emit_pass(
        pass_num=_PASS_NUM,
        latency_ms=latency_ms,
        model=model_used,
        prompt_version=settings.prompt_version,
        tokens_in=tokens_in,
        tokens_out=tokens_out,
        retry=bool(error_context),
    )

    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip()

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise PassParseError(f"Pass 2 returned invalid JSON: {exc}") from exc

    variables = parsed.get("variables", parsed) if isinstance(parsed, dict) else parsed
    if not isinstance(variables, list):
        raise PassParseError(f"Pass 2: expected variables[] array, got {type(variables)}")

    variables = _inject_variable_ids(variables)
    variables = _translate_affects_to_ids(variables)
    variables = _break_cycles(variables)
    return variables
