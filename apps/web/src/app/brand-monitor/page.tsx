"use client";

import { useState, useEffect } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const KNOWN_BRANDS = [
  "TCS", "Infosys", "Wipro", "HCL", "Tech Mahindra", "Reliance / Jio",
  "HDFC Bank", "ICICI Bank", "SBI", "Axis Bank", "Kotak Bank", "Paytm",
  "PhonePe", "Flipkart", "Razorpay", "Zomato", "Swiggy", "OYO", "BYJU'S",
  "MakeMyTrip", "Nykaa", "Microsoft", "Google", "Apple", "Amazon", "Meta / Facebook",
  "Oracle", "NVIDIA", "Tesla", "IBM", "SAP", "Salesforce", "Adobe", "Intel",
  "Cisco", "Accenture", "Capgemini", "PayPal", "Visa", "Mastercard", "Stripe",
  "eBay", "Alibaba", "Shopify", "Myntra",
];

function ThreatCard({ t }: { t: any }) {
  return (
    <div className="border border-red-200 bg-red-50 rounded-2xl p-4 mb-3">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <div className="text-sm font-black text-red-800 break-all">{t.domain}</div>
          <div className="text-[10px] text-red-600 mt-0.5">
            SSL issued: <span className="font-semibold">{t.issued_at}</span>
            {t.cert_link && (
              <> · <a href={t.cert_link} target="_blank" className="hover:underline font-semibold">View cert ↗</a></>
            )}
          </div>
        </div>
        <span className="shrink-0 text-xs bg-red-600 text-white px-2 py-0.5 rounded-full font-bold">{t.risk_score}/100</span>
      </div>
      {t.issuer && (
        <div className="text-[10px] text-gray-500 mb-2 truncate">
          CA: {t.issuer.split(",")[0]?.replace("O=", "") || t.issuer}
        </div>
      )}
      <div className="space-y-0.5 mb-3">
        {t.reasons?.map((r: string, j: number) => (
          <div key={j} className="text-xs text-red-600 flex gap-1"><span>⚡</span>{r}</div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <a href={t.url} target="_blank" rel="noopener noreferrer"
          className="text-xs bg-white text-red-700 border border-red-300 px-3 py-1.5 rounded-lg font-semibold hover:bg-red-50 transition-colors">
          Visit (careful) ↗
        </a>
        <a href="https://safebrowsing.google.com/safebrowsing/report_phish/" target="_blank"
          className="text-xs bg-white text-red-700 border border-red-300 px-3 py-1.5 rounded-lg font-semibold hover:bg-red-50 transition-colors">
          Report to Google
        </a>
        <a href="https://www.cert-in.org.in/" target="_blank"
          className="text-xs bg-white text-red-700 border border-red-300 px-3 py-1.5 rounded-lg font-semibold hover:bg-red-50 transition-colors">
          CERT-In
        </a>
        {t.report_to && (
          <a href={`mailto:${t.report_to}?subject=Phishing%20Alert%3A%20${encodeURIComponent(t.domain)}&body=Fake%20site%20detected%3A%20${encodeURIComponent(t.url)}%0ARisk%3A%20${t.risk_score}%2F100%0ASSL%20issued%3A%20${t.issued_at}%0A%0ADetected%20by%20QUAERYX%20Brand%20Sentinel%20via%20crt.sh%20CT%20logs.`}
            className="text-xs bg-red-600 text-white border border-red-600 px-3 py-1.5 rounded-lg font-semibold hover:bg-red-700 transition-colors">
            Alert Brand Owner
          </a>
        )}
      </div>
    </div>
  );
}

export default function BrandMonitorPage() {
  const [tab, setTab]               = useState<"check" | "monitor" | "scan" | "ct">("check");
  const [url, setUrl]               = useState("");
  const [checkResult, setCheckResult] = useState<any>(null);
  const [checking, setChecking]     = useState(false);

  const [form, setForm]             = useState({ brand_name: "", email: "", your_domain: "" });
  const [registered, setRegistered] = useState(false);
  const [registering, setRegistering] = useState(false);

  const [scanBrand, setScanBrand]   = useState("");
  const [scanResult, setScanResult] = useState<any>(null);
  const [scanning, setScanning]     = useState(false);

  // CT Log Scanner state
  const [ctBrand, setCtBrand]       = useState("");
  const [ctDays, setCtDays]         = useState(30);
  const [ctResult, setCtResult]     = useState<any>(null);
  const [ctScanning, setCtScanning] = useState(false);

  // Global CT cache — auto-loaded, updated every 6h by server
  const [ctGlobal, setCtGlobal]     = useState<any>(null);
  const [ctGlobalLoading, setCtGlobalLoading] = useState(true);

  useEffect(() => {
    // Load the latest global scan cache on page mount
    fetch(`${API}/api/brand-monitor/ct-latest`)
      .then((r) => r.json())
      .then((d) => setCtGlobal(d))
      .catch(() => setCtGlobal(null))
      .finally(() => setCtGlobalLoading(false));
  }, []);

  const checkUrl = async () => {
    if (!url.trim()) return;
    setChecking(true);
    setCheckResult(null);
    try {
      const r = await fetch(`${API}/api/brand-check?url=${encodeURIComponent(url)}`);
      setCheckResult(await r.json());
    } catch { setCheckResult({ error: "Could not reach API" }); }
    finally { setChecking(false); }
  };

  const registerMonitor = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegistering(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      const r = await fetch(`${API}/api/brand-monitor/register`, { method: "POST", body: fd });
      const d = await r.json();
      if (d.ok) setRegistered(true);
    } catch {}
    finally { setRegistering(false); }
  };

  const runScan = async () => {
    if (!scanBrand) return;
    setScanning(true);
    setScanResult(null);
    try {
      const r = await fetch(`${API}/api/brand-monitor/scan?brand=${encodeURIComponent(scanBrand)}`);
      setScanResult(await r.json());
    } catch { setScanResult({ error: "Scan failed" }); }
    finally { setScanning(false); }
  };

  const runCtScan = async () => {
    if (!ctBrand) return;
    setCtScanning(true);
    setCtResult(null);
    try {
      const r = await fetch(`${API}/api/brand-monitor/ct-scan?brand=${encodeURIComponent(ctBrand)}&days=${ctDays}`);
      setCtResult(await r.json());
    } catch { setCtResult({ ok: false, error: "CT scan failed — API unreachable" }); }
    finally { setCtScanning(false); }
  };

  const riskColor = (score: number) =>
    score >= 70 ? "text-red-600 bg-red-50 border-red-200" :
    score >= 40 ? "text-orange-600 bg-orange-50 border-orange-200" :
    "text-green-600 bg-green-50 border-green-200";

  const riskLabel = (score: number) =>
    score >= 70 ? "HIGH RISK" : score >= 40 ? "MEDIUM RISK" : "SAFE";

  return (
    <div className="min-h-screen bg-[#f8f9fc]" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* Header */}
      <header className="border-b border-gray-200 bg-white sticky top-0 z-50 px-4 py-3 flex items-center gap-3 shadow-sm">
        <a href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <svg width="28" height="28" viewBox="0 0 44 44" fill="none">
            <defs>
              <linearGradient id="qg" x1="0" y1="0" x2="44" y2="44" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#F97316"/>
                <stop offset="100%" stopColor="#FBBF24"/>
              </linearGradient>
            </defs>
            <circle cx="19" cy="19" r="13" fill="url(#qg)" opacity="0.12"/>
            <circle cx="19" cy="19" r="13" fill="none" stroke="url(#qg)" strokeWidth="3.5"/>
            <line x1="27" y1="27" x2="38" y2="38" stroke="url(#qg)" strokeWidth="4" strokeLinecap="round"/>
            <circle cx="19" cy="19" r="4" fill="url(#qg)"/>
          </svg>
          <span className="font-bold tracking-widest text-gray-900 text-sm">QUAERYX</span>
        </a>
        <span className="text-gray-300">·</span>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"/>
          <span className="text-sm font-bold text-gray-800">Brand Sentinel</span>
        </div>
        <span className="ml-auto text-[10px] bg-red-50 text-red-600 border border-red-200 px-2 py-1 rounded-lg font-bold tracking-wide">
          PHISHING PROTECTION
        </span>
      </header>

      {/* Hero */}
      <div className="bg-gradient-to-br from-gray-900 to-gray-800 text-white px-4 py-10 text-center">
        <div className="text-4xl mb-3">🛡️</div>
        <h1 className="text-2xl sm:text-3xl font-black mb-2">Brand Sentinel</h1>
        <p className="text-gray-300 text-sm max-w-lg mx-auto leading-relaxed">
          Detect fake websites impersonating real brands. Protect millions of users from phishing scams.
          Covers 45+ Indian &amp; global brands — TCS, eBay, Apple, HDFC, NVIDIA &amp; more.
        </p>
        <div className="flex justify-center gap-4 mt-5 text-xs text-gray-400">
          <span>🇮🇳 Indian IT Giants</span>
          <span>·</span>
          <span>🌐 Global Tech</span>
          <span>·</span>
          <span>🏦 Banks &amp; Finance</span>
          <span>·</span>
          <span>🛒 E-Commerce</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 bg-white px-4 flex gap-1 overflow-x-auto">
        {[
          { id: "check",   label: "🔍 Check a URL" },
          { id: "scan",    label: "🔎 Scan for Fakes" },
          { id: "ct",      label: "🌐 CT Log Scanner" },
          { id: "monitor", label: "🔔 Register for Alerts" },
        ].map((t) => (
          <button key={t.id} onClick={() => setTab(t.id as any)}
            className={`px-4 py-3 text-xs font-semibold border-b-2 transition-all whitespace-nowrap ${
              tab === t.id ? "border-orange-500 text-orange-600" : "border-transparent text-gray-500 hover:text-gray-800"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      <main className="max-w-2xl mx-auto px-4 py-8">

        {/* ── CHECK URL ── */}
        {tab === "check" && (
          <div>
            <h2 className="text-lg font-bold text-gray-900 mb-1">Check a suspicious URL</h2>
            <p className="text-sm text-gray-500 mb-5">Paste any URL to see if it&apos;s impersonating a real brand.</p>

            <div className="flex gap-2 mb-4">
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && checkUrl()}
                placeholder="https://ebaytryyde.com  or  paypa1-secure.com"
                className="flex-1 bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-orange-400 focus:ring-4 focus:ring-orange-50 transition-all"
              />
              <button onClick={checkUrl} disabled={checking || !url.trim()}
                className="bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold px-5 py-3 rounded-xl text-sm disabled:opacity-50 hover:opacity-90 transition-all shadow-md">
                {checking ? "..." : "Check"}
              </button>
            </div>

            {/* Example URLs */}
            <div className="flex flex-wrap gap-2 mb-6">
              <span className="text-xs text-gray-400">Try:</span>
              {["ebaytryyde.com", "paypa1-secure.com", "apple-id-verify.xyz", "hdfcbank-login.top", "amaz0n-india.com"].map((ex) => (
                <button key={ex} onClick={() => { setUrl(ex); }}
                  className="text-xs text-orange-600 bg-orange-50 border border-orange-200 px-2 py-1 rounded-lg hover:bg-orange-100 transition-colors">
                  {ex}
                </button>
              ))}
            </div>

            {checkResult && !checkResult.error && (
              <div className={`border rounded-2xl p-5 ${riskColor(checkResult.risk)}`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{checkResult.risk >= 70 ? "🚨" : checkResult.risk >= 40 ? "⚠️" : "✅"}</span>
                    <div>
                      <div className="font-black text-lg">{riskLabel(checkResult.risk)}</div>
                      <div className="text-xs opacity-70">{checkResult.url}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-3xl font-black">{checkResult.risk}</div>
                    <div className="text-xs opacity-70">Risk Score / 100</div>
                  </div>
                </div>

                {checkResult.brand && (
                  <div className="text-sm font-semibold mb-2">
                    Impersonating: <span className="font-black">{checkResult.brand}</span>
                  </div>
                )}

                {checkResult.reasons?.length > 0 && (
                  <div className="space-y-1 mb-4">
                    {checkResult.reasons.map((r: string, i: number) => (
                      <div key={i} className="text-xs flex items-start gap-2">
                        <span className="mt-0.5 flex-shrink-0">⚡</span>{r}
                      </div>
                    ))}
                  </div>
                )}

                {checkResult.is_suspicious && (
                  <div className="border-t pt-3 mt-3 flex flex-col sm:flex-row gap-2">
                    <a href="https://safebrowsing.google.com/safebrowsing/report_phish/" target="_blank"
                      className="flex-1 text-center bg-white/50 hover:bg-white/80 text-xs font-bold px-3 py-2 rounded-xl border transition-all">
                      📢 Report to Google
                    </a>
                    <a href="https://www.cert-in.org.in/" target="_blank"
                      className="flex-1 text-center bg-white/50 hover:bg-white/80 text-xs font-bold px-3 py-2 rounded-xl border transition-all">
                      🇮🇳 Report to CERT-In
                    </a>
                    <a href="https://www.ic3.gov/" target="_blank"
                      className="flex-1 text-center bg-white/50 hover:bg-white/80 text-xs font-bold px-3 py-2 rounded-xl border transition-all">
                      🌐 Report to IC3
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── SCAN FOR FAKES ── */}
        {tab === "scan" && (
          <div>
            <h2 className="text-lg font-bold text-gray-900 mb-1">Scan for fake sites</h2>
            <p className="text-sm text-gray-500 mb-5">Select a brand and we&apos;ll search the web for phishing sites impersonating it right now.</p>

            <div className="flex gap-2 mb-6">
              <select value={scanBrand} onChange={(e) => setScanBrand(e.target.value)}
                className="flex-1 bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-orange-400 focus:ring-4 focus:ring-orange-50 transition-all">
                <option value="">Select a brand...</option>
                {KNOWN_BRANDS.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
              <button onClick={runScan} disabled={scanning || !scanBrand}
                className="bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold px-5 py-3 rounded-xl text-sm disabled:opacity-50 hover:opacity-90 transition-all shadow-md">
                {scanning ? (
                  <span className="flex items-center gap-1">
                    <span className="animate-bounce">·</span><span className="animate-bounce" style={{animationDelay:"150ms"}}>·</span><span className="animate-bounce" style={{animationDelay:"300ms"}}>·</span>
                  </span>
                ) : "Scan"}
              </button>
            </div>

            {scanResult && (
              <div>
                {scanResult.error ? (
                  <div className="text-red-600 bg-red-50 border border-red-200 rounded-xl p-4 text-sm">{scanResult.error}</div>
                ) : (
                  <div>
                    <div className="flex items-center gap-3 mb-4 p-4 bg-white border border-gray-200 rounded-2xl">
                      <span className="text-2xl">{scanResult.threats_found > 0 ? "🚨" : "✅"}</span>
                      <div>
                        <div className="font-bold text-gray-900">{scanResult.brand}</div>
                        <div className="text-xs text-gray-500">Official: {scanResult.official_domain} · {scanResult.threats_found} threats found</div>
                      </div>
                    </div>

                    {scanResult.threats_found === 0 && (
                      <div className="text-center py-8 text-green-600">
                        <div className="text-3xl mb-2">✅</div>
                        <div className="font-semibold">No fake sites detected right now</div>
                        <div className="text-xs text-gray-400 mt-1">Register for 24/7 monitoring to get alerted if any appear</div>
                      </div>
                    )}

                    {scanResult.threats?.map((t: any, i: number) => (
                      <div key={i} className="border border-red-200 bg-red-50 rounded-2xl p-4 mb-3">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="text-sm font-bold text-red-800 break-all">{t.url}</div>
                          <span className="shrink-0 text-xs bg-red-600 text-white px-2 py-0.5 rounded-full font-bold">{t.risk_score}/100</span>
                        </div>
                        <div className="text-xs text-red-700 mb-3">{t.title}</div>
                        <div className="space-y-0.5 mb-3">
                          {t.reasons?.map((r: string, j: number) => (
                            <div key={j} className="text-xs text-red-600 flex gap-1"><span>⚡</span>{r}</div>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <a href="https://safebrowsing.google.com/safebrowsing/report_phish/" target="_blank"
                            className="text-xs bg-white text-red-700 border border-red-300 px-3 py-1.5 rounded-lg font-semibold hover:bg-red-50 transition-colors">
                            Report to Google
                          </a>
                          <a href="https://www.cert-in.org.in/" target="_blank"
                            className="text-xs bg-white text-red-700 border border-red-300 px-3 py-1.5 rounded-lg font-semibold hover:bg-red-50 transition-colors">
                            Report to CERT-In
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── CT LOG SCANNER ── */}
        {tab === "ct" && (
          <div>
            <h2 className="text-lg font-bold text-gray-900 mb-1">Certificate Transparency Log Scanner</h2>
            <p className="text-sm text-gray-500 mb-2 leading-relaxed">
              Every SSL certificate issued worldwide is logged publicly. We query{" "}
              <span className="font-semibold text-gray-700">crt.sh</span> automatically every 6 hours —
              detecting fake HTTPS sites within hours of their creation, anywhere on the planet.
            </p>

            {/* Auto-scan status banner */}
            <div className={`flex items-center gap-2 text-[11px] rounded-xl px-3 py-2 mb-5 border ${
              ctGlobal?.running
                ? "bg-yellow-50 border-yellow-200 text-yellow-700"
                : ctGlobal?.last_run
                  ? "bg-green-50 border-green-200 text-green-700"
                  : "bg-gray-50 border-gray-200 text-gray-500"
            }`}>
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${ctGlobal?.running ? "bg-yellow-400 animate-pulse" : ctGlobal?.last_run ? "bg-green-500" : "bg-gray-300"}`}/>
              {ctGlobalLoading ? (
                <span>Loading scan status...</span>
              ) : ctGlobal?.running ? (
                <span>Auto-scan running now across all 45+ brands...</span>
              ) : ctGlobal?.last_run ? (
                <span>
                  Auto-scan runs every 6h · Last: <strong>{ctGlobal.last_run}</strong> ·
                  Next: <strong>{ctGlobal.next_run}</strong> ·
                  <strong className="text-red-600"> {ctGlobal.total_threats} threats</strong> across <strong>{ctGlobal.brands_with_threats} brands</strong>
                </span>
              ) : (
                <span>Auto-scan starts 90s after server boot · Powered by <a href="https://crt.sh" target="_blank" className="font-bold hover:underline">crt.sh</a> (free, no API key)</span>
              )}
            </div>

            {/* Global auto-scan results */}
            {ctGlobal?.results?.length > 0 && (
              <div className="mb-8">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-sm font-bold text-gray-900">🚨 Latest auto-scan findings</span>
                  <span className="text-[10px] bg-red-100 text-red-700 border border-red-200 px-2 py-0.5 rounded-full font-bold">
                    {ctGlobal.total_threats} threats · last 7 days
                  </span>
                </div>
                {ctGlobal.results.map((brandResult: any, bi: number) => (
                  <div key={bi} className="mb-4">
                    <div className="text-xs font-bold text-red-700 mb-2 flex items-center gap-2">
                      <span>🏷️ {brandResult.brand}</span>
                      <span className="text-gray-400 font-normal">({brandResult.threats_found} fake sites)</span>
                    </div>
                    {brandResult.threats?.slice(0, 3).map((t: any, i: number) => (
                      <ThreatCard key={i} t={t} />
                    ))}
                    {brandResult.threats?.length > 3 && (
                      <div className="text-xs text-gray-400 ml-2">+{brandResult.threats.length - 3} more — use Live Scan below for full details</div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Divider */}
            <div className="flex items-center gap-3 mb-5">
              <div className="flex-1 h-px bg-gray-200"/>
              <span className="text-xs text-gray-400 font-semibold">Live Scan — specific brand</span>
              <div className="flex-1 h-px bg-gray-200"/>
            </div>

            {/* Per-brand live scan */}
            <div className="flex flex-col sm:flex-row gap-2 mb-3">
              <select value={ctBrand} onChange={(e) => setCtBrand(e.target.value)}
                className="flex-1 bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-orange-400 focus:ring-4 focus:ring-orange-50 transition-all">
                <option value="">Select a brand...</option>
                {KNOWN_BRANDS.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
              <select value={ctDays} onChange={(e) => setCtDays(Number(e.target.value))}
                className="bg-white border border-gray-200 rounded-xl px-3 py-3 text-sm outline-none focus:border-orange-400 transition-all">
                <option value={7}>Last 7 days</option>
                <option value={14}>Last 14 days</option>
                <option value={30}>Last 30 days</option>
                <option value={60}>Last 60 days</option>
                <option value={90}>Last 90 days</option>
              </select>
              <button onClick={runCtScan} disabled={ctScanning || !ctBrand}
                className="bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold px-5 py-3 rounded-xl text-sm disabled:opacity-50 hover:opacity-90 transition-all shadow-md whitespace-nowrap">
                {ctScanning ? (
                  <span className="flex items-center gap-1">
                    <span className="animate-bounce">·</span>
                    <span className="animate-bounce" style={{animationDelay:"150ms"}}>·</span>
                    <span className="animate-bounce" style={{animationDelay:"300ms"}}>·</span>
                  </span>
                ) : "Scan Now"}
              </button>
            </div>

            {ctScanning && (
              <div className="text-center py-10 text-sm text-gray-500">
                <div className="text-3xl mb-3 animate-pulse">🌐</div>
                <div className="font-semibold text-gray-700 mb-1">Querying crt.sh Certificate Transparency logs...</div>
                <div className="text-xs text-gray-400">Checking every SSL cert issued in the last {ctDays} days. This takes 15–30 seconds.</div>
              </div>
            )}

            {ctResult && !ctScanning && (
              <div>
                {!ctResult.ok ? (
                  <div className="text-red-600 bg-red-50 border border-red-200 rounded-xl p-4 text-sm">{ctResult.error}</div>
                ) : (
                  <div>
                    <div className={`flex items-center gap-4 mb-4 p-4 rounded-2xl border ${ctResult.threats_found > 0 ? "bg-red-50 border-red-200" : "bg-green-50 border-green-200"}`}>
                      <span className="text-3xl">{ctResult.threats_found > 0 ? "🚨" : "✅"}</span>
                      <div className="flex-1">
                        <div className="font-bold text-gray-900">{ctResult.brand}</div>
                        <div className="text-xs text-gray-500">
                          {ctResult.certs_checked} certs checked · last {ctResult.days_scanned} days · {ctResult.scanned_at}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-2xl font-black ${ctResult.threats_found > 0 ? "text-red-600" : "text-green-600"}`}>{ctResult.threats_found}</div>
                        <div className="text-[10px] text-gray-500">threats</div>
                      </div>
                    </div>
                    {ctResult.source_error && (
                      <div className="flex items-start gap-2 bg-yellow-50 border border-yellow-200 rounded-xl p-3 mb-4 text-xs text-yellow-800">
                        <span className="text-base flex-shrink-0">⚠️</span>
                        <div>
                          <div className="font-bold mb-0.5">CT log source temporarily unavailable</div>
                          <div className="text-yellow-700">{ctResult.source_error}</div>
                          <div className="mt-1 text-yellow-600">crt.sh is a free public service and occasionally goes down. Try again in a few minutes.</div>
                        </div>
                      </div>
                    )}
                    {ctResult.threats_found === 0 && !ctResult.source_error && (
                      <div className="text-center py-8 text-green-600">
                        <div className="text-3xl mb-2">✅</div>
                        <div className="font-semibold">No fake SSL certs found</div>
                        <div className="text-xs text-gray-400 mt-1">No new phishing sites for {ctResult.brand} in the last {ctResult.days_scanned} days.</div>
                      </div>
                    )}
                    {ctResult.threats?.map((t: any, i: number) => <ThreatCard key={i} t={t} />)}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── REGISTER MONITOR ── */}
        {tab === "monitor" && (
          <div>
            <h2 className="text-lg font-bold text-gray-900 mb-1">Register for 24/7 monitoring</h2>
            <p className="text-sm text-gray-500 mb-5">We scan the web every 6 hours. You get an email alert the moment a fake site appears.</p>

            {registered ? (
              <div className="text-center py-12">
                <div className="text-4xl mb-3">✅</div>
                <div className="font-bold text-gray-900 text-lg mb-1">You&apos;re protected</div>
                <div className="text-sm text-gray-500">We&apos;ll email you immediately if a fake site is detected.</div>
                <button onClick={() => setRegistered(false)} className="mt-4 text-xs text-orange-600 hover:underline">Register another brand</button>
              </div>
            ) : (
              <form onSubmit={registerMonitor} className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-gray-600 mb-1.5 block">Brand name</label>
                  <input required value={form.brand_name} onChange={(e) => setForm({...form, brand_name: e.target.value})}
                    placeholder="e.g. TCS, eBay, HDFC Bank, Apple..."
                    className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-orange-400 focus:ring-4 focus:ring-orange-50 transition-all"/>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-600 mb-1.5 block">Your official domain</label>
                  <input required value={form.your_domain} onChange={(e) => setForm({...form, your_domain: e.target.value})}
                    placeholder="e.g. tcs.com"
                    className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-orange-400 focus:ring-4 focus:ring-orange-50 transition-all"/>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-600 mb-1.5 block">Alert email (security team)</label>
                  <input required type="email" value={form.email} onChange={(e) => setForm({...form, email: e.target.value})}
                    placeholder="security@yourcompany.com"
                    className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-orange-400 focus:ring-4 focus:ring-orange-50 transition-all"/>
                </div>
                <button type="submit" disabled={registering}
                  className="w-full bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold py-3.5 rounded-xl text-sm disabled:opacity-50 hover:opacity-90 transition-all shadow-md">
                  {registering ? "Registering..." : "🛡️ Start Monitoring — Free"}
                </button>
                <p className="text-[10px] text-gray-400 text-center">Free forever · Open source · No credit card · Apache 2.0</p>
              </form>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 mt-10 px-4 py-4 text-center text-[11px] text-gray-400">
        QUAERYX Brand Sentinel · Protecting brands across India &amp; globally · Apache 2.0 ·{" "}
        <a href="https://github.com/Vinseek91/quaeryx" target="_blank" className="hover:text-gray-600">GitHub</a>
      </footer>
    </div>
  );
}
