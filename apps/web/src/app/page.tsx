"use client";

import { useState, useRef, useEffect } from "react";

type SearchMode = "general" | "academic" | "code" | "news" | "prediction";

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  source: string;
  score: number;
  appearances: number;
}

interface Prediction {
  enabled: boolean;
  consensus?: string;
  confidence?: number;
  top_viewpoints?: string[];
  prediction?: string;
}

const SOURCE_ICONS: Record<string, string> = {
  wikipedia:        "https://www.google.com/s2/favicons?domain=wikipedia.org&sz=32",
  brave:            "https://www.google.com/s2/favicons?domain=search.brave.com&sz=32",
  tavily:           "https://www.google.com/s2/favicons?domain=tavily.com&sz=32",
  exa:              "https://www.google.com/s2/favicons?domain=exa.ai&sz=32",
  duckduckgo:       "https://www.google.com/s2/favicons?domain=duckduckgo.com&sz=32",
  arxiv:            "https://www.google.com/s2/favicons?domain=arxiv.org&sz=32",
  github:           "https://www.google.com/s2/favicons?domain=github.com&sz=32",
  stackoverflow:    "https://www.google.com/s2/favicons?domain=stackoverflow.com&sz=32",
  hackernews:       "https://www.google.com/s2/favicons?domain=news.ycombinator.com&sz=32",
  reddit:           "https://www.google.com/s2/favicons?domain=reddit.com&sz=32",
  semantic_scholar: "https://www.google.com/s2/favicons?domain=semanticscholar.org&sz=32",
};

const SOURCE_COLORS: Record<string, string> = {
  wikipedia:        "bg-gray-100 text-gray-600",
  brave:            "bg-orange-50 text-orange-600",
  tavily:           "bg-blue-50 text-blue-600",
  exa:              "bg-purple-50 text-purple-600",
  duckduckgo:       "bg-red-50 text-red-600",
  arxiv:            "bg-green-50 text-green-700",
  github:           "bg-gray-100 text-gray-700",
  stackoverflow:    "bg-amber-50 text-amber-600",
  hackernews:       "bg-orange-50 text-orange-700",
  reddit:           "bg-red-50 text-red-600",
  semantic_scholar: "bg-indigo-50 text-indigo-600",
};

const MODES: { id: SearchMode; label: string; icon: string }[] = [
  { id: "general",    label: "General",  icon: "⬡" },
  { id: "academic",   label: "Academic", icon: "◈" },
  { id: "code",       label: "Code",     icon: "</>" },
  { id: "news",       label: "News",     icon: "◉" },
  { id: "prediction", label: "Predict",  icon: "◎" },
];

function getFavicon(url: string, source: string): string {
  if (SOURCE_ICONS[source]) return SOURCE_ICONS[source];
  try {
    const domain = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
  } catch {
    return "";
  }
}

function SkeletonCard() {
  return (
    <div className="border border-gray-100 rounded-2xl p-4 bg-white shadow-sm animate-pulse">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-5 h-5 rounded-full bg-gray-200" />
        <div className="h-3 w-16 rounded bg-gray-200" />
      </div>
      <div className="h-4 w-full rounded bg-gray-200 mb-2" />
      <div className="h-3 w-3/4 rounded bg-gray-200" />
    </div>
  );
}

