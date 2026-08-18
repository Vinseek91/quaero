from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
from loguru import logger
import asyncio
import time

from api.routes import router
from core.config import settings

# ── CT Log Scanner — shared cache ─────────────────────────────────────────────
# Written by the background task, read by /api/brand-monitor/ct-latest
ct_scan_cache: dict = {
    "last_run": None,
    "next_run": None,
    "brands_with_threats": 0,
    "total_threats": 0,
    "results": [],   # list of brand scan results that had threats
    "running": False,
}

_CT_INTERVAL_HOURS = 6


async def _ct_background_loop():
    """
    Runs indefinitely. Every 6 hours:
      1. Scans crt.sh for all 45+ protected brands
      2. Updates ct_scan_cache with live results
      3. Logs a summary
    """
    # Wait 90 seconds after startup before first scan so the server is fully ready
    await asyncio.sleep(90)

    while True:
        ct_scan_cache["running"] = True
        logger.info("Brand Sentinel: starting scheduled CT log scan for all brands...")
        try:
            from packages.brandprotect.scanner import ct_scan_all_brands
            results = await ct_scan_all_brands(days=7)
            total = sum(r.get("threats_found", 0) for r in results)
            ct_scan_cache.update({
                "last_run": time.strftime("%Y-%m-%d %H:%M UTC"),
                "next_run": time.strftime(
                    "%Y-%m-%d %H:%M UTC",
                    time.gmtime(time.time() + _CT_INTERVAL_HOURS * 3600)
                ),
                "brands_with_threats": len(results),
                "total_threats": total,
                "results": results,
                "running": False,
            })
            logger.info(f"Brand Sentinel CT scan complete — {total} threats across {len(results)} brands")
        except Exception as e:
            ct_scan_cache["running"] = False
            logger.error(f"Brand Sentinel CT scan failed: {e}")

        await asyncio.sleep(_CT_INTERVAL_HOURS * 3600)

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
    # Start the Brand Sentinel CT log scanner background loop
    task = asyncio.create_task(_ct_background_loop())
    logger.info(f"Brand Sentinel: CT scanner scheduled every {_CT_INTERVAL_HOURS}h (first run in 90s)")
    yield
    task.cancel()
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
