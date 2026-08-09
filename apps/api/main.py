from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
from loguru import logger
import time

from api.routes import router
from core.config import settings

# ── Simple in-memory rate limiter ──────────────────────────────────────────
_rate_store: dict[str, list[float]] = {}

async def rate_limit_middleware(request: Request, call_next):
    # Only rate-limit the search endpoint
    if request.url.path.startswith("/api/search") or request.url.path.startswith("/api/deep-research"):
        ip = request.client.host if request.client else "unknown"
        now = time.time()
        window, limit = 60, 30  # 30 requests per minute

        _rate_store[ip] = [t for t in _rate_store.get(ip, []) if now - t < window]
        if len(_rate_store[ip]) >= limit:
            return JSONResponse(
                {"error": "Rate limit exceeded — 30 searches/minute. Please slow down."},
                status_code=429,
            )
        _rate_store[ip].append(now)

    return await call_next(request)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("QUAERYX starting up...")
    yield
    logger.info("QUAERYX shutting down...")

app = FastAPI(
    title="QUAERYX",
    description="The search engine born from the word 'search' — more powerful than Google + Perplexity combined",
    version="0.2.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.middleware("http")(rate_limit_middleware)
app.include_router(router, prefix="/api")

@app.get("/health")
async def health():
    return {"status": "ok", "service": "quaeryx", "version": "0.2.0"}
