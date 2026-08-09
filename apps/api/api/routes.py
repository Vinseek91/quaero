"""
QUAERYX API Routes
"""
import asyncio
import io
import json
import re
import time
from collections import Counter, deque
from fastapi import APIRouter, File, Form, Header, Query, UploadFile
from fastapi.responses import StreamingResponse
from loguru import logger

# ── Simple TTL cache ───────────────────────────────────────────────────────
_cache: dict[str, tuple[float, any]] = {}
_CACHE_TTL = 300  # 5 minutes

def _cache_get(key: str):
    if key in _cache:
        ts, val = _cache[key]
        if time.time() - ts < _CACHE_TTL:
            return val
        del _cache[key]
    return None

def _cache_set(key: str, val: any):
    _cache[key] = (time.time(), val)
    if len(_cache) > 500:
        oldest = sorted(_cache.items(), key=lambda x: x[1][0])[:100]
        for k, _ in oldest:
            del _cache[k]

# ── Analytics counters (in-memory, resets on restart) ─────────────────────
_stats = {
    "total_searches": 0,
    "searches_by_mode": Counter(),
    "top_queries": Counter(),
    "searches_by_hour": Counter(),   # key = "YYYY-MM-DD HH"
    "started_at": time.time(),
}

from core.config import settings
from packages.search.aggregator import UniversalSearchAggregator
from packages.reasoning.engine import ReasoningEngine
from packages.mirofish.client import MiroFishClient

router = APIRouter()
searcher = UniversalSearchAggregator(settings)
reasoner = ReasoningEngine()
mirofish = MiroFishClient()


@router.get("/search")
async def search(
    q: str = Query(..., description="Search query"),
    mode: str = Query("general", description="general | academic | code | news | prediction"),
    stream: bool = Query(True),
    predict: bool = Query(False, description="Enable MiroFish swarm prediction"),
    model: str = Query("llama-3.3-70b-versatile", description="Groq model to use for synthesis"),
    comparison: bool = Query(False, description="Comparison mode — produces side-by-side table"),
):
    """
    QUAERYX unified search — 10+ sources, AI synthesis, optional swarm prediction.
    """
    # Track analytics
    _stats["total_searches"] += 1
    _stats["searches_by_mode"][mode] += 1
    _stats["top_queries"][q[:80]] += 1
    hour_key = time.strftime("%Y-%m-%d %H")
    _stats["searches_by_hour"][hour_key] += 1
    # Keep top_queries bounded to 1000 entries
    if len(_stats["top_queries"]) > 1000:
        least = _stats["top_queries"].most_common()[:-201:-1]
        for k, _ in least:
            del _stats["top_queries"][k]

    # 0. Detect language
    detected_lang = "en"
    try:
        from langdetect import detect
        detected_lang = detect(q)
    except Exception:
        pass

    # 1. Classify intent (graceful fallback)
    try:
        intent = await reasoner.classify_intent(q)
    except Exception:
        intent = {}
    effective_mode = intent.get("mode", mode)
    needs_prediction = predict or intent.get("needs_prediction", False)

    # 2. Fan out search
    results = await searcher.search(q, mode=effective_mode, top_k=20)

    if not results:
        return {"query": q, "results": [], "answer": "No results found."}

    if stream:
        async def event_stream():
            # Send search results first
            yield f"data: {json.dumps({'type': 'results', 'data': results[:10]})}\n\n"

            # Stream reasoning (graceful fallback if LLM unavailable)
            try:
                async for chunk in reasoner.synthesise(q, results, stream=True, mode=effective_mode, model=model, language=detected_lang, comparison=comparison):
                    yield f"data: {json.dumps({'type': 'answer_chunk', 'data': chunk})}\n\n"
            except Exception as e:
                logger.warning(f"Reasoning failed: {e}")
                # Fallback: return top snippets as the answer
                fallback = "\n\n".join([
                    f"**{r['title']}**\n{r['snippet']}\n{r['url']}"
                    for r in results[:5] if r.get('snippet')
                ])
                yield f"data: {json.dumps({'type': 'answer_chunk', 'data': fallback or 'Results found above. Add an OpenAI/Anthropic API key or start OmniRoute for AI synthesis.'})}\n\n"

            # MiroFish prediction (if enabled)
            if needs_prediction or intent.get("is_controversial"):
                try:
                    context = "\n".join([f"{r['title']}: {r['snippet']}" for r in results[:8]])
                    prediction = await mirofish.predict(q, context)
                    yield f"data: {json.dumps({'type': 'prediction', 'data': prediction})}\n\n"
                except Exception as e:
                    logger.warning(f"MiroFish failed: {e}")

            yield f"data: {json.dumps({'type': 'done'})}\n\n"

        return StreamingResponse(event_stream(), media_type="text/event-stream")

    # Non-streaming
    try:
        answer_parts = []
        async for chunk in reasoner.synthesise(q, results, stream=False, mode=effective_mode, model=model):
            answer_parts.append(chunk)
        answer = "".join(answer_parts)
    except Exception as e:
        logger.warning(f"Reasoning unavailable: {e}")
        answer = "\n\n".join([
            f"**{r['title']}**\n{r['snippet']}\n{r['url']}"
            for r in results[:5] if r.get("snippet")
        ]) or "Results found. Start OmniRoute or add an API key for AI synthesis."

    prediction = {}
    if needs_prediction:
        try:
            context = "\n".join([f"{r['title']}: {r['snippet']}" for r in results[:8]])
            prediction = await mirofish.predict(q, context)
        except Exception:
            pass

    return {
        "query": q,
        "mode": effective_mode,
        "results": results,
        "answer": answer,
        "prediction": prediction,
        "sources_count": len(results),
    }


