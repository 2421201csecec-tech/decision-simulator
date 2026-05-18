from __future__ import annotations

import logging

import jwt
from jwt import PyJWKClient
from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import settings

logger = logging.getLogger("middleware.auth")

_PUBLIC_PATHS = {"/api/v1/health"}
_jwks_client: PyJWKClient | None = None


def _get_jwks_client() -> PyJWKClient | None:
    global _jwks_client
    if _jwks_client is None and settings.supabase_url:
        jwks_url = f"{settings.supabase_url}/auth/v1/.well-known/jwks.json"
        _jwks_client = PyJWKClient(jwks_url, cache_jwk_set=True, lifespan=3600)
    return _jwks_client


class JWTAuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.url.path in _PUBLIC_PATHS:
            return await call_next(request)

        auth = request.headers.get("authorization", "")
        if not auth.startswith("Bearer "):
            return JSONResponse({"message": "Unauthorized"}, status_code=401)

        token = auth.removeprefix("Bearer ")
        client = _get_jwks_client()
        if not client:
            logger.error("SUPABASE_URL not configured — cannot verify JWT")
            return JSONResponse({"message": "Auth not configured"}, status_code=500)

        try:
            signing_key = client.get_signing_key_from_jwt(token)
            payload = jwt.decode(
                token,
                signing_key.key,
                algorithms=["ES256", "RS256", "HS256"],
                options={"verify_aud": False},
            )
            sub = payload.get("sub")
            if not sub:
                return JSONResponse({"message": "Invalid token"}, status_code=401)
            request.state.user_id = sub
        except jwt.ExpiredSignatureError:
            return JSONResponse({"message": "Token expired"}, status_code=401)
        except jwt.PyJWTError:
            return JSONResponse({"message": "Invalid token"}, status_code=401)
        except Exception:
            logger.warning("JWT verification failed", exc_info=True)
            return JSONResponse({"message": "Invalid token"}, status_code=401)

        return await call_next(request)
