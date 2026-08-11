"""
QUAERYX Reasoning Engine
Fallback chain: Groq → Gemini → OmniRoute/local → error
"""
import asyncio
from openai import AsyncOpenAI
from loguru import logger
from core.config import settings


class ReasoningEngine:
    def __init__(self):
        # 1. Groq — primary (fast, free, cloud-reliable)
        self.groq_client = AsyncOpenAI(
            base_url="https://api.groq.com/openai/v1",
            api_key=settings.GROQ_API_KEY,
        ) if settings.GROQ_API_KEY else None

        # 2. Gemini — second fallback (OpenAI-compatible endpoint)
        self.gemini_client = AsyncOpenAI(
            base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
            api_key=settings.GEMINI_API_KEY,
        ) if settings.GEMINI_API_KEY else None

        # 3. OmniRoute / local LLM — only if base URL is non-localhost
        base_url = settings.OPENAI_BASE_URL
        is_local = "localhost" in base_url or "127.0.0.1" in base_url
        if is_local and (self.groq_client or self.gemini_client):
            self.client = None
        else:
            self.client = AsyncOpenAI(
                base_url=base_url,
                api_key=settings.OPENAI_API_KEY,
            )

        available = [n for n, c in [("Groq", self.groq_client), ("Gemini", self.gemini_client), ("OmniRoute", self.client)] if c]
        logger.info(f"ReasoningEngine ready — providers: {', '.join(available) or 'NONE'}")

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

        # Language instruction — always explicit so AI doesn't follow source language
        lang_map = {"en": "English", "sv": "Swedish", "de": "German", "fr": "French",
                    "es": "Spanish", "it": "Italian", "pt": "Portuguese", "nl": "Dutch",
                    "pl": "Polish", "ru": "Russian", "zh": "Chinese", "ja": "Japanese",
                    "ko": "Korean", "ar": "Arabic", "hi": "Hindi", "tr": "Turkish"}
        lang_name = lang_map.get(language, "English")
        lang_note = f"\nIMPORTANT: Respond ONLY in {lang_name}. Ignore the language of the sources — sources may be in any language but your answer must be in {lang_name}."

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

        # If user explicitly selected a Gemini model, route directly to Gemini
        GEMINI_MODELS = {"gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-pro", "gemini-2.0-flash-exp"}
        is_gemini = model and model in GEMINI_MODELS

        groq_model   = model if (model and not is_gemini) else "llama-3.3-70b-versatile"
        gemini_model = model if is_gemini else "gemini-2.0-flash"
        local_model  = self._select_model(mode, len(results))
        messages = [{"role": "system", "content": system}, {"role": "user", "content": user}]

        # Fallback chain — if Gemini model selected, try Gemini first
        providers = []
        if is_gemini:
            if self.gemini_client: providers.append((self.gemini_client, gemini_model, "Gemini"))
            if self.groq_client:   providers.append((self.groq_client,   groq_model,   "Groq"))
        else:
            if self.groq_client:   providers.append((self.groq_client,   groq_model,   "Groq"))
            if self.gemini_client: providers.append((self.gemini_client, gemini_model, "Gemini"))
        if self.client:        providers.append((self.client,        local_model,  "OmniRoute"))

        if not providers:
            raise RuntimeError("No LLM provider configured — set GROQ_API_KEY or GEMINI_API_KEY")

        last_error = None
        for client, mdl, name in providers:
            try:
                logger.info(f"Trying {name} ({mdl})")
                if stream:
                    async for chunk in await client.chat.completions.create(
                        model=mdl, messages=messages, stream=True, temperature=0.3,
                    ):
                        if chunk.choices[0].delta.content:
                            yield chunk.choices[0].delta.content
                else:
                    resp = await client.chat.completions.create(
                        model=mdl, messages=messages, temperature=0.3,
                    )
                    yield resp.choices[0].message.content
                return  # success — stop chain
            except Exception as e:
                logger.warning(f"{name} failed: {e} — trying next provider")
                last_error = e

        raise last_error or RuntimeError("All LLM providers failed")

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
