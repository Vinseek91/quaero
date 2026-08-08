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

const SOURCE_COLORS: Record<string, string> = {
  brave: "bg-orange-500",
  tavily: "bg-blue-500",
  exa: "bg-purple-500",
  duckduckgo: "bg-red-500",
  arxiv: "bg-green-600",
  github: "bg-gray-600",
  stackoverflow: "bg-amber-500",
  hackernews: "bg-orange-600",
  reddit: "bg-red-600",
  jina: "bg-teal-500",
  semantic_scholar: "bg-indigo-600",
  wikipedia: "bg-gray-700",
};

const MODES: { id: SearchMode; label: string; icon: string }[] = [
  { id: "general",    label: "General",  icon: "⬡" },
  { id: "academic",   label: "Academic", icon: "◈" },
  { id: "code",       label: "Code",     icon: "</>" },
  { id: "news",       label: "News",     icon: "◉" },
  { id: "prediction", label: "Predict",  icon: "◎" },
];

export default function Home() {
  const [query, setQuery]               = useState("");
  const [mode, setMode]                 = useState<SearchMode>("general");
  const [results, setResults]           = useState<SearchResult[]>([]);
  const [answer, setAnswer]             = useState("");
  const [prediction, setPrediction]     = useState<Prediction | null>(null);
  const [loading, setLoading]           = useState(false);
  const [deepResearch, setDeepResearch] = useState(false);
  const [round, setRound]               = useState(0);
  const answerRef = useRef<HTMLDivElement>(null);

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
      setAnswer("Search failed — is the QUAERO API running?\n\ncd apps/api && uvicorn main:app --reload");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white text-gray-800 font-mono">

      {/* ── HEADER ── */}
      <header className="border-b border-gray-200 px-6 py-4 flex items-center gap-4 bg-white shadow-sm">
        <div className="flex items-center gap-3">
          <svg width="36" height="36" viewBox="0 0 36 36">
            <defs>
              <linearGradient id="qg" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%"   stopColor="#4285F4"/>
                <stop offset="50%"  stopColor="#3fe0a8"/>
                <stop offset="100%" stopColor="#FBBC05"/>
              </linearGradient>
            </defs>
            <circle cx="18" cy="18" r="16" fill="none" stroke="url(#qg)" strokeWidth="2"/>
            <text x="18" y="23" textAnchor="middle" fontSize="14" fontWeight="700" fill="#1f2937">Q</text>
          </svg>
          <span className="text-xl font-bold tracking-widest text-gray-900">QUAERO</span>
        </div>
        <span className="text-xs text-gray-400 tracking-widest hidden sm:block">THE ORIGIN OF SEARCH</span>
        <a
          href="https://github.com/Vinseek91/quaero"
          target="_blank"
          className="ml-auto text-xs text-gray-500 hover:text-gray-800 transition-colors border border-gray-200 px-3 py-1 rounded hover:border-gray-400"
        >
          ★ GitHub
        </a>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-12">

        {/* ── HERO ── */}
        {!answer && results.length === 0 && (
          <div className="text-center mb-14">
            <h1 className="text-6xl font-bold mb-4 bg-gradient-to-r from-blue-500 via-teal-500 to-amber-500 bg-clip-text text-transparent tracking-widest">
              QUAERO
            </h1>
            <p className="text-gray-400 text-xs tracking-[0.3em] mb-8">
              LATIN: I SEEK · THE ORIGIN OF THE WORD QUERY
            </p>
            <div className="flex justify-center gap-6 text-xs text-gray-400">
              <span>12 SOURCES</span>
              <span>·</span>
              <span>SWARM INTELLIGENCE</span>
              <span>·</span>
              <span>DEEP RESEARCH</span>
              <span>·</span>
              <span>OPEN SOURCE</span>
            </div>
          </div>
        )}

        {/* ── SEARCH FORM ── */}
        <form onSubmit={handleSearch} className="mb-6">
          <div className="flex gap-2 mb-3">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search anything — web, academic, code, news..."
              className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-5 py-3.5 text-sm outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100 transition-all placeholder:text-gray-400 text-gray-800"
              autoFocus
            />
            <button
              type="submit"
              disabled={loading}
              className="bg-gradient-to-r from-blue-500 via-teal-500 to-amber-500 text-white font-bold px-7 rounded-xl text-sm disabled:opacity-50 transition-opacity hover:opacity-90 shadow-sm"
            >
              {loading ? "···" : "SEARCH"}
            </button>
          </div>

          <div className="flex gap-2 flex-wrap items-center">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMode(m.id)}
                className={`px-3 py-1 rounded-lg text-xs border transition-colors ${
                  mode === m.id
                    ? "border-teal-400 bg-teal-50 text-teal-700"
                    : "border-gray-200 text-gray-500 hover:border-gray-400 hover:text-gray-700"
                }`}
              >
                {m.icon} {m.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setDeepResearch((d) => !d)}
              className={`px-3 py-1 rounded-lg text-xs border transition-colors ml-auto ${
                deepResearch
                  ? "border-purple-400 bg-purple-50 text-purple-700"
                  : "border-gray-200 text-gray-500 hover:border-gray-400"
              }`}
            >
              ◈ Deep Research
            </button>
          </div>
        </form>

        {/* ── RESEARCH ROUND ── */}
        {deepResearch && round > 0 && (
          <div className="mb-4 text-xs text-purple-600 tracking-wider">
            ◈ Research round {round} / 3 in progress...
          </div>
        )}

        {/* ── SOURCE RESULTS GRID ── */}
        {results.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-6">
            {results.slice(0, 8).map((r, i) => (
              <a
                key={i}
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                className="border border-gray-200 rounded-lg p-3 hover:border-gray-400 hover:shadow-sm transition-all block group bg-white"
              >
                <div className="flex items-start gap-2 mb-1.5">
                  <span className={`text-[9px] px-1.5 py-0.5 rounded ${SOURCE_COLORS[r.source] || "bg-gray-500"} text-white shrink-0 mt-0.5 uppercase`}>
                    {r.source}
                  </span>
                  {r.appearances > 1 && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-teal-100 text-teal-700 shrink-0 mt-0.5">
                      ×{r.appearances} sources
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-800 line-clamp-2 group-hover:text-gray-900 transition-colors font-medium">{r.title}</p>
                <p className="text-[11px] text-gray-400 mt-1 line-clamp-2">{r.snippet}</p>
              </a>
            ))}
          </div>
        )}

        {/* ── ANSWER ── */}
        {(answer || loading) && (
          <div className="border border-gray-200 rounded-xl p-6 mb-6 bg-gray-50">
            <div className="text-[10px] text-teal-600 mb-4 tracking-widest flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse"/>
              QUAERO SYNTHESIS · {results.length} SOURCES
            </div>
            <div
              ref={answerRef}
              className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap max-h-[65vh] overflow-y-auto"
            >
              {answer}
              {loading && <span className="animate-pulse text-teal-500">▋</span>}
            </div>
          </div>
        )}

        {/* ── MIROFISH PREDICTION ── */}
        {prediction?.enabled && prediction.prediction && (
          <div className="border border-purple-200 rounded-xl p-5 bg-purple-50">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-[10px] text-purple-600 tracking-widest">◎ MIROFISH SWARM PREDICTION</span>
              {prediction.confidence && (
                <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded">
                  {prediction.confidence}% agent consensus
                </span>
              )}
            </div>
            <p className="text-sm text-gray-700 leading-relaxed mb-3">{prediction.prediction}</p>
            {prediction.top_viewpoints && prediction.top_viewpoints.length > 0 && (
              <div className="space-y-1 border-t border-purple-100 pt-3">
                <div className="text-[10px] text-gray-400 mb-2">TOP VIEWPOINTS FROM 500 AGENTS</div>
                {prediction.top_viewpoints.map((v, i) => (
                  <div key={i} className="text-xs text-gray-600 flex gap-2">
                    <span className="text-purple-500">◎</span>{v}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </main>

      {/* ── FOOTER ── */}
      <footer className="fixed bottom-0 left-0 right-0 border-t border-gray-200 bg-white px-6 py-2 flex justify-between text-[10px] text-gray-400">
        <span>QUAERO · Open Source · Apache 2.0 · github.com/Vinseek91/quaero</span>
        <span>12 sources · OmniRoute · MiroFish swarm intelligence</span>
      </footer>
    </div>
  );
}
