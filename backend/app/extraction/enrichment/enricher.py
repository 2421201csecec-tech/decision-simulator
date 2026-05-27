from __future__ import annotations

import copy
import json
import logging
from pathlib import Path

from app.config import settings
from app.extraction.passes.llm_client import call_llm
from .provenance import EnrichmentAuditRecord

logger = logging.getLogger("extraction.enricher")

_PROMPT_DIR = Path(__file__).parent.parent / "prompts"
_MAX_TOKENS = 4000


def _load_prompt() -> str:
    path = _PROMPT_DIR / f"enrichment_v{settings.prompt_version}.txt"
    return path.read_text(encoding="utf-8")


class Enricher:
    async def enrich(
        self,
        schema: dict,
        user_input: str,
        memory_schemas: list[dict] | None = None,
    ) -> tuple[dict, list[EnrichmentAuditRecord]]:
        """Enrich schema non-destructively. Never overwrites source=explicit fields.

        Returns (enriched_schema, audit_records).
        On any failure returns the original schema unchanged with empty audit.
        """
        original = copy.deepcopy(schema)

        try:
            prompt = _load_prompt().format(
                validated_schema=json.dumps(schema, indent=2),
                user_input=user_input,
                memory_schemas=json.dumps((memory_schemas or [])[:3], indent=2),
            )
            raw, _, _, _ = await call_llm(prompt, temperature=0.2, max_tokens=_MAX_TOKENS, model=settings.llm_fallback_model)

            raw = raw.strip()
            if raw.startswith("```"):
                raw = raw.split("```")[1]
                if raw.startswith("json"):
                    raw = raw[4:]
                raw = raw.strip()

            enriched = json.loads(raw)
        except Exception as exc:
            logger.warning("enrichment failed, using original schema: %s", exc)
            return original, []

        enriched, audit = self._apply_non_destructive(original, enriched)
        self._validate_action_variable_map(enriched, original)

        avm = enriched.get("action_variable_map", {})
        logger.info(
            "enrichment_complete avm_keys=%s avm_action_count=%d",
            list(avm.keys()), len(avm),
        )
        if avm:
            for aid, vars_map in avm.items():
                logger.info("enrichment_avm action=%s var_count=%d vars=%s", aid, len(vars_map), list(vars_map.keys()))
        else:
            logger.warning("enrichment_avm_empty — simulation will produce identical curves for all actions")

        return enriched, audit

    def _apply_non_destructive(
        self, original: dict, enriched: dict
    ) -> tuple[dict, list[EnrichmentAuditRecord]]:
        audit: list[EnrichmentAuditRecord] = []

        orig_vars = original.get("variables", [])
        enr_vars = enriched.get("variables", [])

        for i, orig_var in enumerate(orig_vars):
            if i >= len(enr_vars):
                break

            if orig_var.get("source") == "explicit":
                # Restore original — enrichment must not touch explicit fields
                enriched["variables"][i] = copy.deepcopy(orig_var)
                continue

            enr_var = enr_vars[i]
            for field in enr_var:
                orig_val = orig_var.get(field)
                enr_val = enr_var.get(field)
                if enr_val != orig_val and orig_val is None:
                    audit.append(EnrichmentAuditRecord(
                        field_path=f"variables[{i}].{field}",
                        before=orig_val,
                        after=enr_val,
                        source="inferred",
                        reason="enrichment gap-fill",
                    ))

        # Preserve variables not returned by enrichment
        if len(enr_vars) < len(orig_vars):
            enriched["variables"].extend(
                copy.deepcopy(v) for v in orig_vars[len(enr_vars):]
            )

        # Carry over top-level fields enrichment may have added (action_variable_map)
        for key in ("action_variable_map",):
            if key in enriched and enriched[key]:
                pass  # keep enriched value
            elif key in original:
                enriched[key] = original[key]

        return enriched, audit

    def _validate_action_variable_map(self, enriched: dict, original: dict) -> None:
        avm = enriched.get("action_variable_map", {})
        if not avm:
            logger.warning("enrichment did not produce action_variable_map")
            return

        actions = original.get("actions", [])
        action_ids = {a.get("action_id") for a in actions}

        # Build label→id map for remapping when LLM used labels instead of IDs
        label_to_id: dict[str, str] = {}
        for a in actions:
            aid = a.get("action_id", "")
            label = a.get("label", "")
            # "One-time purchase" → "one_time_purchase" and "one-time purchase"
            label_to_id[label.lower().replace(" ", "_").replace("-", "_")] = aid
            label_to_id[label.lower()] = aid

        bad_keys = set(avm.keys()) - action_ids
        remapped = 0
        for k in list(bad_keys):
            normalized = k.lower().replace(" ", "_").replace("-", "_")
            target_id = label_to_id.get(normalized) or label_to_id.get(k.lower())
            if target_id:
                avm[target_id] = avm.pop(k)
                remapped += 1
            else:
                del avm[k]

        remaining_bad = set(avm.keys()) - action_ids
        if remaining_bad:
            logger.warning("action_variable_map dropped unknown keys %s", remaining_bad)
        if remapped:
            logger.info("action_variable_map remapped %d label-based keys to action_ids", remapped)
