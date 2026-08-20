from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
from loguru import logger
import asyncio
import time
import collections

from api.routes import router
from core.config import settings

# ── CT Log Scanner — shared cache ─────────────────────────────────────────────
ct_scan_cache: dict = {
    "last_run": None,
    "next_run": None,
    "brands_with_threats": 0,
    "total_threats": 0,
    "results": [],
    "running": False,
}

# ── Phishing Feeds — shared cache ─────────────────────────────────────────────
feeds_scan_cache: dict = {
    "last_run": None,
    "next_run": None,
    "brands_with_threats": 0,
    "total_threats": 0,
    "results": [],
    "feed_sizes": {},
    "running": False,
}

# ── Certstream — rolling alert buffer (last 200 matches) ──────────────────────
# Each entry: {domain, brand, risk_score, reasons, detected_at}
stream_alerts: collections.deque = collections.deque(maxlen=200)

_CT_INTERVAL_HOURS = 6
_FEEDS_INTERVAL_HOURS = 6


async def _feeds_background_loop():
    """
    Every 6 hours: download OpenPhish + URLhaus + PhishStats feeds,
    scan all 45+ brands, cache results in feeds_scan_cache.
    """
    await asyncio.sleep(20)  # slight offset from CT loop
    while True:
        feeds_scan_cache["running"] = True
        logger.info("Brand Sentinel: starting scheduled feeds scan (OpenPhish + URLhaus + PhishStats)...")
        try:
            from packages.brandprotect.scanner import feeds_scan_all_brands
            result = await feeds_scan_all_brands()
            feeds_scan_cache.update({
                "last_run": time.strftime("%Y-%m-%d %H:%M UTC"),
                "next_run": time.strftime(
                    "%Y-%m-%d %H:%M UTC",
                    time.gmtime(time.time() + _FEEDS_INTERVAL_HOURS * 3600)
                ),
                "brands_with_threats": result.get("brands_with_threats", 0),
                "total_threats": result.get("total_threats", 0),
                "results": result.get("results", []),
                "feed_sizes": result.get("feed_sizes", {}),
                "running": False,
            })
            logger.info(f"Feeds scan complete — {result.get('total_threats', 0)} threats across {result.get('brands_with_threats', 0)} brands")
        except Exception as e:
            feeds_scan_cache["running"] = False
            logger.error(f"Feeds scan failed: {e}")

        await asyncio.sleep(_FEEDS_INTERVAL_HOURS * 3600)


async def _certstream_listener():
    """
    Connect to certstream (wss://certstream.calidog.io) for real-time cert monitoring.
    Requires the 'websockets' package — silently disabled if not installed.
    Never crashes the server regardless of what happens.
    """
    try:
        import websockets as _ws
    except ImportError:
        logger.info("Certstream: websockets package not installed — skipping real-time listener")
        return  # graceful no-op

    try:
        import json as _json
        from packages.brandprotect.scanner import score_url
        from packages.brandprotect.brands import PROTECTED_BRANDS

        kw_map: dict = {}
        for brand in PROTECTED_BRANDS:
            for kw in brand["keywords"]:
                kw_map[kw] = brand["name"]

        uri = "wss://certstream.calidog.io/"
        backoff = 5

        while True:
            try:
                logger.info("Certstream: connecting...")
                async with _ws.connect(uri, ping_interval=30, ping_timeout=10) as ws:
                    logger.info("Certstream: connected — watching live cert issuances")
                    backoff = 5
                    async for raw in ws:
                        try:
                            msg = _json.loads(raw)
                            if msg.get("message_type") != "certificate_update":
                                continue
                            leaf = msg.get("data", {}).get("leaf_cert", {})
                            for domain in leaf.get("all_domains", []):
                                domain = domain.lower().lstrip("*.")
                                for kw, brand_name in kw_map.items():
                                    if kw in domain:
                                        scored = score_url(domain)
                                        if scored["is_suspicious"] and scored.get("brand") == brand_name:
                                            stream_alerts.appendleft({
                                                "domain": domain,
                                                "url": f"https://{domain}",
                                                "brand": brand_name,
                                                "risk_score": scored["risk"],
                                                "reasons": scored["reasons"],
                                                "detected_at": time.strftime("%Y-%m-%d %H:%M UTC"),
                                                "source": "Certstream (real-time)",
                                            })
                                            logger.warning(f"Certstream: {domain} → {brand_name} ({scored['risk']}/100)")
                                        break
                        except Exception:
                            pass
            except Exception as e:
                logger.warning(f"Certstream disconnected ({e}) — retry in {backoff}s")
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 120)
    except Exception as e:
        logger.error(f"Certstream listener fatal error: {e}")


async def _ct_background_loop():
    """
    Runs indefinitely. Every 6 hours:
      1. Scans crt.sh for all 45+ protected brands
      2. Updates ct_scan_cache with live results
      3. Logs a summary
    """
    # Wait 15 seconds after startup before first scan so the server is fully ready
    await asyncio.sleep(15)

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
    tasks = []
    for name, coro in [
        ("CT scanner",    _ct_background_loop()),
        ("Feeds scanner", _feeds_background_loop()),
        ("Certstream",    _certstream_listener()),
    ]:
        try:
            t = asyncio.create_task(coro)
            tasks.append(t)
            logger.info(f"Brand Sentinel: {name} started")
        except Exception as e:
            logger.error(f"Brand Sentinel: failed to start {name}: {e}")
    yield
    for t in tasks:
        t.cancel()
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