@router.get("/deep-research")
async def deep_research(
    q: str = Query(...),
    rounds: int = Query(3, description="Research rounds (more = deeper, slower)"),
):
    """
    Multi-hop deep research — searches, reads, identifies gaps, searches again.
    Like a PhD researcher running 30 searches and writing a report.
    """
    async def research_stream():
        all_results = []
        current_query = q

        for round_num in range(1, rounds + 1):
            yield f"data: {json.dumps({'type': 'round_start', 'round': round_num, 'query': current_query})}\n\n"

            # Search
            results = await searcher.search(current_query, top_k=10)
            all_results.extend(results)
            yield f"data: {json.dumps({'type': 'results', 'round': round_num, 'count': len(results)})}\n\n"

            if round_num < rounds:
                # Generate follow-up query for next round
                followup_prompt = f"""Based on these search results about "{q}",
what's the single most important unanswered question to research next?
Reply with just the search query, nothing else.

Results summary: {' '.join([r['snippet'][:100] for r in results[:5]])}"""

                parts = []
                async for chunk in reasoner.synthesise(followup_prompt, results, stream=False):
                    parts.append(chunk)
                current_query = "".join(parts).strip().strip('"')
                yield f"data: {json.dumps({'type': 'next_query', 'query': current_query})}\n\n"

        # Final synthesis
        yield f"data: {json.dumps({'type': 'synthesising'})}\n\n"
        async for chunk in reasoner.synthesise(q, all_results, stream=True, mode="general"):
            yield f"data: {json.dumps({'type': 'answer_chunk', 'data': chunk})}\n\n"

        # MiroFish prediction on deep research topics
        context = "\n".join([f"{r['title']}: {r['snippet']}" for r in all_results[:10]])
        prediction = await mirofish.predict(q, context)
        yield f"data: {json.dumps({'type': 'prediction', 'data': prediction})}\n\n"
        yield f"data: {json.dumps({'type': 'done', 'total_sources': len(all_results)})}\n\n"

    return StreamingResponse(research_stream(), media_type="text/event-stream")


