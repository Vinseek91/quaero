"use client";

import { useEffect, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Stats {
  total_searches: number;
  uptime: string;
  cache_size: number;
  top_queries: { query: string; count: number }[];
  by_mode: Record<string, number>;
  last_24h: { hour: string; count: number }[];
}

export default function AdminPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError]  = useState("");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/stats`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStats(await res.json());
      setError("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const maxHour = stats ? Math.max(1, ...stats.last_24h.map((h) => h.count)) : 1;
  const modeColors: Record<string, string> = {
    general: "bg-teal-500", academic: "bg-blue-500",
    code: "bg-purple-500", news: "bg-orange-500", prediction: "bg-pink-500",
  };

  return (
    <div className="min-h-screen bg-[#f8f9fc] text-gray-800" style={{ fontFamily: "'Inter','system-ui',sans-serif" }}>
      {/* Header */}
      <header className="border-b border-gray-200 bg-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <a href="/" className="text-gray-400 hover:text-gray-700 text-sm">← QUAERYX</a>
          <span className="text-gray-300">/</span>
          <span className="font-bold text-gray-900 tracking-wide text-sm">Analytics</span>
        </div>
        <button onClick={load}
          className="text-xs text-gray-500 hover:text-gray-900 border border-gray-200 hover:border-gray-400 px-3 py-1.5 rounded-lg transition-all">
          Refresh
        </button>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-10 space-y-8">
        {loading && <p className="text-center text-gray-400 py-20">Loading stats...</p>}
        {error   && <p className="text-center text-red-500 py-20">Error: {error}</p>}

        {stats && (
          <>
            {/* Top metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: "Total Searches", value: stats.total_searches.toLocaleString(), color: "text-teal-600" },
                { label: "Cache Entries",  value: stats.cache_size,                      color: "text-blue-600" },
                { label: "Uptime",         value: stats.uptime,                          color: "text-purple-600" },
                { label: "Unique Queries", value: stats.top_queries.length + "+",        color: "text-orange-600" },
              ].map((m) => (
                <div key={m.label} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 text-center">
                  <div className={`text-3xl font-bold ${m.color} mb-1`}>{m.value}</div>
                  <div className="text-xs text-gray-500 font-medium">{m.label}</div>
                </div>
              ))}
            </div>

            {/* Searches per hour (last 24h) */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
              <h2 className="font-bold text-gray-900 mb-5 text-sm">Searches — Last 24 Hours</h2>
              <div className="flex items-end gap-1 h-32">
                {stats.last_24h.map((h) => (
                  <div key={h.hour} className="flex-1 flex flex-col items-center gap-1 group">
                    <div
                      className="w-full bg-teal-500 rounded-sm transition-all group-hover:bg-teal-600"
                      style={{ height: `${Math.max(2, (h.count / maxHour) * 112)}px` }}
                      title={`${h.hour}: ${h.count} searches`}
                    />
                    {h.count > 0 && <span className="text-[8px] text-gray-400">{h.count}</span>}
                  </div>
                ))}
              </div>
              <div className="flex justify-between mt-1 text-[10px] text-gray-400">
                <span>23h ago</span>
                <span>Now</span>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-6">
              {/* By mode */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
                <h2 className="font-bold text-gray-900 mb-5 text-sm">Searches by Mode</h2>
                {Object.entries(stats.by_mode).length === 0 && (
                  <p className="text-sm text-gray-400">No searches yet.</p>
                )}
                <div className="space-y-3">
                  {Object.entries(stats.by_mode)
                    .sort((a, b) => b[1] - a[1])
                    .map(([mode, count]) => {
                      const total = Object.values(stats.by_mode).reduce((a, b) => a + b, 0) || 1;
                      const pct   = Math.round((count / total) * 100);
                      return (
                        <div key={mode}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="capitalize font-medium text-gray-700">{mode}</span>
                            <span className="text-gray-500">{count} ({pct}%)</span>
                          </div>
                          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${modeColors[mode] ?? "bg-gray-400"}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>

              {/* Top queries */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
                <h2 className="font-bold text-gray-900 mb-5 text-sm">Top Queries</h2>
                {stats.top_queries.length === 0 && (
                  <p className="text-sm text-gray-400">No queries yet.</p>
                )}
                <ol className="space-y-2">
                  {stats.top_queries.slice(0, 15).map((q, i) => (
                    <li key={i} className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-gray-400 font-mono w-5 shrink-0">{i + 1}.</span>
                      <span className="flex-1 text-gray-700 truncate">{q.query}</span>
                      <span className="text-gray-400 bg-gray-50 border border-gray-100 rounded px-1.5 py-0.5 shrink-0">{q.count}×</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>

            <p className="text-center text-xs text-gray-400">
              Stats are in-memory — reset when the API server restarts · <a href="/api-docs" className="underline hover:text-gray-600">API Docs</a>
            </p>
          </>
        )}
      </main>
    </div>
  );
}
