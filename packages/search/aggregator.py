"""
QUAERYX Universal Search Aggregator
Fans out to 8+ providers simultaneously, deduplicates, scores, and ranks.
"""
import asyncio
import hashlib
from typing import Optional
import httpx
from loguru import logger


class SearchResult:
    def __init__(self, title: str, url: str, snippet: str, source: str, score: float = 1.0):
        self.title = title
        self.url = url
        self.snippet = snippet
        self.source = source
        self.score = score
        self.appearances = 1  # how many providers returned this

    def to_dict(self):
        return {
            "title": self.title,
            "url": self.url,
            "snippet": self.snippet,
            "source": self.source,
            "score": self.score,
            "appearances": self.appearances,
        }


class UniversalSearchAggregator:
    def __init__(self, settings):
        self.settings = settings
        self.client = httpx.AsyncClient(timeout=10.0, follow_redirects=True)

    async def search(self, query: str, mode: str = "general", top_k: int = 20) -> list[dict]:
        """Fan out to all providers in parallel, merge and rank results."""

        providers = self._select_providers(mode)
        tasks = [self._safe_search(provider, query) for provider in providers]
        batches = await asyncio.gather(*tasks)

        # Merge + deduplicate by URL
        seen: dict[str, SearchResult] = {}
        for batch in batches:
            for r in batch:
                key = self._url_key(r.url)
                if key in seen:
                    seen[key].score += r.score
                    seen[key].appearances += 1
                else:
                    seen[key] = r

        # Rank: boost results that appeared across multiple providers
        ranked = sorted(seen.values(), key=lambda r: r.score * r.appearances, reverse=True)
        return [r.to_dict() for r in ranked[:top_k]]

    def _select_providers(self, mode: str) -> list:
        # Core web sources — always on, no API key needed
        base = [self._wikipedia_search, self._ddg_search]

        # Paid web sources (add if API keys configured)
        if self.settings.BRAVE_API_KEY:
            base.append(self._brave_search)
        if self.settings.TAVILY_API_KEY:
            base.append(self._tavily_search)
        if self.settings.EXA_API_KEY:
            base.append(self._exa_search)

        # Mode-specific sources
        if mode == "academic":
            base += [self._arxiv_search, self._semantic_scholar_search]
        elif mode == "code":
            base += [self._github_search, self._stackoverflow_search, self._arxiv_search]
        elif mode == "news":
            base += [self._hn_search, self._reddit_search]
        else:
            # General / prediction — light social context, no academic papers
            base += [self._hn_search, self._reddit_search]

        return base

    async def _safe_search(self, fn, query: str) -> list[SearchResult]:
        try:
            return await fn(query)
        except Exception as e:
            logger.warning(f"Provider {fn.__name__} failed: {e}")
            return []

    def _url_key(self, url: str) -> str:
        return hashlib.md5(url.lower().strip("/").encode()).hexdigest()

    # ── PROVIDERS ─────────────────────────────────────────────────────────

    async def _wikipedia_search(self, query: str) -> list[SearchResult]:
        """Wikipedia — free, no API key, works from any IP."""
        resp = await self.client.get(
            "https://en.wikipedia.org/w/api.php",
            params={"action": "query", "list": "search", "srsearch": query,
                    "srlimit": 8, "format": "json", "utf8": 1},
        )
        data = resp.json()
        return [
            SearchResult(
                title=r.get("title", ""),
                url=f"https://en.wikipedia.org/wiki/{r.get('title','').replace(' ','_')}",
                snippet=r.get("snippet", "").replace('<span class="searchmatch">', "").replace("</span>", ""),
                source="wikipedia",
                score=1.1,
            )
            for r in data.get("query", {}).get("search", [])
        ]

    async def _ddg_search(self, query: str) -> list[SearchResult]:
        """DuckDuckGo (ddgs) — free, no API key needed. Run sync lib in thread pool."""
        import asyncio
        def _run():
            try:
                from ddgs import DDGS
                ddgs = DDGS()
                return list(ddgs.text(query, max_results=10))
            except Exception as e:
                logger.warning(f"DDG error: {e}")
                return []
        hits = await asyncio.to_thread(_run)
        return [
            SearchResult(
                title=r.get("title", ""),
                url=r.get("href", ""),
                snippet=r.get("body", ""),
                source="duckduckgo",
                score=1.0,
            )
            for r in hits
        ]

    async def _brave_search(self, query: str) -> list[SearchResult]:
        """Brave Search API — 2000 free req/month."""
        resp = await self.client.get(
            "https://api.search.brave.com/res/v1/web/search",
            headers={"Accept": "application/json", "X-Subscription-Token": self.settings.BRAVE_API_KEY},
            params={"q": query, "count": 10},
        )
        data = resp.json()
        return [
            SearchResult(
                title=r.get("title", ""),
                url=r.get("url", ""),
                snippet=r.get("description", ""),
                source="brave",
                score=1.0,
            )
            for r in data.get("web", {}).get("results", [])
        ]

    async def _tavily_search(self, query: str) -> list[SearchResult]:
        """Tavily — built for AI agents, returns clean summaries."""
        resp = await self.client.post(
            "https://api.tavily.com/search",
            json={"api_key": self.settings.TAVILY_API_KEY, "query": query, "max_results": 10},
        )
        data = resp.json()
        return [
            SearchResult(
                title=r.get("title", ""),
                url=r.get("url", ""),
                snippet=r.get("content", ""),
                source="tavily",
                score=1.1,  # Tavily results tend to be high quality
            )
            for r in data.get("results", [])
        ]

    async def _exa_search(self, query: str) -> list[SearchResult]:
        """Exa — neural/semantic search."""
        resp = await self.client.post(
            "https://api.exa.ai/search",
            headers={"x-api-key": self.settings.EXA_API_KEY},
            json={"query": query, "numResults": 10, "useAutoprompt": True},
        )
        data = resp.json()
        return [
            SearchResult(
                title=r.get("title", ""),
                url=r.get("url", ""),
                snippet=r.get("text", "")[:400],
                source="exa",
                score=1.2,  # Semantic search = higher relevance
            )
            for r in data.get("results", [])
        ]

    async def _jina_search(self, query: str) -> list[SearchResult]:
        """Jina Reader — converts search results to clean markdown."""
        resp = await self.client.get(f"https://s.jina.ai/{query}")
        # Jina returns markdown — parse top results
        lines = resp.text.split("\n")
        results = []
        for line in lines:
            if line.startswith("http") and len(results) < 5:
                results.append(SearchResult(
                    title=line[:60],
                    url=line.strip(),
                    snippet="",
                    source="jina",
                    score=0.8,
                ))
        return results

    async def _arxiv_search(self, query: str) -> list[SearchResult]:
        """ArXiv — academic papers, free API."""
        resp = await self.client.get(
            "https://export.arxiv.org/api/query",
            params={"search_query": f"all:{query}", "max_results": 5},
        )
        import xml.etree.ElementTree as ET
        root = ET.fromstring(resp.text)
        ns = {"atom": "http://www.w3.org/2005/Atom"}
        results = []
        for entry in root.findall("atom:entry", ns):
            results.append(SearchResult(
                title=entry.find("atom:title", ns).text.strip(),
                url=entry.find("atom:id", ns).text.strip(),
                snippet=entry.find("atom:summary", ns).text.strip()[:400],
                source="arxiv",
                score=1.3,
            ))
        return results

    async def _semantic_scholar_search(self, query: str) -> list[SearchResult]:
        """Semantic Scholar — free academic search API."""
        resp = await self.client.get(
            "https://api.semanticscholar.org/graph/v1/paper/search",
            params={"query": query, "limit": 5, "fields": "title,abstract,url"},
        )
        data = resp.json()
        return [
            SearchResult(
                title=p.get("title", ""),
                url=p.get("url", f"https://semanticscholar.org/paper/{p.get('paperId','')}"),
                snippet=p.get("abstract", "")[:400],
                source="semantic_scholar",
                score=1.3,
            )
            for p in data.get("data", [])
        ]

    async def _github_search(self, query: str) -> list[SearchResult]:
        """GitHub code/repo search — free tier."""
        resp = await self.client.get(
            "https://api.github.com/search/repositories",
            headers={"Accept": "application/vnd.github+json"},
            params={"q": query, "sort": "stars", "per_page": 5},
        )
        data = resp.json()
        return [
            SearchResult(
                title=r.get("full_name", ""),
                url=r.get("html_url", ""),
                snippet=r.get("description", "") or "",
                source="github",
                score=1.0,
            )
            for r in data.get("items", [])
        ]

    async def _stackoverflow_search(self, query: str) -> list[SearchResult]:
        """Stack Overflow — free API."""
        resp = await self.client.get(
            "https://api.stackexchange.com/2.3/search/advanced",
            params={"order": "desc", "sort": "relevance", "q": query,
                    "site": "stackoverflow", "pagesize": 5},
        )
        data = resp.json()
        return [
            SearchResult(
                title=r.get("title", ""),
                url=r.get("link", ""),
                snippet=f"Score: {r.get('score',0)} | Answers: {r.get('answer_count',0)}",
                source="stackoverflow",
                score=0.9,
            )
            for r in data.get("items", [])
        ]

    async def _hn_search(self, query: str) -> list[SearchResult]:
        """Hacker News — Algolia API, free."""
        resp = await self.client.get(
            "https://hn.algolia.com/api/v1/search",
            params={"query": query, "tags": "story", "hitsPerPage": 5},
        )
        data = resp.json()
        return [
            SearchResult(
                title=r.get("title", ""),
                url=r.get("url", f"https://news.ycombinator.com/item?id={r.get('objectID')}"),
                snippet=f"Points: {r.get('points',0)} | Comments: {r.get('num_comments',0)}",
                source="hackernews",
                score=0.85,
            )
            for r in data.get("hits", [])
        ]

    async def _reddit_search(self, query: str) -> list[SearchResult]:
        """Reddit — free JSON API."""
        resp = await self.client.get(
            f"https://www.reddit.com/search.json",
            headers={"User-Agent": "QUAERYX/0.1"},
            params={"q": query, "sort": "relevance", "limit": 5},
        )
        data = resp.json()
        return [
            SearchResult(
                title=r["data"].get("title", ""),
                url=f"https://reddit.com{r['data'].get('permalink','')}",
                snippet=r["data"].get("selftext", "")[:300],
                source="reddit",
                score=0.8,
            )
            for r in data.get("data", {}).get("children", [])
        ]

    async def close(self):
        await self.client.aclose()
