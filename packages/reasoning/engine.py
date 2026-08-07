"""
QUAERO Reasoning Engine
Multi-agent synthesis with OmniRoute model routing.
"""
import asyncio
from openai import AsyncOpenAI
from loguru import logger
from core.config import settings


class ReasoningEngine:
    def __init__(self):
        # Points to OmniRoute — routes to cheapest capable model per task
        self.client = AsyncOpenAI(
            base_url=settings.OPENAI_BASE_URL,
            api_key=settings.OPENAI_API_KEY,
        )

    async def synthesise(
        self,
        query: str,
        results: list[dict],
        stream: bool = True,
        mode: str = "general",
    ):
        """Synthesise search results into a cited, reasoned answer."""

        context = self._format_results(results)
        system = self._system_prompt(mode)
        user = f"""Query: {query}

Search Results:
{context}

Provide a comprehensive, cited answer. For each key claim, cite [source N].
End with 3 follow-up research questions."""

        model = self._select_model(mode, len(results))

        if stream:
            async for chunk in await self.client.chat.completions.create(
                model=model,
                messages=[{"role": "system", "content": system},
                          {"role": "user", "content": user}],
                stream=True,
                temperature=0.3,
            ):
                if chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content
        else:
            resp = await self.client.chat.completions.create(
                model=model,
                messages=[{"role": "system", "content": system},
                          {"role": "user", "content": user}],
                temperature=0.3,
            )
            yield resp.choices[0].message.content

    async def classify_intent(self, query: str) -> dict:
        """Classify query intent to route to right search providers."""
        resp = await self.client.chat.completions.create(
            model="gemini-1.5-flash",   # cheap + fast for classification
            messages=[{
                "role": "user",
                "content": f"""Classify this search query into one category.
Query: "{query}"
Categories: general | academic | code | news | prediction | factual
Return JSON only: {{"mode": "...", "is_controversial": bool, "needs_prediction": bool}}"""
            }],
            temperature=0,
            response_format={"type": "json_object"},
        )
        import json
        try:
            return json.loads(resp.choices[0].message.content)
        except Exception:
            return {"mode": "general", "is_controversial": False, "needs_prediction": False}

    def _select_model(self, mode: str, result_count: int) -> str:
        """Route to cheapest model that can handle the task."""
        if mode in ("academic", "code") or result_count > 15:
            return "claude-sonnet-4-6"      # complex synthesis
        return "gemini-1.5-flash"           # fast + free for general

    def _format_results(self, results: list[dict]) -> str:
        lines = []
        for i, r in enumerate(results[:15], 1):
            lines.append(f"[{i}] {r['title']}\nURL: {r['url']}\n{r['snippet']}\n")
        return "\n".join(lines)

    def _system_prompt(self, mode: str) -> str:
        base = """You are QUAERO, the world's most intelligent search engine.
Your answers are comprehensive, accurate, and always cite sources.
You synthesise information from multiple sources into a clear, structured answer.
You acknowledge when sources conflict and explain why."""

        additions = {
            "academic": " Focus on peer-reviewed findings. Cite methodology and sample sizes.",
            "code": " Provide working code examples. Note language versions and dependencies.",
            "news": " Focus on the most recent developments. Note publication dates.",
            "prediction": " Based on current evidence, reason about likely future outcomes.",
        }
        return base + additions.get(mode, "")