@router.post("/upload")
async def upload_and_ask(
    file: UploadFile = File(...),
    question: str = Form(...),
    model: str = Form("llama-3.3-70b-versatile"),
):
    """Upload a PDF or text file and ask a question about it."""
    content = await file.read()
    filename = file.filename or "document"

    if filename.lower().endswith(".pdf"):
        try:
            import pypdf
            reader = pypdf.PdfReader(io.BytesIO(content))
            text = "\n\n".join(page.extract_text() or "" for page in reader.pages)
        except Exception as e:
            async def err_stream():
                yield f"data: {json.dumps({'type': 'answer_chunk', 'data': f'Could not parse PDF: {e}'})}\n\n"
                yield f"data: {json.dumps({'type': 'done'})}\n\n"
            return StreamingResponse(err_stream(), media_type="text/event-stream")
    else:
        text = content.decode("utf-8", errors="ignore")

    if not text.strip():
        async def empty_stream():
            yield f"data: {json.dumps({'type': 'answer_chunk', 'data': 'No readable text found in the uploaded file.'})}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
        return StreamingResponse(empty_stream(), media_type="text/event-stream")

    async def doc_stream():
        yield f"data: {json.dumps({'type': 'doc_info', 'data': {'filename': filename, 'chars': len(text)}})}\n\n"
        try:
            async for chunk in reasoner.analyse_document(question, text, filename, model=model, stream=True):
                yield f"data: {json.dumps({'type': 'answer_chunk', 'data': chunk})}\n\n"
        except Exception as e:
            logger.warning(f"Document analysis failed: {e}")
            yield f"data: {json.dumps({'type': 'answer_chunk', 'data': f'Analysis error: {e}'})}\n\n"
        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(doc_stream(), media_type="text/event-stream")


@router.post("/url")
async def analyze_url(
    url: str = Form(...),
    question: str = Form(...),
    model: str = Form("llama-3.3-70b-versatile"),
):
    """Scrape any URL and answer questions about its content."""
    import httpx
    from bs4 import BeautifulSoup

    async def url_stream():
        try:
            async with httpx.AsyncClient(follow_redirects=True, timeout=15) as client:
                resp = await client.get(url, headers={"User-Agent": "Mozilla/5.0 (compatible; QUAERYX/1.0)"})
                soup = BeautifulSoup(resp.text, "html.parser")
                for tag in soup(["script", "style", "nav", "footer", "header", "aside", "iframe"]):
                    tag.decompose()
                text = soup.get_text(separator="\n", strip=True)
                title_tag = soup.find("title")
                title = title_tag.get_text(strip=True) if title_tag else url
        except Exception as e:
            yield f"data: {json.dumps({'type': 'answer_chunk', 'data': f'Could not fetch URL: {e}'})}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
            return

        if not text.strip():
            yield f"data: {json.dumps({'type': 'answer_chunk', 'data': 'No readable content found at this URL.'})}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
            return

        yield f"data: {json.dumps({'type': 'doc_info', 'data': {'filename': title, 'chars': len(text)}})}\n\n"
        try:
            async for chunk in reasoner.analyse_document(question, text, title, model=model, stream=True):
                yield f"data: {json.dumps({'type': 'answer_chunk', 'data': chunk})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'answer_chunk', 'data': f'Analysis failed: {e}'})}\n\n"
        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(url_stream(), media_type="text/event-stream")


@router.post("/youtube")
async def analyze_youtube(
    url: str = Form(...),
    question: str = Form(...),
    model: str = Form("llama-3.3-70b-versatile"),
):
    """Fetch YouTube transcript and answer questions about the video."""
    async def yt_stream():
        match = re.search(r"(?:v=|youtu\.be/|shorts/)([a-zA-Z0-9_-]{11})", url)
        if not match:
            yield f"data: {json.dumps({'type': 'answer_chunk', 'data': 'Invalid YouTube URL — please paste a valid youtube.com or youtu.be link.'})}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
            return

        video_id = match.group(1)
        try:
            from youtube_transcript_api import YouTubeTranscriptApi
            entries = YouTubeTranscriptApi.get_transcript(video_id)
            transcript = " ".join(e["text"] for e in entries)
            filename = f"YouTube · {video_id}"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'answer_chunk', 'data': f'No transcript available for this video: {e}'})}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
            return

        yield f"data: {json.dumps({'type': 'doc_info', 'data': {'filename': filename, 'chars': len(transcript)}})}\n\n"
        try:
            async for chunk in reasoner.analyse_document(question, transcript, filename, model=model, stream=True):
                yield f"data: {json.dumps({'type': 'answer_chunk', 'data': chunk})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'answer_chunk', 'data': f'Analysis failed: {e}'})}\n\n"
        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(yt_stream(), media_type="text/event-stream")


