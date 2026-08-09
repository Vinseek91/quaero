<div align="center">

<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80">
  <circle cx="40" cy="40" r="38" fill="none" stroke="url(#g)" stroke-width="3"/>
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#4285F4"/>
      <stop offset="50%" stop-color="#3fe0a8"/>
      <stop offset="100%" stop-color="#FBBC05"/>
    </linearGradient>
  </defs>
  <text x="40" y="52" text-anchor="middle" font-size="32" font-weight="700" fill="white" font-family="system-ui">Q</text>
</svg>

# QUAERYX

### The search engine born from the word *"search"*

*Quaero (Latin): I seek — the root of the word **query** itself*

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Stars](https://img.shields.io/github/stars/Vinseek91/quaeryx?style=social)](https://github.com/Vinseek91/quaeryx)
[![Docker](https://img.shields.io/badge/docker-one%20command-teal.svg)](docker-compose.yml)

**More powerful than Google + Perplexity combined — and completely free.**

</div>

---

## What Makes QUAERYX Different

| | Google | Perplexity | **QUAERYX** |
|---|---|---|---|
| Search sources | 1 index | Bing only | **12+ simultaneously** |
| Gets smarter over time | ✗ | ✗ | **✓ community knowledge graph** |
| Swarm intelligence prediction | ✗ | ✗ | **✓ MiroFish (500+ agents)** |
| Deep multi-hop research | ✗ | Pro ($20/mo) | **✓ Free** |
| Self-hostable | ✗ | ✗ | **✓ One command** |
| Model routing (cheapest capable) | ✗ | ✗ | **✓ OmniRoute** |
| Open source | ✗ | ✗ | **✓ Apache 2.0** |
| Cost to user | Ads | $20/mo | **Free** |

---

## Quick Start

```bash
# One command — that's it
# Docker image coming soon — use git clone below

# Open http://localhost:3000
```

Or with full stack (recommended):

```bash
git clone https://github.com/Vinseek91/quaeryx
cd quaeryx
cp .env.example .env   # add free API keys (optional — works without)
docker compose up
```

---

## Search Modes

| Mode | Sources | Best For |
|---|---|---|
| **General** | Brave, Exa, Tavily, DDG, Jina | Everything |
| **Academic** | ArXiv, Semantic Scholar + General | Research papers |
| **Code** | GitHub, Stack Overflow + General | Technical questions |
| **News** | HN, Reddit + General | Current events |
| **Predict** | All + **MiroFish swarm** | Future outcomes |
| **Deep Research** | All sources × 3 rounds | Comprehensive reports |

---

## MiroFish Swarm Intelligence

QUAERYX is the first search engine with built-in **swarm prediction**.

For any query, 500+ AI agents with diverse personalities debate the topic and produce:
- **Consensus prediction** with confidence %
- **Controversy map** — where agents disagree and why
- **Top viewpoints** across the agent population
- **Misinformation detection** — credibility scoring

```
Search: "Will quantum computing break current encryption by 2030?"

QUAERYX answer: [current state of research, cited]

MiroFish prediction:
  72% agent consensus: "Unlikely before 2032"
  Controversy score: 0.6 (moderately contested)
  Top viewpoints:
    ◎ Post-quantum standards will be widely adopted first (38% agents)
    ◎ Timeline depends heavily on error correction breakthroughs (29% agents)
    ◎ Nation-state actors may have undisclosed capabilities (21% agents)
```

---

## Architecture

```
Query → Intent Classifier (Gemini Flash, free)
      → Universal Search (12 sources, parallel)
      → Reasoning Engine (OmniRoute: cheapest capable model)
      → MiroFish Layer (optional: 500-agent swarm simulation)
      → Streaming Response (SSE, real-time)
```

**Cost per 1,000 searches: ~$0.08**
(90% of queries hit free model tiers via OmniRoute)

---

## API

```bash
# Simple search
GET /api/search?q=your+query&mode=general

# Deep research (multi-hop, 3 rounds)
GET /api/deep-research?q=your+query&rounds=3

# With swarm prediction
GET /api/search?q=your+query&predict=true

# List active providers
GET /api/providers
```

### MCP Server (for AI agents)

```bash
# Any AI agent can use QUAERYX as a search tool
claude mcp add quaeryx http://localhost:8000/mcp
```

---

## Free API Keys (Optional)

QUAERYX works without any API keys using DDG + Jina. Add these for better results:

| Provider | Free Tier | Get Key |
|---|---|---|
| Brave Search | 2,000/month | [brave.com/search/api](https://brave.com/search/api/) |
| Tavily | 1,000/month | [tavily.com](https://tavily.com) |
| Exa | 1,000/month | [exa.ai](https://exa.ai) |

---

## Self-Host in 60 Seconds

```bash
curl -fsSL https://get.quaeryx.dev | bash
# → runs on http://localhost:3000
```

---

## Contributing

QUAERYX is built for the community. Contributions welcome:

- **Add a search provider** — `packages/search/aggregator.py`
- **Improve reasoning** — `packages/reasoning/engine.py`
- **Build the knowledge graph** — `packages/graph/`
- **Add a language** — `i18n/`

```bash
git clone https://github.com/Vinseek91/quaeryx
cd quaeryx && docker compose up
```

---

## Stack

- **Backend** — FastAPI, Python, async/SSE streaming
- **Frontend** — Next.js 15, Tailwind CSS
- **Search** — Brave, Exa, Tavily, DDG, Jina, ArXiv, GitHub, SO, HN, Reddit
- **Models** — OmniRoute → Gemini Flash (free) + Claude Sonnet (reasoning)
- **Prediction** — MiroFish swarm intelligence engine
- **Storage** — Redis (cache) + Qdrant (vectors)
- **Deploy** — Docker Compose (one command)

---

<div align="center">

**QUAERYX** — Apache 2.0 — Built for the open source community

*"I seek, therefore I find"*

</div>
