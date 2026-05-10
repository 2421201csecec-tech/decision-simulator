import os

from dotenv import load_dotenv

load_dotenv()


class Settings:
    app_name: str = os.getenv("APP_NAME", "eidoz-core-backend")
    app_env: str = os.getenv("APP_ENV", "development")
    log_level: str = os.getenv("LOG_LEVEL", "INFO")
    database_url: str = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./dev.db")

    # LLM
    groq_api_key: str = os.getenv("GROQ_API_KEY", "")
    llm_primary_model: str = os.getenv("LLM_PRIMARY_MODEL", "llama-3.3-70b-versatile")
    llm_fallback_model: str = os.getenv("LLM_FALLBACK_MODEL", "llama-3.1-8b-instant")
    llm_timeout_seconds: int = int(os.getenv("LLM_TIMEOUT_SECONDS", "25"))

    # Extraction
    prompt_version: str = os.getenv("PROMPT_VERSION", "1.1.0")
    max_retries_per_pass: int = int(os.getenv("MAX_RETRIES_PER_PASS", "2"))
    min_variables_threshold: int = int(os.getenv("MIN_VARIABLES_THRESHOLD", "3"))
    max_variables_allowed: int = int(os.getenv("MAX_VARIABLES_ALLOWED", "15"))
    min_confidence_for_storage: float = float(os.getenv("MIN_CONFIDENCE_FOR_STORAGE", "0.70"))
    clarification_enabled: bool = os.getenv("CLARIFICATION_ENABLED", "true").lower() == "true"
    enrichment_enabled: bool = os.getenv("ENRICHMENT_ENABLED", "true").lower() == "true"
    memory_write_enabled: bool = os.getenv("MEMORY_WRITE_ENABLED", "true").lower() == "true"

    # Memory retrieval (OpenAI embeddings)
    openai_api_key: str = os.getenv("OPENAI_API_KEY", "")
    embedding_model: str = os.getenv("EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
    memory_retrieval_enabled: bool = os.getenv("MEMORY_RETRIEVAL_ENABLED", "true").lower() == "true"
    memory_min_cosine: float = float(os.getenv("MEMORY_MIN_COSINE", "0.72"))

    # Pattern Engine v2 — master kill switch (overrides all ENABLE_* flags in constants.py)
    pattern_engine_enabled: bool = os.getenv("PATTERN_ENGINE_ENABLED", "false").lower() == "true"


settings = Settings()