@router.get("/gdrive/auth-url")
async def gdrive_auth_url():
    """Return the Google OAuth URL for the frontend to redirect to."""
    if not settings.GOOGLE_CLIENT_ID:
        return {"error": "Google Drive not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to your environment."}
    from google_auth_oauthlib.flow import Flow
    flow = Flow.from_client_config(
        {"web": {
            "client_id": settings.GOOGLE_CLIENT_ID,
            "client_secret": settings.GOOGLE_CLIENT_SECRET,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
        }},
        scopes=["https://www.googleapis.com/auth/drive.readonly"],
        redirect_uri=settings.GOOGLE_REDIRECT_URI,
    )
    auth_url, _ = flow.authorization_url(prompt="consent", access_type="offline")
    return {"auth_url": auth_url}


@router.post("/gdrive/search")
async def gdrive_search(
    q: str = Form(...),
    question: str = Form(...),
    model: str = Form("llama-3.3-70b-versatile"),
    authorization: str = Header(...),
):
    """Search Google Drive files and answer questions using the user's access token."""
    access_token = authorization.replace("Bearer ", "")

    async def drive_stream():
        try:
            from googleapiclient.discovery import build
            from google.oauth2.credentials import Credentials
            creds = Credentials(token=access_token)
            service = build("drive", "v3", credentials=creds, cache_discovery=False)
            results = service.files().list(
                q=f"fullText contains '{q}' and trashed=false",
                pageSize=5,
                fields="files(id, name, mimeType)",
            ).execute()
            files = results.get("files", [])
        except Exception as e:
            yield f"data: {json.dumps({'type': 'answer_chunk', 'data': f'Google Drive error: {e}'})}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
            return

        if not files:
            yield f"data: {json.dumps({'type': 'answer_chunk', 'data': 'No files found in your Google Drive matching that query.'})}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
            return

        # Export first matching file as plain text
        file = files[0]
        yield f"data: {json.dumps({'type': 'doc_info', 'data': {'filename': file['name'], 'chars': 0}})}\n\n"
        try:
            if "google-apps" in file.get("mimeType", ""):
                content = service.files().export(fileId=file["id"], mimeType="text/plain").execute()
            else:
                content = service.files().get_media(fileId=file["id"]).execute()
            text = content.decode("utf-8", errors="ignore") if isinstance(content, bytes) else str(content)
        except Exception as e:
            yield f"data: {json.dumps({'type': 'answer_chunk', 'data': f'Could not read file: {e}'})}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
            return

        try:
            async for chunk in reasoner.analyse_document(question, text, file["name"], model=model, stream=True):
                yield f"data: {json.dumps({'type': 'answer_chunk', 'data': chunk})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'answer_chunk', 'data': f'Analysis failed: {e}'})}\n\n"
        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(drive_stream(), media_type="text/event-stream")


@router.get("/models")
async def list_models():
    """List all available free Groq models."""
    return {
        "models": [
            {"id": "llama-3.3-70b-versatile", "label": "Llama 3.3 70B",   "desc": "Best quality · Default",    "free": True},
            {"id": "llama-3.1-8b-instant",     "label": "Llama 3.1 8B",    "desc": "Lightning fast · 2× speed", "free": True},
            {"id": "mixtral-8x7b-32768",        "label": "Mixtral 8×7B",    "desc": "32K context window",        "free": True},
            {"id": "gemma2-9b-it",              "label": "Gemma 2 9B",      "desc": "Google · Efficient",        "free": True},
            {"id": "llama3-70b-8192",           "label": "Llama 3 70B",     "desc": "Classic · Reliable",        "free": True},
        ],
        "note": "All models are completely FREE via Groq — no lock icons, no paywalls."
    }


