"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneLight, oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

const HISTORY_KEY = "quaeryx_history";

type SearchMode = "general" | "academic" | "code" | "news" | "prediction";
type ConnectorType = null | "url" | "youtube" | "gdrive" | "github" | "rss";

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

const GROQ_MODELS = [
  { id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B",      desc: "Best quality · Default",      provider: "Groq"   },
  { id: "llama-3.1-8b-instant",    label: "Llama 3.1 8B",       desc: "Lightning fast · 2× speed",   provider: "Groq"   },
  { id: "mixtral-8x7b-32768",      label: "Mixtral 8×7B",       desc: "32K context window",           provider: "Groq"   },
  { id: "gemma2-9b-it",            label: "Gemma 2 9B",         desc: "Google · Efficient",           provider: "Groq"   },
  { id: "llama3-70b-8192",         label: "Llama 3 70B",        desc: "Classic · Reliable",           provider: "Groq"   },
  { id: "gemini-2.0-flash",        label: "Gemini 2.0 Flash",   desc: "Google · Fast & smart",        provider: "Gemini" },
  { id: "gemini-1.5-flash",        label: "Gemini 1.5 Flash",   desc: "Google · 1M context",          provider: "Gemini" },
];

function getFavicon(url: string, source: string): string {
  if (SOURCE_ICONS[source]) return SOURCE_ICONS[source];
  try {
    const domain = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
  } catch { return ""; }
}

function isYouTubeUrl(s: string) { return /youtube\.com|youtu\.be/.test(s); }
function isHttpUrl(s: string)    { return /^https?:\/\/\S+/.test(s.trim()); }

/** Replace [source N] / [N] in the AI answer with clickable markdown links. */
function processCitations(text: string, results: SearchResult[]): string {
  return text.replace(/\[(?:source\s+)?(\d+)\]/gi, (_match, num) => {
    const idx = parseInt(num, 10) - 1;
    const result = results[idx];
    return result ? `[[${num}]](${result.url})` : `[${num}]`;
  });
}

/** Extract the last 3 questions (?) from the answer as follow-up suggestions. */
function extractFollowUps(text: string): string[] {
  const questions: string[] = [];
  for (const line of text.split("\n")) {
    const clean = line
      .trim()
      .replace(/^\d+[\.\)]\s*/, "")   // remove "1. " or "1) "
      .replace(/^\*+\s*/, "")          // remove "* "
      .replace(/\*\*/g, "")            // remove **bold**
      .trim();
    if (clean.endsWith("?") && clean.length > 25 && clean.length < 220) {
      questions.push(clean);
    }
  }
  // Return up to 3, preferring the last ones (AI puts follow-ups at end)
  return questions.slice(-3);
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

  // Voice
  const [isListening, setIsListening]   = useState(false);
  const recognitionRef = useRef<any>(null);

  // File upload
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Connectors
  const [connector, setConnector]       = useState<ConnectorType>(null);
  const [connectorInput, setConnectorInput] = useState(""); // URL or YT link
  const [gdriveToken, setGdriveToken]   = useState<string | null>(null);
  const [docInfo, setDocInfo]           = useState<{ filename: string; chars: number } | null>(null);

  // Connector panel (Perplexity-style picker)
  const [showConnectorPanel, setShowConnectorPanel] = useState(false);
  // Connector modal
  const [showConnectorModal, setShowConnectorModal] = useState<null | "url" | "youtube" | "github" | "rss">(null);
  const [modalUrl, setModalUrl]         = useState("");
  const [modalQuestion, setModalQuestion] = useState("");

  // Image results
  const [images, setImages]             = useState<{ url: string; title: string; page_url: string }[]>([]);

  // Follow-up questions
  const [followUps, setFollowUps]       = useState<string[]>([]);

  // Search history
  const [history, setHistory]           = useState<string[]>([]);
  const [showHistory, setShowHistory]   = useState(false);

  // Trending
  const [trending, setTrending]         = useState<{ title: string; source: string }[]>([]);

  // Export
  const [exported, setExported]         = useState(false);

  // Comparison mode
  const [isComparison, setIsComparison] = useState(false);

  // Detected language
  const [detectedLang, setDetectedLang] = useState("");

  // Collections
  const [collections, setCollections]   = useState<{ id: string; query: string; answer: string; mode: string; date: string }[]>([]);
  const [showCollections, setShowCollections] = useState(false);

  // Settings panel
  const [showSettings, setShowSettings] = useState(false);
  const [apiKeys, setApiKeys]           = useState({ brave: "", tavily: "", exa: "" });

  // Copy answer
  const [answerCopied, setAnswerCopied] = useState(false);

  // Dark mode
  const [isDark, setIsDark]             = useState(false);

  // Share
  const [copied, setCopied]             = useState(false);

  // Search input ref for keyboard shortcuts
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Model selector
  const [selectedModel, setSelectedModel] = useState("llama-3.3-70b-versatile");
  const [showModelMenu, setShowModelMenu] = useState(false);

  const answerRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setVisible(true); }, []);

  // Load dark mode preference
  useEffect(() => {
    const saved = localStorage.getItem("quaeryx_dark");
    if (saved === "1") { setIsDark(true); document.documentElement.classList.add("dark"); }
  }, []);

  const toggleDark = () => {
    setIsDark((d) => {
      const next = !d;
      if (next) { document.documentElement.classList.add("dark"); localStorage.setItem("quaeryx_dark", "1"); }
      else       { document.documentElement.classList.remove("dark"); localStorage.removeItem("quaeryx_dark"); }
      return next;
    });
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const active = document.activeElement;
      const inInput = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement;
      // Cmd+K or Ctrl+K — focus search
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
      // "/" — focus search (when not already typing)
      if (e.key === "/" && !inInput) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      // Escape — blur and close dropdowns
      if (e.key === "Escape") {
        (document.activeElement as HTMLElement)?.blur();
        setShowHistory(false);
        setShowModelMenu(false);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // Load search history from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(HISTORY_KEY);
      if (saved) setHistory(JSON.parse(saved));
      const cols = localStorage.getItem("quaeryx_collections");
      if (cols) setCollections(JSON.parse(cols));
      const keys = localStorage.getItem("quaeryx_api_keys");
      if (keys) setApiKeys(JSON.parse(keys));
    } catch {}
  }, []);

  // Fetch trending on mount
  useEffect(() => {
    const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    fetch(`${API}/api/trending`)
      .then((r) => r.json())
      .then((d) => setTrending(d.trending || []))
      .catch(() => {});
  }, []);

  // Extract follow-up questions once answer is complete
  useEffect(() => {
    if (!loading && answer) {
      setFollowUps(extractFollowUps(answer));
    }
  }, [loading, answer]);

  // Close history on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest("[data-search-box]")) setShowHistory(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (answerRef.current) answerRef.current.scrollTop = answerRef.current.scrollHeight;
  }, [answer]);

  // Close model menu and more menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest("[data-model-menu]")) setShowModelMenu(false);
      if (!(e.target as HTMLElement).closest("[data-connector-panel]")) setShowConnectorPanel(false);
      if (!(e.target as HTMLElement).closest("[data-more-menu]"))
        document.querySelector("[data-more-panel]")?.classList.add("hidden");
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Listen for Google Drive token from OAuth popup
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "gdrive_token") {
        setGdriveToken(e.data.token);
        setConnector("gdrive");
      }
    };
    window.addEventListener("message", handler);
    // Also check localStorage (fallback)
    const saved = localStorage.getItem("gdrive_token");
    if (saved) { setGdriveToken(saved); }
    return () => window.removeEventListener("message", handler);
  }, []);

  // Auto-detect YouTube / URL when user pastes
  const handleQueryChange = (val: string) => {
    setQuery(val);
    setIsComparison(/\bvs\.?\b|\bversus\b|\bcompare\b/i.test(val));
    if (isYouTubeUrl(val)) {
      setConnector("youtube");
      setConnectorInput(val);
    } else if (isHttpUrl(val) && connector !== "gdrive") {
      setConnector("url");
      setConnectorInput(val);
    }
  };

  // Auto-search from share link
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const q = params.get("q");
    const m = params.get("mode") as SearchMode;
    if (q) {
      setQuery(q);
      if (m && MODES.find((x) => x.id === m)) setMode(m);
      setTimeout(() => runSearch(q, m || "general"), 100);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runSearch = useCallback(async (q: string, m: SearchMode = mode) => {
    if (!q.trim() && !connectorInput.trim()) return;
    setLoading(true);
    setAnswer("");
    setResults([]);
    setImages([]);
    setPrediction(null);
    setRound(0);
    setDocInfo(null);
    setFollowUps([]);

    const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

    // Fetch images in parallel (non-blocking)
    if (!uploadedFile && connector === null) {
      fetch(`${API}/api/images?q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((d) => setImages(d.images || []))
        .catch(() => {});
    }
    let endpoint = "";
    let fetchOptions: RequestInit = {};

    if (uploadedFile) {
      const fd = new FormData();
      fd.append("file", uploadedFile);
      fd.append("question", q);
      fd.append("model", selectedModel);
      endpoint = `${API}/api/upload`;
      fetchOptions = { method: "POST", body: fd };
    } else if (connector === "youtube") {
      const fd = new FormData();
      fd.append("url", connectorInput || q);
      fd.append("question", q);
      fd.append("model", selectedModel);
      endpoint = `${API}/api/youtube`;
      fetchOptions = { method: "POST", body: fd };
    } else if (connector === "url") {
      const fd = new FormData();
      fd.append("url", connectorInput || q);
      fd.append("question", q);
      fd.append("model", selectedModel);
      endpoint = `${API}/api/url`;
      fetchOptions = { method: "POST", body: fd };
    } else if (connector === "gdrive" && gdriveToken) {
      const fd = new FormData();
      fd.append("q", q);
      fd.append("question", q);
      fd.append("model", selectedModel);
      endpoint = `${API}/api/gdrive/search`;
      fetchOptions = { method: "POST", body: fd, headers: { Authorization: `Bearer ${gdriveToken}` } };
    } else if (connector === "github") {
      const fd = new FormData();
      fd.append("url", connectorInput || q);
      fd.append("question", q);
      fd.append("model", selectedModel);
      endpoint = `${API}/api/github`;
      fetchOptions = { method: "POST", body: fd };
    } else if (connector === "rss") {
      const fd = new FormData();
      fd.append("url", connectorInput || q);
      fd.append("question", q);
      fd.append("model", selectedModel);
      endpoint = `${API}/api/rss`;
      fetchOptions = { method: "POST", body: fd };
    } else if (deepResearch) {
      endpoint = `${API}/api/deep-research?q=${encodeURIComponent(q)}&rounds=3`;
    } else {
      endpoint = `${API}/api/search?q=${encodeURIComponent(q)}&mode=${m}&stream=true&predict=${m === "prediction"}&model=${selectedModel}&comparison=${isComparison}`;
    }

    try {
      const resp = await fetch(endpoint, fetchOptions);
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
            if (data.type === "doc_info")     setDocInfo(data.data);
          } catch {}
        }
      }
    } catch {
      setAnswer("Search failed — is the QUAERYX API running?");
    } finally {
      setLoading(false);
      // Save to history
      if (q.trim() && !isHttpUrl(q)) {
        setHistory((prev) => {
          const next = [q, ...prev.filter((h) => h !== q)].slice(0, 20);
          try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch {}
          return next;
        });
      }
    }
  }, [mode, deepResearch, selectedModel, uploadedFile, connector, connectorInput, gdriveToken]);

  const handleExport = () => {
    if (!answer) return;
    const sources = results.map((r, i) => `[${i + 1}] ${r.title} — ${r.url}`).join("\n");
    const md = `# ${query}\n\n${answer}\n\n---\n\n## Sources\n${sources}`;
    const blob = new Blob([md], { type: "text/markdown" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `quaeryx-${query.slice(0, 40).replace(/\s+/g, "-").toLowerCase()}.md`;
    a.click();
    URL.revokeObjectURL(url);
    setExported(true);
    setTimeout(() => setExported(false), 2000);
  };

  const clearHistory = () => {
    setHistory([]);
    try { localStorage.removeItem(HISTORY_KEY); } catch {}
  };

  const copyAnswer = () => {
    if (!answer) return;
    navigator.clipboard.writeText(answer).then(() => {
      setAnswerCopied(true);
      setTimeout(() => setAnswerCopied(false), 2000);
    });
  };

  const saveToCollection = () => {
    if (!answer || !query) return;
    const item = { id: Date.now().toString(), query, answer: answer.slice(0, 500), mode, date: new Date().toLocaleDateString() };
    setCollections((prev) => {
      const next = [item, ...prev].slice(0, 50);
      try { localStorage.setItem("quaeryx_collections", JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const saveApiKeys = (keys: typeof apiKeys) => {
    setApiKeys(keys);
    try { localStorage.setItem("quaeryx_api_keys", JSON.stringify(keys)); } catch {}
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    runSearch(query, mode);
  };

  // Voice
  const startVoice = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { alert("Voice search requires Chrome or Edge."); return; }
    if (isListening) { recognitionRef.current?.stop(); return; }
    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = "en-US";
    rec.onstart  = () => setIsListening(true);
    rec.onend    = () => setIsListening(false);
    rec.onerror  = () => setIsListening(false);
    rec.onresult = (event: any) => {
      const t = event.results[0][0].transcript;
      setQuery(t);
      setTimeout(() => runSearch(t, mode), 200);
    };
    recognitionRef.current = rec;
    rec.start();
  };

  // File upload
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setUploadedFile(file);
    setConnector(null);
    setAnswer(""); setResults([]); setDocInfo(null);
  };
  const clearFile = () => {
    setUploadedFile(null); setDocInfo(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Share
  const handleShare = () => {
    const url = new URL(window.location.href.split("?")[0]);
    url.searchParams.set("q", query);
    url.searchParams.set("mode", mode);
    navigator.clipboard.writeText(url.toString()).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    });
  };

  // Google Drive OAuth
  const connectGDrive = async () => {
    const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    try {
      const res = await fetch(`${API}/api/gdrive/auth-url`);
      const data = await res.json();
      if (data.error) { alert(data.error); return; }
      const popup = window.open(data.auth_url, "gdrive_auth", "width=500,height=600");
      if (!popup) alert("Please allow popups for this site to connect Google Drive.");
    } catch {
      alert("Could not reach QUAERYX API.");
    }
  };

  const clearConnector = () => {
    setConnector(null); setConnectorInput("");
    setAnswer(""); setResults([]); setDocInfo(null);
  };

  const clearSearch = () => {
    setQuery(""); setResults([]); setAnswer(""); setPrediction(null);
    setImages([]); setDocInfo(null); setFollowUps([]);
    setUploadedFile(null); setConnector(null); setConnectorInput("");
    setDeepResearch(false); setRound(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const hasResults = results.length > 0 || !!answer;
  const selectedModelInfo = GROQ_MODELS.find((m) => m.id === selectedModel) ?? GROQ_MODELS[0];
  const isConnectorMode = !!uploadedFile || (connector !== null);

  return (
    <div
      className={`min-h-screen bg-[#f8f9fc] dark:bg-[#0f1117] text-gray-800 dark:text-[#e8eaf0] transition-opacity duration-700 ${visible ? "opacity-100" : "opacity-0"}`}
      style={{ fontFamily: "'Inter', 'system-ui', sans-serif" }}
    >
      {/* ── HEADER ── */}
      <header className="border-b border-gray-200/80 dark:border-[#2a2d3a]/80 px-6 py-3.5 flex items-center gap-4 bg-white/80 dark:bg-[#1a1d27]/80 backdrop-blur-md sticky top-0 z-50 shadow-sm">
        <button onClick={clearSearch} className="flex items-center gap-2.5 hover:opacity-80 transition-opacity" title="Back to home">
          <svg width="34" height="34" viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="qgrad" x1="0" y1="0" x2="44" y2="44" gradientUnits="userSpaceOnUse">
                <stop offset="0%"   stopColor="#F97316"/>
                <stop offset="50%"  stopColor="#FB923C"/>
                <stop offset="100%" stopColor="#FBBF24"/>
              </linearGradient>
            </defs>
            <circle cx="19" cy="19" r="13" fill="url(#qgrad)" opacity="0.12"/>
            <circle cx="19" cy="19" r="13" fill="none" stroke="url(#qgrad)" strokeWidth="3.5"/>
            <line x1="27" y1="27" x2="38" y2="38" stroke="url(#qgrad)" strokeWidth="4" strokeLinecap="round"/>
            <circle cx="19" cy="19" r="4" fill="url(#qgrad)"/>
          </svg>
          <span className="text-lg font-bold tracking-widest text-gray-900 dark:text-white">QUAERYX</span>
        </button>
        <span className="text-[11px] text-gray-400 dark:text-gray-500 tracking-widest hidden sm:block font-medium">THE NEXT GENERATION OF SEARCH</span>
        <div className="ml-auto flex items-center gap-2">
          {hasResults && (
            <>
              <button onClick={handleExport}
                className="text-xs text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-all border border-gray-200 hover:border-gray-400 dark:border-[#2a2d3a] px-2.5 py-1.5 rounded-lg hover:shadow-sm flex items-center gap-1"
                title="Download as Markdown">
                {exported ? "✓" : "↓ Export"}
              </button>
              <button onClick={handleShare}
                className="text-xs text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-all border border-gray-200 hover:border-gray-400 dark:border-[#2a2d3a] px-2.5 py-1.5 rounded-lg hover:shadow-sm flex items-center gap-1">
                {copied ? "✓" : "↗ Share"}
              </button>
            </>
          )}
          {/* Dark mode toggle */}
          <button onClick={toggleDark}
            className="text-xs text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-all border border-gray-200 hover:border-gray-400 dark:border-[#2a2d3a] px-2.5 py-1.5 rounded-lg hover:shadow-sm"
            title={isDark ? "Switch to light mode" : "Switch to dark mode"}>
            {isDark ? "Light" : "Dark"}
          </button>
          {/* More menu — Saved, API Keys */}
          <div className="relative" data-more-menu>
            <button
              onClick={() => document.querySelector("[data-more-panel]")?.classList.toggle("hidden")}
              className="text-xs text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-all border border-gray-200 hover:border-gray-400 dark:border-[#2a2d3a] px-2.5 py-1.5 rounded-lg hover:shadow-sm flex items-center gap-1">
              ···
              {collections.length > 0 && <span className="bg-teal-500 text-white text-[9px] w-4 h-4 rounded-full font-bold flex items-center justify-center">{collections.length}</span>}
            </button>
            <div data-more-panel className="hidden absolute right-0 top-full mt-1.5 bg-white dark:bg-[#1a1d27] border border-gray-200 dark:border-[#2a2d3a] rounded-xl shadow-xl z-50 w-40 py-1 overflow-hidden">
              <button onClick={() => { setShowCollections(true); document.querySelector("[data-more-panel]")?.classList.add("hidden"); }}
                className="w-full text-left px-4 py-2.5 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[#2a2d3a] flex items-center justify-between transition-colors">
                Saved searches
                {collections.length > 0 && <span className="bg-teal-500 text-white text-[9px] px-1.5 py-0.5 rounded-full font-bold">{collections.length}</span>}
              </button>
              <button onClick={() => { setShowSettings(true); document.querySelector("[data-more-panel]")?.classList.add("hidden"); }}
                className="w-full text-left px-4 py-2.5 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[#2a2d3a] transition-colors">
                API Keys
              </button>
              <div className="border-t border-gray-100 dark:border-[#2a2d3a] my-1"/>
              <a href="/admin"
                className="block px-4 py-2.5 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[#2a2d3a] transition-colors">
                Analytics
              </a>
              <a href="/api-docs"
                className="block px-4 py-2.5 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[#2a2d3a] transition-colors">
                API Docs
              </a>
            </div>
          </div>
          <a href="https://github.com/Vinseek91/quaeryx" target="_blank"
            className="text-xs text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-all border border-gray-200 hover:border-gray-400 dark:border-[#2a2d3a] px-2.5 py-1.5 rounded-lg hover:shadow-sm flex items-center gap-1">
            GitHub
          </a>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-3 sm:px-4 py-6 sm:py-8 pb-24">

        {/* ── HERO ── */}
        {!hasResults && !loading && (
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <svg width="72" height="72" viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <linearGradient id="qgrad2" x1="0" y1="0" x2="44" y2="44" gradientUnits="userSpaceOnUse">
                    <stop offset="0%"   stopColor="#F97316"/>
                    <stop offset="50%"  stopColor="#FB923C"/>
                    <stop offset="100%" stopColor="#FBBF24"/>
                  </linearGradient>
                </defs>
                <circle cx="19" cy="19" r="13" fill="url(#qgrad2)" opacity="0.12"/>
                <circle cx="19" cy="19" r="13" fill="none" stroke="url(#qgrad2)" strokeWidth="3.5"/>
                <line x1="27" y1="27" x2="38" y2="38" stroke="url(#qgrad2)" strokeWidth="4" strokeLinecap="round"/>
                <circle cx="19" cy="19" r="4" fill="url(#qgrad2)"/>
              </svg>
            </div>
            <h1 className="text-7xl font-black mb-3 bg-gradient-to-r from-orange-500 via-amber-400 to-yellow-400 bg-clip-text text-transparent tracking-widest leading-tight">
              QUAERYX
            </h1>
            <p className="text-gray-400 text-xs tracking-[0.35em] mb-7 font-medium">
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

            {/* Trending topics */}
            {trending.length > 0 && (
              <div className="mt-6">
                <div className="text-[10px] text-gray-400 tracking-widest font-semibold uppercase mb-3 flex items-center justify-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse"/>
                  Trending now
                </div>
                <div className="flex flex-wrap justify-center gap-1.5">
                  {trending.slice(0, 6).map((t, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => { setQuery(t.title); runSearch(t.title, mode); }}
                      className="text-xs text-gray-600 bg-white border border-gray-200 hover:border-orange-300 hover:bg-orange-50 hover:text-orange-800 rounded-xl px-2.5 py-1 transition-all shadow-sm hover:shadow-md flex items-center gap-1.5 max-w-[280px]"
                    >
                      <span className={t.source === "hackernews" ? "text-orange-400" : "text-blue-400"}>
                        {t.source === "hackernews" ? "Y" : "r/"}
                      </span>
                      <span className="truncate">{t.title}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── NEW SEARCH BUTTON (above search bar when results showing) ── */}
        {hasResults && (
          <div className="mb-3">
            <button
              type="button"
              onClick={clearSearch}
              className="text-xs text-orange-600 dark:text-orange-400 hover:text-orange-800 dark:hover:text-orange-200 font-medium flex items-center gap-1.5 transition-colors"
            >
              ← New Search
            </button>
          </div>
        )}

        {/* ── SEARCH FORM ── */}
        <form onSubmit={handleSearch} className="mb-6">

          {/* Active connector badge */}
          {(uploadedFile || (connector && connector !== null)) && (
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              {uploadedFile && (
                <div className="flex items-center gap-2 bg-orange-50 border border-orange-200 text-orange-700 text-xs px-3 py-1.5 rounded-xl font-medium">
                  <span>📄</span>
                  <span className="max-w-[180px] truncate">{uploadedFile.name}</span>
                  <span className="text-orange-400">·</span>
                  <span>{(uploadedFile.size / 1024).toFixed(0)} KB</span>
                  <button type="button" onClick={clearFile} className="ml-1 text-orange-400 hover:text-orange-700 font-bold">×</button>
                </div>
              )}
              {connector === "url" && (
                <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 text-blue-700 text-xs px-3 py-1.5 rounded-xl font-medium">
                  <span>🔗</span>
                  <span className="max-w-[220px] truncate">{connectorInput}</span>
                  <button type="button" onClick={clearConnector} className="ml-1 text-blue-400 hover:text-blue-700 font-bold">×</button>
                </div>
              )}
              {connector === "youtube" && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-1.5 rounded-xl font-medium">
                  <span>▶</span>
                  <span className="max-w-[220px] truncate">{connectorInput}</span>
                  <button type="button" onClick={clearConnector} className="ml-1 text-red-400 hover:text-red-700 font-bold">×</button>
                </div>
              )}
              {connector === "github" && (
                <div className="flex items-center gap-2 bg-gray-900 border border-gray-700 text-white text-xs px-3 py-1.5 rounded-xl font-medium">
                  <span>◈</span>
                  <span className="max-w-[220px] truncate">{connectorInput}</span>
                  <button type="button" onClick={clearConnector} className="ml-1 text-gray-400 hover:text-white font-bold">×</button>
                </div>
              )}
              {connector === "rss" && (
                <div className="flex items-center gap-2 bg-orange-50 border border-orange-200 text-orange-700 text-xs px-3 py-1.5 rounded-xl font-medium">
                  <span>◉</span>
                  <span className="max-w-[220px] truncate">{connectorInput}</span>
                  <button type="button" onClick={clearConnector} className="ml-1 text-orange-400 hover:text-orange-700 font-bold">×</button>
                </div>
              )}
              {connector === "gdrive" && gdriveToken && (
                <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 text-xs px-3 py-1.5 rounded-xl font-medium">
                  <span>🟢</span>
                  <span>Google Drive connected</span>
                  <button type="button" onClick={() => { setGdriveToken(null); setConnector(null); localStorage.removeItem("gdrive_token"); }} className="ml-1 text-green-400 hover:text-green-700 font-bold">×</button>
                </div>
              )}
              {isConnectorMode && (
                <span className="text-[10px] text-gray-400 font-medium">Ask anything about this source</span>
              )}
            </div>
          )}

          {/* Search input */}
          <div className="flex gap-2.5 mb-3">
            <div className="flex-1 relative flex items-center" data-search-box>
              <input
                ref={searchInputRef}
                value={query}
                onChange={(e) => handleQueryChange(e.target.value)}
                onFocus={() => setShowHistory(true)}
                placeholder={
                  uploadedFile     ? "Ask a question about the file..." :
                  connector === "youtube" ? "Ask about this video..." :
                  connector === "url"     ? "Ask about this page..." :
                  connector === "gdrive"  ? "Search your Google Drive..." :
                  "Search anything — or paste a URL / YouTube link..."
                }
                className="w-full bg-white dark:bg-[#1a1d27] border border-gray-200 dark:border-[#2a2d3a] rounded-2xl pl-5 pr-20 py-4 text-sm outline-none focus:border-orange-400 focus:ring-4 focus:ring-orange-50 dark:focus:ring-orange-900/30 transition-all placeholder:text-gray-400 dark:placeholder:text-gray-600 text-gray-800 dark:text-[#e8eaf0] shadow-sm hover:shadow-md hover:border-gray-300 dark:hover:border-[#3a3d4a]"
                autoFocus
              />
              <div className="absolute right-3 flex items-center gap-1">
                {/* File upload */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className={`p-1.5 rounded-lg transition-all ${uploadedFile ? "text-orange-500 bg-orange-50" : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"}`}
                  title="Upload file (PDF, TXT)"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                  </svg>
                </button>
                <input ref={fileInputRef} type="file" accept=".pdf,.txt,.md,.csv" className="hidden" onChange={handleFileChange} />
                {/* Voice  */}
                <button
                  type="button"
                  onClick={startVoice}
                  className={`p-1.5 rounded-lg transition-all ${isListening ? "text-red-500 bg-red-50 animate-pulse" : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"}`}
                  title={isListening ? "Listening..." : "Voice search"}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                    <line x1="12" y1="19" x2="12" y2="23"/>
                    <line x1="8" y1="23" x2="16" y2="23"/>
                  </svg>
                </button>
              </div>

              {/* History dropdown */}
              {showHistory && history.length > 0 && !query && (
                <div className="absolute left-0 right-0 top-full mt-1.5 bg-white dark:bg-[#1a1d27] border border-gray-200 dark:border-[#2a2d3a] rounded-2xl shadow-xl z-40 overflow-hidden">
                  <div className="px-4 py-2 border-b border-gray-100 dark:border-[#2a2d3a] flex items-center justify-between">
                    <span className="text-[10px] font-semibold text-gray-400 tracking-widest uppercase">Recent searches</span>
                    <button type="button" onClick={clearHistory} className="text-[10px] text-gray-400 hover:text-red-500 transition-colors">Clear</button>
                  </div>
                  {history.slice(0, 8).map((h, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => { setQuery(h); setShowHistory(false); runSearch(h, mode); }}
                      className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[#2a2d3a] flex items-center gap-3 transition-colors"
                    >
                      <span className="text-gray-300 text-xs">↩</span>
                      {h}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              type="submit"
              disabled={loading}
              className="bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold px-8 rounded-2xl text-sm disabled:opacity-60 transition-all hover:opacity-90 hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] shadow-md"
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

          {/* Connector row — single + button like Perplexity */}
          <div className="flex gap-2 items-center mb-3">
            {/* + Connector picker button */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowConnectorPanel((v) => !v)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                  connector
                    ? "border-orange-400 bg-orange-50 text-orange-700 shadow-sm"
                    : "border-gray-200 text-gray-500 hover:border-orange-400 hover:text-orange-600 hover:bg-orange-50 hover:shadow-sm"
                }`}
              >
                <span className="text-base leading-none">+</span>
                <span>{connector ? `Connected: ${connector}` : "Connectors"}</span>
                {connector && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); clearConnector(); setShowConnectorPanel(false); }}
                    className="ml-0.5 text-orange-400 hover:text-orange-700 font-bold text-sm leading-none"
                  >×</button>
                )}
              </button>

              {/* Perplexity-style connector panel */}
              {showConnectorPanel && (
                <div data-connector-panel className="absolute left-0 top-full mt-2 w-72 bg-white dark:bg-[#1a1d27] border border-gray-200 dark:border-[#2a2d3a] rounded-2xl shadow-2xl z-50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100 dark:border-[#2a2d3a] flex items-center justify-between">
                    <span className="text-xs font-bold text-gray-700 dark:text-gray-200">Add a source</span>
                    <a href="/connectors" className="text-[10px] text-orange-500 hover:text-orange-700 font-semibold transition-colors">View all →</a>
                  </div>
                  <div className="p-2">
                    {[
                      { id: "url",     icon: "🔗", label: "Webpage",      desc: "Analyze any public URL" },
                      { id: "youtube", icon: "▶",  label: "YouTube",      desc: "Summarize any video" },
                      { id: "github",  icon: "◈",  label: "GitHub Repo",  desc: "Analyze public repositories" },
                      { id: "rss",     icon: "◉",  label: "RSS / Blog",   desc: "Read any feed" },
                      { id: "gdrive",  icon: "△",  label: "Google Drive", desc: gdriveToken ? "Connected" : "Connect your Drive" },
                      { id: "upload",  icon: "📄", label: "File Upload",  desc: "PDF, TXT, CSV, Markdown" },
                    ].map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setShowConnectorPanel(false);
                          if (c.id === "upload") { fileInputRef.current?.click(); return; }
                          if (c.id === "gdrive") { gdriveToken ? setConnector("gdrive") : connectGDrive(); return; }
                          setShowConnectorModal(c.id as any);
                        }}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all hover:bg-orange-50 dark:hover:bg-orange-900/20 group ${
                          connector === c.id ? "bg-orange-50 dark:bg-orange-900/20" : ""
                        }`}
                      >
                        <span className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-[#2a2d3a] flex items-center justify-center text-sm flex-shrink-0 group-hover:bg-orange-100 dark:group-hover:bg-orange-900/30 transition-colors">
                          {c.icon}
                        </span>
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-gray-800 dark:text-gray-200">{c.label}</div>
                          <div className="text-[10px] text-gray-400 truncate">{c.desc}</div>
                        </div>
                        {connector === c.id && <span className="ml-auto text-orange-500 text-xs font-bold flex-shrink-0">✓</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex-1" />

            {/* Model selector */}
            <div className="relative" data-model-menu>
              <button
                type="button"
                onClick={() => setShowModelMenu((v) => !v)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border border-gray-200 text-gray-500 hover:border-gray-300 hover:bg-white hover:shadow-sm transition-all"
              >
                <span className="text-orange-500">◉</span>
                <span>{selectedModelInfo.label}</span>
                <span className="text-gray-300">▾</span>
              </button>
              {showModelMenu && (
                <div className="absolute right-0 top-full mt-1.5 w-64 bg-white dark:bg-[#1a1d27] border border-gray-200 dark:border-[#2a2d3a] rounded-2xl shadow-xl z-40 overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-gray-100 dark:border-[#2a2d3a] flex items-center justify-between">
                    <span className="text-[10px] font-semibold text-gray-500 tracking-widest uppercase">AI Model</span>
                    <span className="text-[10px] font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-lg">ALL FREE</span>
                  </div>
                  {/* Groq models */}
                  <div className="px-4 pt-2 pb-1">
                    <span className="text-[9px] font-bold text-gray-400 tracking-widest uppercase">Groq</span>
                  </div>
                  {GROQ_MODELS.filter(m => m.provider === "Groq").map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => { setSelectedModel(m.id); setShowModelMenu(false); }}
                      className={`w-full text-left px-4 py-2.5 text-sm transition-colors flex items-center justify-between ${
                        selectedModel === m.id ? "bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300" : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[#2a2d3a]"
                      }`}
                    >
                      <div>
                        <div className="font-semibold text-[13px]">{m.label}</div>
                        <div className="text-[11px] text-gray-400">{m.desc}</div>
                      </div>
                      {selectedModel === m.id && <span className="text-orange-500 font-bold">✓</span>}
                    </button>
                  ))}
                  {/* Gemini models */}
                  <div className="px-4 pt-3 pb-1 border-t border-gray-100 dark:border-[#2a2d3a] mt-1">
                    <span className="text-[9px] font-bold text-blue-400 tracking-widest uppercase">Google Gemini</span>
                  </div>
                  {GROQ_MODELS.filter(m => m.provider === "Gemini").map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => { setSelectedModel(m.id); setShowModelMenu(false); }}
                      className={`w-full text-left px-4 py-2.5 text-sm transition-colors flex items-center justify-between ${
                        selectedModel === m.id ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300" : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[#2a2d3a]"
                      }`}
                    >
                      <div>
                        <div className="font-semibold text-[13px]">{m.label}</div>
                        <div className="text-[11px] text-gray-400">{m.desc}</div>
                      </div>
                      {selectedModel === m.id && <span className="text-blue-500 font-bold">✓</span>}
                    </button>
                  ))}
                  <div className="px-4 py-2 border-t border-gray-100 dark:border-[#2a2d3a] text-[10px] text-gray-400 text-center mt-1">
                    All free · Groq + Gemini fallback chain
                  </div>
                </div>
              )}
            </div>
          </div>


          {/* Keyboard shortcut hint — only shown on homepage */}
          {!hasResults && !loading && (
            <div className="text-[10px] text-gray-400 mb-3 flex items-center gap-3">
              <span><kbd className="bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded text-[10px] font-mono">/</kbd> or <kbd className="bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded text-[10px] font-mono">⌘K</kbd> to focus</span>
              <span><kbd className="bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded text-[10px] font-mono">Esc</kbd> to dismiss</span>
            </div>
          )}

          {/* Mode tabs */}
          <div className="flex gap-1.5 items-center overflow-x-auto pb-1 scrollbar-hide">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMode(m.id)}
                className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  mode === m.id
                    ? "bg-orange-500 text-white shadow-sm"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#2a2d3a]"
                }`}
              >
                {m.label}
              </button>
            ))}
            <div className="w-px h-4 bg-gray-200 dark:bg-[#2a2d3a] mx-1 shrink-0"/>
            <button
              type="button"
              onClick={() => setDeepResearch((d) => !d)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                deepResearch
                  ? "bg-purple-500 text-white shadow-sm"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#2a2d3a]"
              }`}
            >
              Deep Research
            </button>
          </div>
        </form>

        {/* ── STATUS INDICATORS ── */}
        {isListening && (
          <div className="mb-5 text-xs text-red-500 tracking-wider font-medium flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"/>
            Listening... speak your query
          </div>
        )}
        {deepResearch && round > 0 && (
          <div className="mb-5 text-xs text-purple-600 tracking-wider font-medium flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse"/>
            Research round {round} / 3 in progress...
          </div>
        )}
        {docInfo && (
          <div className="mb-4 text-xs text-orange-600 flex items-center gap-2 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-orange-500"/>
            Analysing <strong>{docInfo.filename}</strong> · {docInfo.chars.toLocaleString()} characters
          </div>
        )}

        {/* ── SKELETON LOADERS ── */}
        {loading && results.length === 0 && !isConnectorMode && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
            {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
          </div>
        )}

        {/* ── SOURCE RESULTS GRID ── */}
        {results.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-5">
            {results.slice(0, 8).map((r, i) => (
              <a
                key={i}
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                className="border border-gray-200 dark:border-[#2a2d3a] rounded-xl p-3 hover:border-gray-300 dark:hover:border-[#3a3d4a] hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 block group bg-white dark:bg-[#1a1d27]"
              >
                <div className="flex items-center gap-1.5 mb-1.5">
                  <img
                    src={getFavicon(r.url, r.source)}
                    alt={r.source}
                    width={14} height={14}
                    className="rounded-sm opacity-70 shrink-0"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wide ${SOURCE_COLORS[r.source] || "bg-gray-100 text-gray-600"}`}>
                    {r.source.replace("_", " ")}
                  </span>
                  {r.appearances > 1 && (
                    <span className="text-[10px] text-orange-500 font-semibold ml-auto">×{r.appearances}</span>
                  )}
                </div>
                <p className="text-sm text-gray-800 dark:text-gray-200 line-clamp-2 group-hover:text-gray-900 dark:group-hover:text-white transition-colors font-medium leading-snug mb-1">{r.title}</p>
                <p className="text-[11px] text-gray-400 dark:text-gray-500 line-clamp-2 leading-relaxed">{r.snippet}</p>
              </a>
            ))}
          </div>
        )}

        {/* ── IMAGE RESULTS ── */}
        {images.length > 0 && (
          <div className="mb-6">
            <div className="text-[10px] text-gray-400 tracking-widest font-semibold uppercase mb-3">Images</div>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {images.map((img, i) => (
                <a key={i} href={img.page_url} target="_blank" rel="noopener noreferrer"
                  className="flex-shrink-0 group relative overflow-hidden rounded-xl border border-gray-200 dark:border-[#2a2d3a] hover:border-gray-300 dark:hover:border-[#3a3d4a] hover:shadow-lg transition-all"
                  style={{ width: 140, height: 100 }}>
                  <img src={img.url} alt={img.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    onError={(e) => { (e.target as HTMLImageElement).closest("a")!.style.display = "none"; }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
                    <span className="text-white text-[10px] font-medium line-clamp-2 leading-tight">{img.title}</span>
                  </div>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* ── ANSWER ── */}
        {(answer || (loading && (results.length > 0 || isConnectorMode))) && (
          <div className="border border-gray-200 dark:border-[#2a2d3a] rounded-2xl p-6 mb-6 bg-white dark:bg-[#1a1d27] shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="text-[10px] text-orange-600 tracking-widest flex items-center gap-2 font-semibold uppercase">
                <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse"/>
                {isConnectorMode
                  ? `QUAERYX ANALYST · ${selectedModelInfo.label}`
                  : `QUAERYX SYNTHESIS · ${results.length} SOURCES · ${selectedModelInfo.label}`}
              </div>
              {answer && !loading && (
                <div className="flex items-center gap-2">
                  {detectedLang && detectedLang !== "en" && (
                    <span className="text-[10px] bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-lg font-semibold uppercase">{detectedLang}</span>
                  )}
                  {isComparison && (
                    <span className="text-[10px] bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded-lg font-semibold">⇄ Comparison</span>
                  )}
                  <button onClick={saveToCollection}
                    className="text-[11px] text-gray-400 hover:text-orange-600 border border-gray-200 hover:border-orange-400 px-2.5 py-1 rounded-lg transition-all flex items-center gap-1.5 hover:shadow-sm"
                    title="Save to collection">
                    + Save
                  </button>
                  <button onClick={copyAnswer}
                    className="text-[11px] text-gray-400 hover:text-gray-700 border border-gray-200 hover:border-gray-400 px-2.5 py-1 rounded-lg transition-all flex items-center gap-1.5 hover:shadow-sm"
                    title="Copy answer">
                    {answerCopied ? "✓ Copied" : "⎘ Copy"}
                  </button>
                </div>
              )}
            </div>
            <div
              ref={answerRef}
              className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed max-h-[65vh] overflow-y-auto prose prose-sm prose-gray dark:prose-invert max-w-none"
            >
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  a: ({ href, children }) => (
                    <a href={href} target="_blank" rel="noopener noreferrer"
                      className="text-orange-600 hover:text-orange-800 underline underline-offset-2 font-medium">
                      {children}
                    </a>
                  ),
                  h1: ({ children }) => <h1 className="text-lg font-bold text-gray-900 mt-4 mb-2">{children}</h1>,
                  h2: ({ children }) => <h2 className="text-base font-bold text-gray-900 mt-4 mb-2">{children}</h2>,
                  h3: ({ children }) => <h3 className="text-sm font-bold text-gray-800 mt-3 mb-1">{children}</h3>,
                  p:  ({ children }) => <p className="mb-3 leading-relaxed">{children}</p>,
                  ul: ({ children }) => <ul className="list-disc pl-5 mb-3 space-y-1">{children}</ul>,
                  ol: ({ children }) => <ol className="list-decimal pl-5 mb-3 space-y-1">{children}</ol>,
                  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                  strong: ({ children }) => <strong className="font-semibold text-gray-900">{children}</strong>,
                  code: ({ className, children, ...props }) => {
                    const match = /language-(\w+)/.exec(className || "");
                    const lang = match ? match[1] : "";
                    const inline = !className;
                    if (!inline && lang) {
                      return (
                        <SyntaxHighlighter
                          language={lang}
                          style={isDark ? oneDark : oneLight}
                          customStyle={{ borderRadius: "12px", fontSize: "12px", marginBottom: "12px" }}
                          PreTag="div"
                        >
                          {String(children).replace(/\n$/, "")}
                        </SyntaxHighlighter>
                      );
                    }
                    return <code className="bg-gray-100 dark:bg-[#2a2d3a] text-gray-800 dark:text-gray-200 px-1.5 py-0.5 rounded text-[12px] font-mono" {...props}>{children}</code>;
                  },
                  pre: ({ children }) => <div className="mb-3">{children}</div>,
                  blockquote: ({ children }) => <blockquote className="border-l-4 border-orange-300 pl-4 text-gray-500 italic mb-3">{children}</blockquote>,
                  table: ({ children }) => <div className="overflow-x-auto mb-3"><table className="w-full text-xs border-collapse">{children}</table></div>,
                  th: ({ children }) => <th className="border border-gray-200 px-3 py-2 bg-gray-50 font-semibold text-left">{children}</th>,
                  td: ({ children }) => <td className="border border-gray-200 px-3 py-2">{children}</td>,
                }}
              >
                {processCitations(answer, results)}
              </ReactMarkdown>
              {loading && <span className="animate-pulse text-orange-500">▋</span>}
            </div>
          </div>
        )}

        {/* ── FOLLOW-UP QUESTIONS ── */}
        {!loading && followUps.length > 0 && (
          <div className="mb-6">
            <div className="text-[10px] text-gray-400 tracking-widest font-semibold uppercase mb-3 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-gray-300"/>
              Follow-up questions
            </div>
            <div className="flex flex-col gap-2">
              {followUps.map((q, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setQuery(q);
                    setConnector(null);
                    setUploadedFile(null);
                    runSearch(q, mode);
                  }}
                  className="text-left text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-[#1a1d27] border border-gray-200 dark:border-[#2a2d3a] hover:border-orange-300 dark:hover:border-orange-700 hover:bg-orange-50 dark:hover:bg-orange-900/20 hover:text-orange-800 dark:hover:text-orange-300 rounded-xl px-4 py-3 transition-all shadow-sm hover:shadow-md flex items-center gap-3 group"
                >
                  <span className="text-orange-400 group-hover:text-orange-600 transition-colors flex-shrink-0">→</span>
                  {q}
                </button>
              ))}
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

      {/* ── CONNECTOR MODAL (YouTube / URL) ── */}
      {showConnectorModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }}
          onClick={() => setShowConnectorModal(null)}>
          <div className="bg-white dark:bg-[#1a1d27] rounded-2xl shadow-2xl w-full max-w-md"
            onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-100 dark:border-[#2a2d3a] flex items-center justify-between">
              <span className="font-bold text-gray-900 dark:text-white text-sm flex items-center gap-2">
                {showConnectorModal === "youtube" ? "▶ Analyze a YouTube Video"
                 : showConnectorModal === "github" ? "◈ Analyze a GitHub Repo"
                 : showConnectorModal === "rss"    ? "◉ Read an RSS / Blog Feed"
                 : "🔗 Analyze a Webpage"}
              </span>
              <button onClick={() => setShowConnectorModal(null)} className="text-gray-400 hover:text-gray-700 text-lg leading-none">×</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5 block">
                  {showConnectorModal === "youtube" ? "YouTube URL"
                   : showConnectorModal === "github" ? "GitHub Repo URL"
                   : showConnectorModal === "rss"    ? "RSS / Atom Feed URL"
                   : "Webpage URL"}
                </label>
                <input
                  autoFocus
                  value={modalUrl}
                  onChange={(e) => setModalUrl(e.target.value)}
                  placeholder={
                    showConnectorModal === "youtube" ? "https://youtube.com/watch?v=..."
                    : showConnectorModal === "github" ? "https://github.com/owner/repo"
                    : showConnectorModal === "rss"    ? "https://hnrss.org/frontpage  or  https://blog.example.com/feed"
                    : "https://example.com/article..."
                  }
                  className="w-full bg-gray-50 dark:bg-[#0f1117] border border-gray-200 dark:border-[#2a2d3a] rounded-xl px-4 py-3 text-sm outline-none focus:border-orange-400 focus:ring-4 focus:ring-orange-50 dark:focus:ring-orange-900/30 transition-all placeholder:text-gray-400 text-gray-800 dark:text-gray-200"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5 block">
                  Your question
                </label>
                <input
                  value={modalQuestion}
                  onChange={(e) => setModalQuestion(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && modalUrl.trim() && modalQuestion.trim()) {
                      setConnector(showConnectorModal);
                      setConnectorInput(modalUrl.trim());
                      setQuery(modalQuestion.trim());
                      setShowConnectorModal(null);
                      setModalUrl(""); setModalQuestion("");
                      setTimeout(() => runSearch(modalQuestion.trim(), mode), 50);
                    }
                  }}
                  placeholder={
                    showConnectorModal === "youtube" ? "Summarize this video / What is it about? / ..."
                    : showConnectorModal === "github" ? "What does this repo do? / How do I set it up? / ..."
                    : showConnectorModal === "rss"    ? "What are the latest stories? / Summarize today's news..."
                    : "What does this page say about..."
                  }
                  className="w-full bg-gray-50 dark:bg-[#0f1117] border border-gray-200 dark:border-[#2a2d3a] rounded-xl px-4 py-3 text-sm outline-none focus:border-orange-400 focus:ring-4 focus:ring-orange-50 dark:focus:ring-orange-900/30 transition-all placeholder:text-gray-400 text-gray-800 dark:text-gray-200"
                />
              </div>
              <button
                onClick={() => {
                  if (!modalUrl.trim() || !modalQuestion.trim()) return;
                  setConnector(showConnectorModal);
                  setConnectorInput(modalUrl.trim());
                  setQuery(modalQuestion.trim());
                  setShowConnectorModal(null);
                  setModalUrl(""); setModalQuestion("");
                  setTimeout(() => runSearch(modalQuestion.trim(), mode), 50);
                }}
                disabled={!modalUrl.trim() || !modalQuestion.trim()}
                className="w-full bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold py-3 rounded-xl text-sm disabled:opacity-40 transition-all hover:opacity-90 hover:shadow-lg"
              >
                {showConnectorModal === "youtube" ? "Analyze Video"
                 : showConnectorModal === "github" ? "Analyze Repo"
                 : showConnectorModal === "rss"    ? "Read Feed"
                 : "Analyze Page"}
              </button>
              <p className="text-[10px] text-gray-400 text-center">
                {showConnectorModal === "youtube" ? "Works with any public YouTube video that has captions"
                 : showConnectorModal === "github" ? "Works with any public GitHub repository"
                 : showConnectorModal === "rss"    ? "Works with any RSS 2.0 or Atom feed URL"
                 : "Works with any public webpage — news, docs, articles"}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── COLLECTIONS MODAL ── */}
      {showCollections && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.4)" }}
          onClick={() => setShowCollections(false)}>
          <div className="bg-white dark:bg-[#1a1d27] rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-100 dark:border-[#2a2d3a] flex items-center justify-between">
              <span className="font-bold text-gray-900 dark:text-white text-sm">Saved Searches</span>
              <div className="flex items-center gap-3">
                {collections.length > 0 && (
                  <button onClick={() => { setCollections([]); localStorage.removeItem("quaeryx_collections"); }}
                    className="text-[11px] text-gray-400 hover:text-red-500 transition-colors">Clear all</button>
                )}
                <button onClick={() => setShowCollections(false)} className="text-gray-400 hover:text-gray-700 text-lg leading-none">×</button>
              </div>
            </div>
            <div className="overflow-y-auto flex-1">
              {collections.length === 0 ? (
                <div className="px-6 py-12 text-center text-gray-400 text-sm">
                  No saved searches yet.<br/>Click "+ Save" after any search to save it here.
                </div>
              ) : (
                collections.map((c) => (
                  <button key={c.id}
                    onClick={() => { setQuery(c.query); setShowCollections(false); runSearch(c.query, c.mode as SearchMode); }}
                    className="w-full text-left px-6 py-4 border-b border-gray-50 dark:border-[#2a2d3a] hover:bg-gray-50 dark:hover:bg-[#2a2d3a] transition-colors">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate flex-1">{c.query}</span>
                      <span className="text-[10px] text-gray-400 flex-shrink-0">{c.date}</span>
                    </div>
                    <p className="text-[11px] text-gray-400 line-clamp-2">{c.answer}</p>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── SETTINGS MODAL ── */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.4)" }}
          onClick={() => setShowSettings(false)}>
          <div className="bg-white dark:bg-[#1a1d27] rounded-2xl shadow-2xl w-full max-w-md"
            onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-100 dark:border-[#2a2d3a] flex items-center justify-between">
              <span className="font-bold text-gray-900 dark:text-white text-sm">⚙ Settings — API Keys</span>
              <button onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-gray-700 text-lg leading-none">×</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                QUAERYX works without any API keys. Add these to get more search results.
              </p>
              {[
                { key: "brave",  label: "Brave Search API Key",  link: "https://brave.com/search/api/",  free: "2,000/month" },
                { key: "tavily", label: "Tavily API Key",         link: "https://tavily.com",              free: "1,000/month" },
                { key: "exa",    label: "Exa API Key",            link: "https://exa.ai",                  free: "1,000/month" },
              ].map(({ key, label, link, free }) => (
                <div key={key}>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">{label}</label>
                    <a href={link} target="_blank" className="text-[10px] text-orange-600 hover:text-orange-800 transition-colors">
                      Free {free} ↗
                    </a>
                  </div>
                  <input
                    type="password"
                    value={apiKeys[key as keyof typeof apiKeys]}
                    onChange={(e) => saveApiKeys({ ...apiKeys, [key]: e.target.value })}
                    placeholder={`Enter ${label}...`}
                    className="w-full bg-gray-50 dark:bg-[#0f1117] border border-gray-200 dark:border-[#2a2d3a] rounded-xl px-3 py-2 text-xs font-mono text-gray-800 dark:text-gray-200 outline-none focus:border-orange-400 transition-colors"
                  />
                </div>
              ))}
              <div className="pt-2 border-t border-gray-100 dark:border-[#2a2d3a] text-[10px] text-gray-400 text-center">
                Keys saved locally in your browser — never sent to any server except the search API
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── FOOTER ── */}
      <footer className="fixed bottom-0 left-0 right-0 border-t border-gray-200/80 dark:border-[#2a2d3a]/80 bg-white/80 dark:bg-[#1a1d27]/80 backdrop-blur-md px-4 sm:px-6 py-2.5 flex justify-between items-center text-[10px] text-gray-400 font-medium">
        <span className="flex items-center gap-3">
          <span>QUAERYX · Apache 2.0</span>
          <a href="/api-docs" className="hover:text-gray-600 dark:hover:text-gray-300 transition-colors hidden sm:inline">API Docs</a>
          <a href="/admin" className="hover:text-gray-600 dark:hover:text-gray-300 transition-colors hidden sm:inline">Analytics</a>
        </span>
        <a href="https://github.com/Vinseek91/quaeryx" target="_blank" className="hover:text-gray-600 dark:hover:text-gray-300 transition-colors hidden sm:inline">github.com/Vinseek91/quaeryx</a>
      </footer>
    </div>
  );
}
