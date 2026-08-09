"""
QUAERYX API Routes
"""
import asyncio
import json
from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse
from loguru import logger

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
):
    """
    QUAERYX unified search — 10+ sources, AI synthesis, optional swarm prediction.
    """
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
                async for chunk in reasoner.synthesise(q, results, stream=True, mode=effective_mode):
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
        async for chunk in reasoner.synthesise(q, results, stream=False, mode=effective_mode):
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
