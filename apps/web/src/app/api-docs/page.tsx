"use client";
import { useState } from "react";

const BASE = "https://quaero-14zr.onrender.com";

const ENDPOINTS = [
  {
    method: "GET",
    path: "/api/search",
    desc: "Universal search across 12+ sources with streaming AI synthesis.",
    params: [
      { name: "q",       type: "string",  req: true,  desc: "Search query" },
      { name: "mode",    type: "string",  req: false, desc: "general | academic | code | news | prediction" },
      { name: "model",   type: "string",  req: false, desc: "Groq model ID (default: llama-3.3-70b-versatile)" },
      { name: "predict", type: "boolean", req: false, desc: "Enable MiroFish swarm prediction" },
      { name: "stream",  type: "boolean", req: false, desc: "Stream response via SSE (default: true)" },
    ],
    example: `curl "${BASE}/api/search?q=quantum+computing&mode=academic"`,
    response: `data: {"type":"results","data":[...]}
data: {"type":"answer_chunk","data":"Quantum computing..."}
data: {"type":"done"}`,
  },
  {
    method: "GET",
    path: "/api/deep-research",
    desc: "Multi-round research — searches, identifies gaps, searches again. Like a PhD researcher.",
    params: [
      { name: "q",      type: "string",  req: true,  desc: "Research question" },
      { name: "rounds", type: "integer", req: false, desc: "Research rounds (default: 3)" },
    ],
    example: `curl "${BASE}/api/deep-research?q=climate+change+solutions&rounds=3"`,
    response: `data: {"type":"round_start","round":1}
data: {"type":"results","count":10}
data: {"type":"answer_chunk","data":"..."}
data: {"type":"done","total_sources":30}`,
  },
  {
    method: "POST",
    path: "/api/upload",
    desc: "Upload a PDF or text file and ask questions about it.",
    params: [
      { name: "file",     type: "file",   req: true,  desc: "PDF, TXT, MD, or CSV file" },
      { name: "question", type: "string", req: true,  desc: "Question to ask about the file" },
      { name: "model",    type: "string", req: false, desc: "Groq model ID" },
    ],
    example: `curl -X POST "${BASE}/api/upload" \\
  -F "file=@document.pdf" \\
  -F "question=Summarize the key findings"`,
    response: `data: {"type":"doc_info","data":{"filename":"document.pdf","chars":15000}}
data: {"type":"answer_chunk","data":"The key findings..."}
data: {"type":"done"}`,
  },
  {
    method: "POST",
    path: "/api/url",
    desc: "Scrape any webpage and ask questions about its content.",
    params: [
      { name: "url",      type: "string", req: true,  desc: "Full URL to scrape" },
      { name: "question", type: "string", req: true,  desc: "Question about the page" },
      { name: "model",    type: "string", req: false, desc: "Groq model ID" },
    ],
    example: `curl -X POST "${BASE}/api/url" \\
  -F "url=https://en.wikipedia.org/wiki/Quantum_computing" \\
  -F "question=What are the main applications?"`,
    response: `data: {"type":"doc_info","data":{"filename":"Quantum computing","chars":42000}}
data: {"type":"answer_chunk","data":"..."}
data: {"type":"done"}`,
  },
  {
    method: "POST",
    path: "/api/youtube",
    desc: "Fetch YouTube transcript and answer questions about the video.",
    params: [
      { name: "url",      type: "string", req: true,  desc: "YouTube video URL" },
      { name: "question", type: "string", req: true,  desc: "Question about the video" },
      { name: "model",    type: "string", req: false, desc: "Groq model ID" },
    ],
    example: `curl -X POST "${BASE}/api/youtube" \\
  -F "url=https://www.youtube.com/watch?v=dQw4w9WgXcQ" \\
  -F "question=What is this video about?"`,
    response: `data: {"type":"doc_info","data":{"filename":"YouTube · dQw4w9WgXcQ","chars":8000}}
data: {"type":"answer_chunk","data":"..."}
data: {"type":"done"}`,
  },
  {
    method: "GET",
    path: "/api/images",
    desc: "Return relevant images for a query (Wikipedia, free, no API key).",
    params: [
      { name: "q", type: "string", req: true, desc: "Search query" },
    ],
    example: `curl "${BASE}/api/images?q=black+hole"`,
    response: `{"images":[{"url":"https://...","title":"Black hole","page_url":"https://..."}]}`,
  },
  {
    method: "GET",
    path: "/api/trending",
    desc: "Live trending topics from HackerNews and Reddit.",
    params: [],
    example: `curl "${BASE}/api/trending"`,
    response: `{"trending":[{"title":"...","source":"hackernews","score":1200},...]}`,
  },
  {
    method: "GET",
    path: "/api/models",
    desc: "List all available free Groq models.",
    params: [],
    example: `curl "${BASE}/api/models"`,
    response: `{"models":[{"id":"llama-3.3-70b-versatile","label":"Llama 3.3 70B","free":true},...],"note":"All models are completely FREE"}`,
  },
];

