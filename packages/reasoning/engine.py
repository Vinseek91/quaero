"""
QUAERYX Reasoning Engine
Multi-agent synthesis with OmniRoute model routing.
Falls back to Groq (free) when OmniRoute is unavailable.
"""
import asyncio
from openai import AsyncOpenAI
from loguru import logger
from core.config import settings


class ReasoningEngine:
    def __init__(self):
        # Groq free API (primary on cloud; fallback locally)
        self.groq_client = AsyncOpenAI(
            base_url="https://api.groq.com/openai/v1",
            api_key=settings.GROQ_API_KEY,
        ) if settings.GROQ_API_KEY else None

        # OmniRoute / local LLM — only used if base URL is NOT localhost
        # (localhost:20128 is unreachable when deployed on Render/cloud)
        base_url = settings.OPENAI_BASE_URL
        is_local = "localhost" in base_url or "127.0.0.1" in base_url
        if is_local and self.groq_client:
            # On cloud with Groq available — skip OmniRoute entirely
            self.client = None
        else:
            self.client = AsyncOpenAI(
                base_url=base_url,
                api_key=settings.OPENAI_API_KEY,
            )

    async def synthesise(
        self,
        query: str,
        results: list[dict],
        stream: bool = True,
        mode: str = "general",
        model: str | None = None,
        language: str = "en",
        comparison: bool = False,
    ):
        """Synthesise search results into a cited, reasoned answer."""
        context = self._format_results(results)
        system = self._system_prompt(mode)

        # Language instruction
        lang_note = "" if language == "en" else f"\nIMPORTANT: The user wrote in language code '{language}'. Respond in the same language throughout."

        # Comparison mode instruction
        if comparison:
            user = f"""Query: {query}

Search Results:
{context}

This is a COMPARISON query. Structure your response as:
1. A brief intro paragraph
2. A detailed markdown comparison table with relevant attributes as rows
3. A verdict section — which is better and when
4. Cite sources inline [source N]
End with 3 follow-up research questions.{lang_note}"""
        else:
            user = f"""Query: {query}

Search Results:
{context}

Provide a comprehensive, cited answer. For each key claim, cite [source N].
End with 3 follow-up research questions.{lang_note}"""

        groq_model = model or "llama-3.3-70b-versatile"
        primary_model = self._select_model(mode, len(results))
        messages = [{"role": "system", "content": system}, {"role": "user", "content": user}]

        # Choose client: prefer Groq if available (cloud-reliable), else OmniRoute/local
        active_client = self.groq_client or self.client
        active_model  = groq_model if active_client is self.groq_client else primary_model

        if active_client is None:
            raise RuntimeError("No LLM available — set GROQ_API_KEY in environment variables")

        try:
            if stream:
                async for chunk in await active_client.chat.completions.create(
                    model=active_model, messages=messages, stream=True, temperature=0.3,
                ):
                    if chunk.choices[0].delta.content:
                        yield chunk.choices[0].delta.content
            else:
                resp = await active_client.chat.completions.create(
                    model=active_model, messages=messages, temperature=0.3,
                )
                yield resp.choices[0].message.content
        except Exception as e:
            # If Groq failed and we have OmniRoute as backup, try it
            if active_client is self.groq_client and self.client:
                logger.warning(f"Groq failed: {e} — trying OmniRoute fallback")
                if stream:
                    async for chunk in await self.client.chat.completions.create(
                        model=primary_model, messages=messages, stream=True, temperature=0.3,
                    ):
                        if chunk.choices[0].delta.content:
                            yield chunk.choices[0].delta.content
                else:
                    resp = await self.client.chat.completions.create(
                        model=primary_model, messages=messages, temperature=0.3,
                    )
                    yield resp.choices[0].message.content
            else:
                raise

    async def analyse_document(
        self,
        question: str,
        document_text: str,
        filename: str,
        model: str | None = None,
        stream: bool = True,
    ):
        """Answer questions about an uploaded document."""
        system = """You are QUAERYX Document Analyst.
Analyze the provided document and answer the user's question thoroughly.
Cite specific sections of the document where relevant.
If the answer cannot be found in the document, say so clearly.
Format your response with clear headings and bullet points where appropriate."""

        # Truncate to ~12k chars to avoid token limits
        truncated = document_text[:12000]
        if len(document_text) > 12000:
            truncated += "\n\n[... document truncated — showing first 12,000 characters ...]"

        user = f"""Document: {filename}

Content:
{truncated}

Question: {question}"""

        groq_model = model or "llama-3.3-70b-versatile"
        # Prefer Groq for document analysis (reliable cloud availability)
        client = self.groq_client or self.client
        actual_model = groq_model if self.groq_client else self._select_model("general", 0)

        if stream:
            async for chunk in await client.chat.completions.create(
                model=actual_model,
                messages=[{"role": "system", "content": system},
                          {"role": "user", "content": user}],
                stream=True,
                temperature=0.3,
            ):
                if chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content
        else:
            resp = await client.chat.completions.create(
                model=actual_model,
                messages=[{"role": "system", "content": system},
                          {"role": "user", "content": user}],
                temperature=0.3,
            )
            yield resp.choices[0].message.content

    async def classify_intent(self, query: str) -> dict:
        """Classify query intent to route to right search providers."""
        client = self.groq_client or self.client
        model = "llama-3.3-70b-versatile" if self.groq_client else "gemini-1.5-flash"
        try:
            resp = await client.chat.completions.create(
                model=model,
                messages=[{
                    "role": "user",
                    "content": f"""Classify this search query into one category.
Query: "{query}"
Categories: general | academic | code | news | prediction | factual
Return JSON only: {{"mode": "...", "is_controversial": false, "needs_prediction": false}}"""
                }],
                temperature=0,
                response_format={"type": "json_object"},
            )
            import json
            return json.loads(resp.choices[0].message.content)
        except Exception:
            return {"mode": "general", "is_controversial": False, "needs_prediction": False}

    def _select_model(self, mode: str, result_count: int) -> str:
        """Route to cheapest model that can handle the task."""
        if mode in ("academic", "code") or result_count > 15:
            return "claude-sonnet-4-6"
        return "gemini-1.5-flash"

    def _format_results(self, results: list[dict]) -> str:
        lines = []
        for i, r in enumerate(results[:15], 1):
            lines.append(f"[{i}] {r['title']}\nURL: {r['url']}\n{r['snippet']}\n")
        return "\n".join(lines)

    def _system_prompt(self, mode: str) -> str:
        base = """You are QUAERYX, the world's most intelligent search engine.
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
