from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class EnrichmentAuditRecord:
    field_path: str   # e.g. "variables[2].range"
    before: Any
    after: Any
    source: str       # always "inferred" for enrichment-applied values
    reason: str       # e.g. "enrichment gap-fill"