const METHOD_COLORS: Record<string, string> = {
  GET:  "bg-green-50 text-green-700 border-green-200",
  POST: "bg-blue-50 text-blue-700 border-blue-200",
};

export default function ApiDocs() {
  const [copied, setCopied] = useState<number | null>(null);

  const copy = (text: string, i: number) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(i); setTimeout(() => setCopied(null), 2000);
    });
  };

  return (
    <div className="min-h-screen bg-[#f8f9fc] dark:bg-[#0f1117]" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* Header */}
      <header className="border-b border-gray-200 dark:border-[#2a2d3a] bg-white/80 dark:bg-[#1a1d27]/80 backdrop-blur-md sticky top-0 z-50 px-6 py-3.5 flex items-center gap-4">
        <a href="/" className="flex items-center gap-2.5">
          <svg width="28" height="28" viewBox="0 0 44 44" fill="none">
            <defs>
              <linearGradient id="qg" x1="0" y1="0" x2="44" y2="44" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#4285F4"/>
                <stop offset="50%" stopColor="#3fe0a8"/>
                <stop offset="100%" stopColor="#FBBC05"/>
              </linearGradient>
            </defs>
            <circle cx="19" cy="19" r="13" fill="url(#qg)" opacity="0.12"/>
            <circle cx="19" cy="19" r="13" fill="none" stroke="url(#qg)" strokeWidth="3.5"/>
            <line x1="27" y1="27" x2="38" y2="38" stroke="url(#qg)" strokeWidth="4" strokeLinecap="round"/>
            <circle cx="19" cy="19" r="4" fill="url(#qg)"/>
          </svg>
          <span className="font-bold tracking-widest text-gray-900 dark:text-white">QUAERYX</span>
        </a>
        <span className="text-xs text-gray-400 font-medium">API Reference</span>
        <div className="ml-auto flex items-center gap-3">
          <a href="https://github.com/Vinseek91/quaeryx" target="_blank"
            className="text-xs text-gray-500 hover:text-gray-900 border border-gray-200 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all hover:shadow-sm">
            ★ GitHub
          </a>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-12">
        {/* Hero */}
        <div className="mb-12">
          <div className="inline-flex items-center gap-2 bg-teal-50 border border-teal-200 text-teal-700 text-xs font-semibold px-3 py-1.5 rounded-lg mb-4">
            ◉ REST API · Free · No auth required
          </div>
          <h1 className="text-4xl font-black text-gray-900 dark:text-white mb-3 tracking-tight">QUAERYX API</h1>
          <p className="text-gray-500 dark:text-gray-400 text-base leading-relaxed max-w-2xl">
            The QUAERYX search API is completely free and open. No API key required.
            All responses stream via Server-Sent Events (SSE) for real-time output.
          </p>
          <div className="mt-5 flex items-center gap-3">
            <code className="bg-gray-100 dark:bg-[#1a1d27] border border-gray-200 dark:border-[#2a2d3a] text-gray-700 dark:text-gray-300 px-4 py-2 rounded-xl text-sm font-mono">
              {BASE}
            </code>
          </div>
        </div>

        {/* Quick start */}
        <div className="bg-white dark:bg-[#1a1d27] border border-gray-200 dark:border-[#2a2d3a] rounded-2xl p-6 mb-10">
          <h2 className="text-sm font-bold text-gray-900 dark:text-white mb-3 tracking-wide uppercase">Quick Start</h2>
          <pre className="bg-gray-50 dark:bg-[#0f1117] rounded-xl p-4 text-xs font-mono text-gray-700 dark:text-gray-300 overflow-x-auto">
{`# Search — streams answer in real time
curl "${BASE}/api/search?q=what+is+quantum+computing&mode=general"

# Deep research — 3 rounds of multi-hop search
curl "${BASE}/api/deep-research?q=climate+change+solutions"

# Upload a PDF and ask questions
curl -X POST "${BASE}/api/upload" -F "file=@paper.pdf" -F "question=Summarize"`}
          </pre>
        </div>

        {/* Endpoints */}
        <h2 className="text-xs font-bold text-gray-400 tracking-widest uppercase mb-4">Endpoints</h2>
        <div className="space-y-4">
          {ENDPOINTS.map((ep, i) => (
            <div key={i} className="bg-white dark:bg-[#1a1d27] border border-gray-200 dark:border-[#2a2d3a] rounded-2xl overflow-hidden">
              {/* Endpoint header */}
              <div className="px-6 py-4 flex items-center gap-3 border-b border-gray-100 dark:border-[#2a2d3a]">
                <span className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border ${METHOD_COLORS[ep.method]}`}>
                  {ep.method}
                </span>
                <code className="text-sm font-mono text-gray-800 dark:text-gray-200 font-semibold">{ep.path}</code>
              </div>
              <div className="px-6 py-4">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{ep.desc}</p>

                {ep.params.length > 0 && (
                  <div className="mb-4">
                    <div className="text-[10px] text-gray-400 font-semibold tracking-widest uppercase mb-2">Parameters</div>
                    <div className="space-y-1.5">
                      {ep.params.map((p, j) => (
                        <div key={j} className="flex items-start gap-3 text-xs">
                          <code className="font-mono text-teal-600 dark:text-teal-400 font-semibold w-24 flex-shrink-0">{p.name}</code>
                          <span className="text-gray-400 w-14 flex-shrink-0">{p.type}</span>
                          <span className={`w-14 flex-shrink-0 font-medium ${p.req ? "text-red-500" : "text-gray-400"}`}>
                            {p.req ? "required" : "optional"}
                          </span>
                          <span className="text-gray-600 dark:text-gray-400">{p.desc}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mb-3">
                  <div className="text-[10px] text-gray-400 font-semibold tracking-widest uppercase mb-2 flex items-center justify-between">
                    <span>Example</span>
                    <button onClick={() => copy(ep.example, i)}
                      className="text-gray-400 hover:text-gray-700 transition-colors">
                      {copied === i ? "✓ Copied" : "⎘ Copy"}
                    </button>
                  </div>
                  <pre className="bg-gray-50 dark:bg-[#0f1117] rounded-xl p-3 text-xs font-mono text-gray-700 dark:text-gray-300 overflow-x-auto whitespace-pre-wrap">
                    {ep.example}
                  </pre>
                </div>

                <div>
                  <div className="text-[10px] text-gray-400 font-semibold tracking-widest uppercase mb-2">Response</div>
                  <pre className="bg-gray-50 dark:bg-[#0f1117] rounded-xl p-3 text-xs font-mono text-gray-500 dark:text-gray-500 overflow-x-auto whitespace-pre-wrap">
                    {ep.response}
                  </pre>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* SSE note */}
        <div className="mt-8 bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800 rounded-2xl p-6">
          <div className="text-sm font-bold text-teal-700 dark:text-teal-400 mb-2">About Streaming (SSE)</div>
          <p className="text-sm text-teal-700 dark:text-teal-500 leading-relaxed">
            Search and analysis endpoints stream via Server-Sent Events. Each event is a JSON object prefixed with <code className="bg-teal-100 dark:bg-teal-900/40 px-1 rounded font-mono text-xs">data: </code>.
            Event types: <code className="font-mono text-xs">results</code>, <code className="font-mono text-xs">answer_chunk</code>, <code className="font-mono text-xs">prediction</code>, <code className="font-mono text-xs">doc_info</code>, <code className="font-mono text-xs">done</code>.
          </p>
        </div>

        {/* Python example */}
        <div className="mt-6 bg-white dark:bg-[#1a1d27] border border-gray-200 dark:border-[#2a2d3a] rounded-2xl p-6">
          <div className="text-xs font-bold text-gray-400 tracking-widest uppercase mb-3">Python Example</div>
          <pre className="bg-gray-50 dark:bg-[#0f1117] rounded-xl p-4 text-xs font-mono text-gray-700 dark:text-gray-300 overflow-x-auto">
{`import httpx

with httpx.stream("GET", "${BASE}/api/search",
                  params={"q": "quantum computing", "mode": "academic"}) as r:
    for line in r.iter_lines():
        if line.startswith("data: "):
            import json
            event = json.loads(line[6:])
            if event["type"] == "answer_chunk":
                print(event["data"], end="", flush=True)
            elif event["type"] == "done":
                break`}
          </pre>
        </div>

        {/* JS example */}
        <div className="mt-4 bg-white dark:bg-[#1a1d27] border border-gray-200 dark:border-[#2a2d3a] rounded-2xl p-6">
          <div className="text-xs font-bold text-gray-400 tracking-widest uppercase mb-3">JavaScript Example</div>
          <pre className="bg-gray-50 dark:bg-[#0f1117] rounded-xl p-4 text-xs font-mono text-gray-700 dark:text-gray-300 overflow-x-auto">
{`const resp = await fetch("${BASE}/api/search?q=quantum+computing");
const reader = resp.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  for (const line of decoder.decode(value).split("\\n")) {
    if (!line.startsWith("data: ")) continue;
    const event = JSON.parse(line.slice(6));
    if (event.type === "answer_chunk") process.stdout.write(event.data);
  }
}`}
          </pre>
        </div>
      </main>

      <footer className="border-t border-gray-200 dark:border-[#2a2d3a] px-6 py-4 text-center text-xs text-gray-400 mt-12">
        QUAERYX · Open Source · Apache 2.0 ·{" "}
        <a href="https://github.com/Vinseek91/quaeryx" target="_blank" className="hover:text-gray-600 transition-colors">github.com/Vinseek91/quaeryx</a>
      </footer>
    </div>
  );
}
