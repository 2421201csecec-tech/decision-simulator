from __future__ import annotations

import asyncio
import logging

from anthropic import AsyncAnthropic, RateLimitError, APIStatusError

from app.config import settings

logger = logging.getLogger("extraction.llm_client")


class LLMError(Exception):
    pass


_anthropic_client: AsyncAnthropic | None = None


def _client() -> AsyncAnthropic:
    global _anthropic_client
    if _anthropic_client is None:
        _anthropic_client = AsyncAnthropic(api_key=settings.anthropic_api_key)
    return _anthropic_client


async def call_llm(
    prompt: str,
    *,
    temperature: float = 0.1,
    max_tokens: int = 2000,
    model: str | None = None,
) -> tuple[str, str, int, int]:
    """Call Anthropic with primary model, fall back to secondary on rate-limit or error.

    Returns (raw_text, model_used, tokens_in, tokens_out).
    Raises LLMError if both models fail.
    """
    primary = model or settings.llm_primary_model
    fallback = settings.llm_fallback_model
    timeout = settings.llm_timeout_seconds

    for attempt, current_model in enumerate([primary, fallback]):
        t0 = asyncio.get_event_loop().time()
        logger.info("[llm] calling %s | prompt_chars=%d max_tokens=%d attempt=%d",
                    current_model, len(prompt), max_tokens, attempt)
        try:
            response = await asyncio.wait_for(
                _client().messages.create(
                    model=current_model,
                    messages=[{"role": "user", "content": prompt}],
                    temperature=temperature,
                    max_tokens=max_tokens,
                ),
                timeout=timeout,
            )
            elapsed = asyncio.get_event_loop().time() - t0
            content = response.content[0].text if response.content else ""
            tokens_in = response.usage.input_tokens
            tokens_out = response.usage.output_tokens
            logger.info("[llm] OK model=%s tokens_in=%d tokens_out=%d elapsed=%.1fs",
                        current_model, tokens_in, tokens_out, elapsed)
            return content, current_model, tokens_in, tokens_out

        except RateLimitError:
            elapsed = asyncio.get_event_loop().time() - t0
            if attempt == 0:
                logger.warning("[llm] RATE_LIMIT model=%s elapsed=%.1fs → sleeping 3s then trying %s",
                               current_model, elapsed, fallback)
                await asyncio.sleep(3)
                continue
            logger.warning("[llm] RATE_LIMIT model=%s (both limited) → sleeping 8s then retrying %s",
                           current_model, elapsed, primary)
            await asyncio.sleep(8)
            try:
                response = await asyncio.wait_for(
                    _client().messages.create(
                        model=primary,
                        messages=[{"role": "user", "content": prompt}],
                        temperature=temperature,
                        max_tokens=max_tokens,
                    ),
                    timeout=timeout,
                )
                content = response.content[0].text if response.content else ""
                logger.info("[llm] OK after rate-limit retry model=%s tokens_in=%d tokens_out=%d",
                            primary, response.usage.input_tokens, response.usage.output_tokens)
                return content, primary, response.usage.input_tokens, response.usage.output_tokens
            except Exception as retry_exc:
                logger.error("[llm] FAILED after rate-limit retry: %s", retry_exc)
                raise LLMError(f"Both models rate-limited ({primary}, {fallback})")

        except asyncio.TimeoutError:
            elapsed = asyncio.get_event_loop().time() - t0
            if attempt == 0:
                logger.warning("[llm] TIMEOUT model=%s after %.1fs → trying %s", current_model, elapsed, fallback)
                continue
            logger.error("[llm] TIMEOUT model=%s after %.1fs (both timed out)", current_model, elapsed)
            raise LLMError(f"Both models timed out after {timeout}s")

        except APIStatusError as exc:
            elapsed = asyncio.get_event_loop().time() - t0
            if attempt == 0 and exc.status_code >= 500:
                logger.warning("[llm] HTTP_%d model=%s elapsed=%.1fs → trying %s",
                               exc.status_code, current_model, elapsed, fallback)
                continue
            logger.error("[llm] HTTP_%d model=%s elapsed=%.1fs body=%s",
                         exc.status_code, current_model, elapsed, str(exc.message)[:200])
            raise LLMError(f"LLM API error on {current_model}: {exc.status_code} {exc.message}")

        except Exception as exc:
            elapsed = asyncio.get_event_loop().time() - t0
            logger.error("[llm] UNEXPECTED model=%s elapsed=%.1fs error=%s: %s",
                         current_model, elapsed, type(exc).__name__, exc)
            raise LLMError(f"Unexpected LLM error on {current_model}: {exc}") from exc

    raise LLMError("LLM call exhausted all retries")