@router.get("/images")
async def image_search(q: str = Query(..., description="Search query for images")):
    """Return relevant images from Wikipedia (free, no API key needed)."""
    cached = _cache_get(f"img:{q}")
    if cached is not None:
        return cached
    import httpx
    images = []
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            resp = await client.get(
                "https://en.wikipedia.org/w/api.php",
                params={
                    "action": "query",
                    "generator": "search",
                    "gsrsearch": q,
                    "gsrlimit": 8,
                    "prop": "pageimages|info",
                    "pithumbsize": 400,
                    "inprop": "url",
                    "format": "json",
                    "origin": "*",
                },
            )
            pages = resp.json().get("query", {}).get("pages", {})
            for page in pages.values():
                thumb = page.get("thumbnail")
                if thumb and thumb.get("source"):
                    images.append({
                        "url": thumb["source"],
                        "title": page.get("title", ""),
                        "page_url": page.get("fullurl", ""),
                        "width": thumb.get("width", 0),
                        "height": thumb.get("height", 0),
                    })
    except Exception as e:
        logger.warning(f"Image search failed: {e}")
    result = {"images": images[:6]}
    _cache_set(f"img:{q}", result)
    return result


@router.get("/trending")
async def trending():
    """Return live trending topics from HackerNews and Reddit."""
    cached = _cache_get("trending")
    if cached is not None:
        return cached
    import httpx
    topics = []

    try:
        async with httpx.AsyncClient(timeout=8) as client:
            # HackerNews top stories
            hn_resp = await client.get("https://hacker-news.firebaseio.com/v0/topstories.json")
            top_ids = hn_resp.json()[:8]
            for sid in top_ids:
                try:
                    item = (await client.get(f"https://hacker-news.firebaseio.com/v0/item/{sid}.json")).json()
                    if item.get("title") and item.get("score", 0) > 50:
                        topics.append({
                            "title": item["title"],
                            "source": "hackernews",
                            "score": item.get("score", 0),
                            "url": item.get("url", f"https://news.ycombinator.com/item?id={sid}"),
                        })
                except Exception:
                    pass

            # Reddit r/technology + r/science hot posts
            for sub in ["technology", "worldnews"]:
                try:
                    r = await client.get(
                        f"https://www.reddit.com/r/{sub}/hot.json?limit=4",
                        headers={"User-Agent": "QUAERYX/1.0"}
                    )
                    for post in r.json()["data"]["children"][:3]:
                        d = post["data"]
                        if not d.get("stickied") and d.get("title"):
                            topics.append({
                                "title": d["title"],
                                "source": "reddit",
                                "score": d.get("score", 0),
                                "url": f"https://reddit.com{d.get('permalink', '')}",
                            })
                except Exception:
                    pass
    except Exception as e:
        logger.warning(f"Trending fetch failed: {e}")

    # Sort by score and deduplicate
    seen = set()
    unique = []
    for t in sorted(topics, key=lambda x: x["score"], reverse=True):
        key = t["title"][:40]
        if key not in seen:
            seen.add(key)
            unique.append(t)

    result = {"trending": unique[:12]}
    _cache_set("trending", result)
    return result


@router.get("/providers")
async def list_providers():
    return {
        "web": ["duckduckgo", "brave", "tavily", "exa", "jina"],
        "academic": ["arxiv", "semantic_scholar"],
        "code": ["github", "stackoverflow"],
        "realtime": ["hackernews", "reddit"],
        "prediction": ["mirofish"],
        "active": {
            "brave": bool(settings.BRAVE_API_KEY),
            "tavily": bool(settings.TAVILY_API_KEY),
            "exa": bool(settings.EXA_API_KEY),
            "mirofish": settings.MIROFISH_ENABLED,
        }
    }


@router.get("/stats")
async def get_stats():
    """Analytics stats — total searches, popular queries, usage by mode/hour."""
    uptime_secs = int(time.time() - _stats["started_at"])
    uptime_str = f"{uptime_secs // 3600}h {(uptime_secs % 3600) // 60}m"

    # Last 24 hours by hour
    now_hour = time.strftime("%Y-%m-%d %H")
    hours_24 = []
    for h in range(23, -1, -1):
        ts = time.time() - h * 3600
        key = time.strftime("%Y-%m-%d %H", time.localtime(ts))
        hours_24.append({"hour": key[-5:], "count": _stats["searches_by_hour"].get(key, 0)})

    return {
        "total_searches": _stats["total_searches"],
        "uptime": uptime_str,
        "top_queries": [{"query": q, "count": c} for q, c in _stats["top_queries"].most_common(20)],
        "by_mode": dict(_stats["searches_by_mode"]),
        "last_24h": hours_24,
        "cache_size": len(_cache),
    }
