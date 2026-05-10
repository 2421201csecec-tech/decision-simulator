from __future__ import annotations

# ---------------------------------------------------------------------------
# Injection / confidence thresholds
# ---------------------------------------------------------------------------
INJECT_THRESHOLD = 0.45
BIAS_THRESHOLD = 0.60
PREDICT_THRESHOLD = 0.75
DECAY_FLOOR_GLOBAL = 0.15
DECAY_FLOOR_CONFIRMED = 0.40

# ---------------------------------------------------------------------------
# blend_weight gates
# ---------------------------------------------------------------------------
BLEND_WEIGHT_INJECT = 0.20
BLEND_WEIGHT_BIAS = 0.45
BLEND_WEIGHT_PREDICT = 0.75

# blend_weight formula weights (must sum to 1.0)
BLEND_DECISION_WEIGHT = 0.40
BLEND_OUTCOME_WEIGHT = 0.40
BLEND_CONFIDENCE_WEIGHT = 0.20

# ---------------------------------------------------------------------------
# Dedup merge thresholds
# ---------------------------------------------------------------------------
DEDUP_MERGE_SIM = 0.85
DEDUP_THEME_SIM = 0.65

# ---------------------------------------------------------------------------
# Injection limits
# ---------------------------------------------------------------------------
MAX_PATTERNS_INJECTED = 3

# ---------------------------------------------------------------------------
# Global feedback gates
# ---------------------------------------------------------------------------
GLOBAL_MIN_CONTRIBUTORS = 5
MAX_USER_CONTRIBUTIONS = 3  # per pattern_type+category

# ---------------------------------------------------------------------------
# Decay
# ---------------------------------------------------------------------------
DECAY_HALFLIFE_DAYS = 180
CONFIDENCE_HALFLIFE_DAYS = 90

# ---------------------------------------------------------------------------
# Lambda max adjustments (simulation scoring)
# ---------------------------------------------------------------------------
LAMBDA_MAX_ADJ_L1 = 0.30
LAMBDA_MAX_ADJ_L2 = 0.40
LAMBDA_MAX_ADJ_L3 = 0.50
LAMBDA_MAX_ADJ_L4 = 0.40

# ---------------------------------------------------------------------------
# Enrichment / importance boost
# ---------------------------------------------------------------------------
IMPORTANCE_BOOST_SIM = 0.70    # cosine threshold to escalate variable importance
CROSS_CATEGORY_WEIGHT = 0.50
ENRICHMENT_MAX_PATTERNS = 20   # skip enrichment when user has too many (dedup needed)
ENRICHMENT_LATENCY_WARN = 0.200  # seconds — log warning if exceeded

# ---------------------------------------------------------------------------
# A/B
# ---------------------------------------------------------------------------
AB_CONTROL_PCT = 20  # % of users in treatment group

# ---------------------------------------------------------------------------
# Embedding
# NOTE: 384 = all-MiniLM-L6-v2 (fastembed). Update to 1024 when switching to BGE-M3
# and run re-embedding migration on aggregate_patterns + pattern_profiles.themes.
# ---------------------------------------------------------------------------
EMBEDDING_DIM = 384

# ---------------------------------------------------------------------------
# Feature kill switches — all False = shadow mode (Stage A)
# Flip each independently as stages progress.
# ---------------------------------------------------------------------------
ENABLE_PATTERN_INJECTION = False   # Stage B: importance boost + Pass 3 injection
ENABLE_FAILURE_BIASING = False     # Stage C: lambda adjustment in simulation
ENABLE_PREDICTIVE_ADJUST = False   # Stage C: predictive lambda scaling
ENABLE_GLOBAL_PRIORS = False       # Stage C: global aggregate_patterns blending
ENABLE_DECAY_WORKER = False        # Stage C: nightly APScheduler decay pass
