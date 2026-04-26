from __future__ import annotations

import asyncio
import logging
import time

from groq import AsyncGroq, RateLimitError, APIStatusError

from app.config import settings

logger = logging.getLogger("extraction.llm_client")


class LLMError(Exception):
    pass


_groq_client: AsyncGroq | None = None


def _client() -> AsyncGroq:
    global _groq_client
    if _groq_client is None:
        _groq_client = AsyncGroq(api_key=settings.groq_api_key)
    return _groq_client


async def call_llm(
    prompt: str,
    *,
    temperature: float = 0.1,
    max_tokens: int = 2000,
    model: str | None = None,
) -> tuple[str, str, int, int]:
    """Call Groq with primary model, fall back to secondary on rate-limit or error.

    Returns (raw_text, model_used, tokens_in, tokens_out).
    Raises LLMError if both models fail.
    """
    primary = model or settings.llm_primary_model
    fallback = settings.llm_fallback_model
    timeout = settings.llm_timeout_seconds

    for attempt, current_model in enumerate([primary, fallback]):
        try:
            response = await asyncio.wait_for(
                _client().chat.completions.create(
                    model=current_model,
                    messages=[{"role": "user", "content": prompt}],
                    temperature=temperature,
                    max_tokens=max_tokens,
                ),
                timeout=timeout,
            )
            content = response.choices[0].message.content or ""
            tokens_in = response.usage.prompt_tokens if response.usage else 0
            tokens_out = response.usage.completion_tokens if response.usage else 0
            return content, current_model, tokens_in, tokens_out

        except RateLimitError:
            if attempt == 0:
                logger.warning("primary model rate-limited, falling back to %s", fallback)
                continue
            raise LLMError(f"Both models rate-limited ({primary}, {fallback})")

        except asyncio.TimeoutError:
            if attempt == 0:
                logger.warning("primary model timed out after %ss, falling back", timeout)
                continue
            raise LLMError(f"Both models timed out after {timeout}s")

        except APIStatusError as exc:
            if attempt == 0 and exc.status_code >= 500:
                logger.warning("primary model 5xx (%s), falling back", exc.status_code)
                continue
            raise LLMError(f"LLM API error on {current_model}: {exc.status_code} {exc.message}")

        except Exception as exc:
            raise LLMError(f"Unexpected LLM error on {current_model}: {exc}") from exc

    raise LLMError("LLM call exhausted all retries")