export default function Home() {
  const [query, setQuery]               = useState("");
  const [mode, setMode]                 = useState<SearchMode>("general");
  const [results, setResults]           = useState<SearchResult[]>([]);
  const [answer, setAnswer]             = useState("");
  const [prediction, setPrediction]     = useState<Prediction | null>(null);
  const [loading, setLoading]           = useState(false);
  const [deepResearch, setDeepResearch] = useState(false);
  const [round, setRound]               = useState(0);
  const [visible, setVisible]           = useState(false);
  const answerRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setVisible(true); }, []);

  useEffect(() => {
    if (answerRef.current) {
      answerRef.current.scrollTop = answerRef.current.scrollHeight;
    }
  }, [answer]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setAnswer("");
    setResults([]);
    setPrediction(null);
    setRound(0);

    const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    const endpoint = deepResearch
      ? `${API}/api/deep-research?q=${encodeURIComponent(query)}&rounds=3`
      : `${API}/api/search?q=${encodeURIComponent(query)}&mode=${mode}&stream=true&predict=${mode === "prediction"}`;

    try {
      const resp = await fetch(endpoint);
      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value);
        for (const line of text.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === "results")      setResults(data.data || []);
            if (data.type === "answer_chunk") setAnswer((a) => a + data.data);
            if (data.type === "prediction")   setPrediction(data.data);
            if (data.type === "round_start")  setRound(data.round);
          } catch {}
        }
      }
    } catch {
      setAnswer("Search failed — is the QUAERYX API running?\n\ncd apps/api && uvicorn main:app --reload");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`min-h-screen bg-[#f8f9fc] text-gray-800 transition-opacity duration-700 ${visible ? "opacity-100" : "opacity-0"}`}
      style={{ fontFamily: "'Inter', 'system-ui', sans-serif" }}>

      {/* ── HEADER ── */}
      <header className="border-b border-gray-200/80 px-6 py-3.5 flex items-center gap-4 bg-white/80 backdrop-blur-md sticky top-0 z-50 shadow-sm">
        <div className="flex items-center gap-2.5">
          <svg width="34" height="34" viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="qgrad" x1="0" y1="0" x2="44" y2="44" gradientUnits="userSpaceOnUse">
                <stop offset="0%"   stopColor="#4285F4"/>
                <stop offset="50%"  stopColor="#3fe0a8"/>
                <stop offset="100%" stopColor="#FBBC05"/>
              </linearGradient>
            </defs>
            {/* Bold Q body */}
            <circle cx="19" cy="19" r="13" fill="url(#qgrad)" opacity="0.12"/>
            <circle cx="19" cy="19" r="13" fill="none" stroke="url(#qgrad)" strokeWidth="3.5"/>
            {/* Extended tail — the search arrow */}
            <line x1="27" y1="27" x2="38" y2="38" stroke="url(#qgrad)" strokeWidth="4" strokeLinecap="round"/>
            {/* Inner dot */}
            <circle cx="19" cy="19" r="4" fill="url(#qgrad)"/>
          </svg>
          <span className="text-lg font-bold tracking-widest text-gray-900">QUAERYX</span>
        </div>
        <span className="text-[11px] text-gray-400 tracking-widest hidden sm:block font-medium">THE NEXT GENERATION OF SEARCH</span>
        <div className="ml-auto flex items-center gap-3">
          <a
            href="https://github.com/Vinseek91/quaeryx"
            target="_blank"
            className="text-xs text-gray-500 hover:text-gray-900 transition-all border border-gray-200 hover:border-gray-400 px-3 py-1.5 rounded-lg hover:shadow-sm flex items-center gap-1.5"
          >
            <span>★</span> GitHub
          </a>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-10 pb-24">

        {/* ── HERO ── */}
        {!answer && results.length === 0 && !loading && (
          <div className="text-center mb-12">
            <div className="flex justify-center mb-5">
              <svg width="72" height="72" viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <linearGradient id="qgrad2" x1="0" y1="0" x2="44" y2="44" gradientUnits="userSpaceOnUse">
                    <stop offset="0%"   stopColor="#4285F4"/>
                    <stop offset="50%"  stopColor="#3fe0a8"/>
                    <stop offset="100%" stopColor="#FBBC05"/>
                  </linearGradient>
                </defs>
                <circle cx="19" cy="19" r="13" fill="url(#qgrad2)" opacity="0.12"/>
                <circle cx="19" cy="19" r="13" fill="none" stroke="url(#qgrad2)" strokeWidth="3.5"/>
                <line x1="27" y1="27" x2="38" y2="38" stroke="url(#qgrad2)" strokeWidth="4" strokeLinecap="round"/>
                <circle cx="19" cy="19" r="4" fill="url(#qgrad2)"/>
              </svg>
            </div>
            <h1 className="text-7xl font-black mb-3 bg-gradient-to-r from-blue-500 via-teal-400 to-amber-400 bg-clip-text text-transparent tracking-widest leading-tight">
              QUAERYX
            </h1>
            <p className="text-gray-400 text-xs tracking-[0.35em] mb-10 font-medium">
              LATIN: I SEEK · THE NEXT GENERATION OF SEARCH
            </p>
            <div className="flex justify-center gap-8 text-xs text-gray-400 font-medium">
              <span>12 SOURCES</span>
              <span className="text-gray-200">·</span>
              <span>SWARM INTELLIGENCE</span>
              <span className="text-gray-200">·</span>
              <span>DEEP RESEARCH</span>
              <span className="text-gray-200">·</span>
              <span>OPEN SOURCE</span>
            </div>
          </div>
        )}

        {/* ── SEARCH FORM ── */}
        <form onSubmit={handleSearch} className="mb-8">
          <div className="flex gap-2.5 mb-4">
            <div className="flex-1 relative">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search anything — web, academic, code, news..."
                className="w-full bg-white border border-gray-200 rounded-2xl px-5 py-4 text-sm outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-50 transition-all placeholder:text-gray-400 text-gray-800 shadow-sm hover:shadow-md hover:border-gray-300"
                autoFocus
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="bg-gradient-to-r from-blue-500 via-teal-500 to-amber-500 text-white font-bold px-8 rounded-2xl text-sm disabled:opacity-60 transition-all hover:opacity-90 hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] shadow-md"
            >
              {loading ? (
                <span className="flex items-center gap-1">
                  <span className="animate-bounce" style={{animationDelay:"0ms"}}>·</span>
                  <span className="animate-bounce" style={{animationDelay:"150ms"}}>·</span>
                  <span className="animate-bounce" style={{animationDelay:"300ms"}}>·</span>
                </span>
              ) : "Search"}
            </button>
          </div>

          <div className="flex gap-2 flex-wrap items-center">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMode(m.id)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                  mode === m.id
                    ? "border-teal-400 bg-teal-50 text-teal-700 shadow-sm"
                    : "border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700 hover:bg-white hover:shadow-sm bg-transparent"
                }`}
              >
                {m.icon} {m.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setDeepResearch((d) => !d)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-medium border transition-all ml-auto ${
                deepResearch
                  ? "border-purple-400 bg-purple-50 text-purple-700 shadow-sm"
                  : "border-gray-200 text-gray-500 hover:border-gray-300 hover:bg-white hover:shadow-sm"
              }`}
            >
              ◈ Deep Research
            </button>
          </div>
        </form>

        {/* ── RESEARCH ROUND ── */}
        {deepResearch && round > 0 && (
          <div className="mb-5 text-xs text-purple-600 tracking-wider font-medium flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse"/>
            Research round {round} / 3 in progress...
          </div>
        )}

        {/* ── SKELETON LOADERS ── */}
        {loading && results.length === 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
            {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
          </div>
        )}

        {/* ── SOURCE RESULTS GRID ── */}
        {results.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
            {results.slice(0, 8).map((r, i) => (
              <a
                key={i}
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                className="border border-gray-200 rounded-2xl p-4 hover:border-gray-300 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 block group bg-white shadow-sm"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <div className="flex items-center gap-2 mb-2.5">
                  <img
                    src={getFavicon(r.url, r.source)}
                    alt={r.source}
                    width={16}
                    height={16}
                    className="rounded-sm opacity-80"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                  <span className={`text-[10px] px-2 py-0.5 rounded-lg font-semibold uppercase tracking-wide ${SOURCE_COLORS[r.source] || "bg-gray-100 text-gray-600"}`}>
                    {r.source.replace("_", " ")}
                  </span>
                  {r.appearances > 1 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-lg bg-teal-50 text-teal-600 font-semibold ml-auto">
                      ×{r.appearances}
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-800 line-clamp-2 group-hover:text-gray-900 transition-colors font-semibold leading-snug mb-1.5">{r.title}</p>
                <p className="text-xs text-gray-400 line-clamp-2 leading-relaxed">{r.snippet}</p>
              </a>
            ))}
          </div>
        )}

        {/* ── ANSWER ── */}
        {(answer || (loading && results.length > 0)) && (
          <div className="border border-gray-200 rounded-2xl p-6 mb-6 bg-white shadow-sm">
            <div className="text-[10px] text-teal-600 mb-4 tracking-widest flex items-center gap-2 font-semibold uppercase">
              <span className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse"/>
              QUAERYX SYNTHESIS · {results.length} SOURCES
            </div>
            <div
              ref={answerRef}
              className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap max-h-[65vh] overflow-y-auto"
              style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
            >
              {answer}
              {loading && <span className="animate-pulse text-teal-500 ml-0.5">▋</span>}
            </div>
          </div>
        )}

        {/* ── MIROFISH PREDICTION ── */}
        {prediction?.enabled && prediction.prediction && (
          <div className="border border-purple-200 rounded-2xl p-5 bg-white shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-[10px] text-purple-600 tracking-widest font-semibold">◎ MIROFISH SWARM PREDICTION</span>
              {prediction.confidence && (
                <span className="text-[10px] bg-purple-50 text-purple-700 px-2 py-0.5 rounded-lg font-semibold">
                  {prediction.confidence}% consensus
                </span>
              )}
            </div>
            <p className="text-sm text-gray-700 leading-relaxed mb-3">{prediction.prediction}</p>
            {prediction.top_viewpoints && prediction.top_viewpoints.length > 0 && (
              <div className="space-y-1.5 border-t border-purple-100 pt-3">
                <div className="text-[10px] text-gray-400 mb-2 font-semibold tracking-wider uppercase">Top Viewpoints · 500 Agents</div>
                {prediction.top_viewpoints.map((v, i) => (
                  <div key={i} className="text-xs text-gray-600 flex gap-2 items-start">
                    <span className="text-purple-400 mt-0.5">◎</span>{v}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </main>

      {/* ── FOOTER ── */}
      <footer className="fixed bottom-0 left-0 right-0 border-t border-gray-200/80 bg-white/80 backdrop-blur-md px-6 py-2.5 flex justify-between text-[10px] text-gray-400 font-medium">
        <span>QUAERYX · Open Source · Apache 2.0</span>
        <a href="https://github.com/Vinseek91/quaeryx" target="_blank" className="hover:text-gray-600 transition-colors">github.com/Vinseek91/quaeryx</a>
      </footer>
    </div>
  );
}
