"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const CONNECTORS = [
  // ── AVAILABLE ──────────────────────────────────────────────
  {
    id: "url",
    name: "Webpage",
    icon: "🔗",
    color: "bg-blue-50 border-blue-200",
    iconBg: "bg-blue-100 text-blue-600",
    desc: "Analyze any public webpage — articles, docs, landing pages.",
    status: "available",
    category: "Web",
  },
  {
    id: "youtube",
    name: "YouTube",
    icon: "▶",
    color: "bg-red-50 border-red-200",
    iconBg: "bg-red-100 text-red-600",
    desc: "Summarize and ask questions about any YouTube video with captions.",
    status: "available",
    category: "Video",
  },
  {
    id: "github",
    name: "GitHub",
    icon: "◈",
    color: "bg-gray-50 border-gray-200",
    iconBg: "bg-gray-900 text-white",
    desc: "Analyze any public GitHub repository — README, structure, code.",
    status: "available",
    category: "Code",
  },
  {
    id: "rss",
    name: "RSS / Blog",
    icon: "◉",
    color: "bg-orange-50 border-orange-200",
    iconBg: "bg-orange-100 text-orange-600",
    desc: "Read and summarize any RSS or Atom feed — blogs, podcasts, news.",
    status: "available",
    category: "News",
  },
  {
    id: "upload",
    name: "File Upload",
    icon: "📄",
    color: "bg-teal-50 border-teal-200",
    iconBg: "bg-teal-100 text-teal-600",
    desc: "Upload PDF, TXT, CSV or Markdown files and ask questions about them.",
    status: "available",
    category: "Files",
  },
  {
    id: "gdrive",
    name: "Google Drive",
    icon: "△",
    color: "bg-green-50 border-green-200",
    iconBg: "bg-green-100 text-green-600",
    desc: "Search and analyze files from your Google Drive. Requires OAuth.",
    status: "available",
    category: "Files",
  },

  // ── COMING SOON ────────────────────────────────────────────
  { id: "gmail",      name: "Gmail",           icon: "M",  color: "bg-red-50 border-red-200",     iconBg: "bg-red-100 text-red-600",       desc: "Search and summarize emails from your Gmail inbox.",             status: "soon", category: "Email"        },
  { id: "outlook",    name: "Outlook",          icon: "O",  color: "bg-blue-50 border-blue-200",   iconBg: "bg-blue-600 text-white",         desc: "Search emails and calendar events from Outlook.",                status: "soon", category: "Email"        },
  { id: "onedrive",   name: "OneDrive",         icon: "☁", color: "bg-sky-50 border-sky-200",     iconBg: "bg-sky-100 text-sky-600",        desc: "Access documents and files from Microsoft OneDrive.",            status: "soon", category: "Files"        },
  { id: "dropbox",    name: "Dropbox",          icon: "▣", color: "bg-blue-50 border-blue-200",   iconBg: "bg-blue-600 text-white",         desc: "Access and analyze files stored in your Dropbox.",              status: "soon", category: "Files"        },
  { id: "sharepoint", name: "SharePoint",       icon: "S",  color: "bg-teal-50 border-teal-200",  iconBg: "bg-teal-600 text-white",         desc: "Search and analyze content from Microsoft SharePoint.",          status: "soon", category: "Files"        },
  { id: "notion",     name: "Notion",           icon: "N",  color: "bg-gray-50 border-gray-200",  iconBg: "bg-gray-100 text-gray-700",      desc: "Read and analyze your Notion pages and databases.",             status: "soon", category: "Productivity" },
  { id: "slack",      name: "Slack",            icon: "#",  color: "bg-purple-50 border-purple-200", iconBg: "bg-purple-100 text-purple-700", desc: "Search messages and threads from your Slack workspace.",       status: "soon", category: "Messaging"    },
  { id: "figma",      name: "Figma",            icon: "F",  color: "bg-purple-50 border-purple-200", iconBg: "bg-purple-600 text-white",    desc: "Describe and analyze Figma files and design components.",       status: "soon", category: "Design"       },
  { id: "twitter",    name: "X / Twitter",      icon: "✕", color: "bg-gray-50 border-gray-200",   iconBg: "bg-gray-900 text-white",         desc: "Search and analyze posts and threads from X (Twitter).",        status: "soon", category: "Social"       },
  { id: "reddit",     name: "Reddit Thread",    icon: "r/", color: "bg-orange-50 border-orange-200", iconBg: "bg-orange-100 text-orange-600", desc: "Analyze a full Reddit thread — comments, discussion, sentiment.", status: "soon", category: "Social"  },
  { id: "crunchbase", name: "Crunchbase",       icon: "C",  color: "bg-blue-50 border-blue-200",  iconBg: "bg-blue-100 text-blue-700",      desc: "Research companies, funding rounds, investors and founders.",    status: "soon", category: "Finance"      },
  { id: "dub",        name: "Dub",              icon: "D",  color: "bg-gray-50 border-gray-200",  iconBg: "bg-black text-white",            desc: "Manage partner programs, short links and conversion data.",      status: "soon", category: "Marketing"    },
  { id: "twitch",     name: "Twitch",           icon: "T",  color: "bg-purple-50 border-purple-200", iconBg: "bg-purple-600 text-white",   desc: "Analyze live streams, VODs and chat from Twitch.",              status: "soon", category: "Video"        },
  { id: "canva",      name: "Canva",            icon: "C",  color: "bg-sky-50 border-sky-200",    iconBg: "bg-sky-500 text-white",          desc: "Create and analyze designs using Canva templates.",             status: "soon", category: "Design"       },
  { id: "whimsical",  name: "Whimsical",        icon: "W",  color: "bg-green-50 border-green-200", iconBg: "bg-green-100 text-green-700",  desc: "Read and analyze Whimsical diagrams and flowcharts.",           status: "soon", category: "Design"       },
  { id: "linear",     name: "Linear",           icon: "L",  color: "bg-indigo-50 border-indigo-200", iconBg: "bg-indigo-600 text-white",   desc: "Query issues, projects and cycles from your Linear workspace.",  status: "soon", category: "Productivity" },
  { id: "jira",       name: "Jira",             icon: "J",  color: "bg-blue-50 border-blue-200",  iconBg: "bg-blue-600 text-white",         desc: "Search and analyze Jira tickets, sprints and projects.",        status: "soon", category: "Productivity" },
  { id: "confluence", name: "Confluence",       icon: "C",  color: "bg-blue-50 border-blue-200",  iconBg: "bg-blue-100 text-blue-700",     desc: "Search Confluence pages and spaces for documentation.",          status: "soon", category: "Productivity" },
];

const CATEGORIES = ["All", "Web", "Code", "News", "Files", "Email", "Productivity", "Messaging", "Social", "Design", "Finance", "Marketing", "Video"];

export default function ConnectorsPage() {
  const router = useRouter();
  const [search, setSearch]   = useState("");
  const [category, setCategory] = useState("All");

  const available = CONNECTORS.filter((c) => c.status === "available");
  const soon      = CONNECTORS.filter((c) => c.status === "soon");

  const filter = (list: typeof CONNECTORS) =>
    list.filter((c) =>
      (category === "All" || c.category === category) &&
      (c.name.toLowerCase().includes(search.toLowerCase()) ||
       c.desc.toLowerCase().includes(search.toLowerCase()))
    );

  const handleUse = (id: string) => {
    // Navigate to home with connector pre-selected via query param
    router.push(`/?connector=${id}`);
  };

  return (
    <div className="min-h-screen bg-[#f8f9fc] text-gray-800" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* Header */}
      <header className="border-b border-gray-200 bg-white/90 backdrop-blur-md sticky top-0 z-50 px-6 py-3.5 flex items-center gap-4 shadow-sm">
        <button onClick={() => router.push("/")} className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
          <svg width="30" height="30" viewBox="0 0 44 44" fill="none">
            <defs>
              <linearGradient id="qg" x1="0" y1="0" x2="44" y2="44" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#F97316"/>
                <stop offset="50%" stopColor="#FB923C"/>
                <stop offset="100%" stopColor="#FBBF24"/>
              </linearGradient>
            </defs>
            <circle cx="19" cy="19" r="13" fill="url(#qg)" opacity="0.12"/>
            <circle cx="19" cy="19" r="13" fill="none" stroke="url(#qg)" strokeWidth="3.5"/>
            <line x1="27" y1="27" x2="38" y2="38" stroke="url(#qg)" strokeWidth="4" strokeLinecap="round"/>
            <circle cx="19" cy="19" r="4" fill="url(#qg)"/>
          </svg>
          <span className="text-base font-bold tracking-widest text-gray-900">QUAERYX</span>
        </button>
        <span className="text-gray-300 hidden sm:block">·</span>
        <span className="text-sm font-semibold text-gray-700 hidden sm:block">Connectors</span>
        <div className="ml-auto">
          <button onClick={() => router.push("/")}
            className="text-xs text-gray-500 hover:text-gray-900 border border-gray-200 hover:border-gray-400 px-3 py-1.5 rounded-lg transition-all">
            ← Back to Search
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-10">

        {/* Hero */}
        <div className="mb-8">
          <h1 className="text-3xl font-black text-gray-900 mb-2">Connectors</h1>
          <p className="text-gray-500 text-sm">Connect sources so QUAERYX can read and analyze your data.</p>
        </div>

        {/* Search + Category filter */}
        <div className="flex flex-col sm:flex-row gap-3 mb-8">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">⌕</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search connectors..."
              className="w-full pl-8 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:border-orange-400 focus:ring-4 focus:ring-orange-50 transition-all"
            />
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {CATEGORIES.map((cat) => (
              <button key={cat} onClick={() => setCategory(cat)}
                className={`shrink-0 px-3 py-2 rounded-xl text-xs font-medium border transition-all ${
                  category === cat
                    ? "bg-orange-500 text-white border-orange-500 shadow-sm"
                    : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
                }`}>
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Available section */}
        {filter(available).length > 0 && (
          <section className="mb-10">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xs font-bold text-gray-500 tracking-widest uppercase">Available now</span>
              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-semibold">{filter(available).length}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filter(available).map((c) => (
                <div key={c.id}
                  className={`border rounded-2xl p-5 bg-white hover:shadow-md transition-all group cursor-pointer`}
                  onClick={() => handleUse(c.id)}>
                  <div className="flex items-start justify-between mb-3">
                    <div className={`w-10 h-10 rounded-xl ${c.iconBg} flex items-center justify-center text-lg font-bold shrink-0`}>
                      {c.icon}
                    </div>
                    <button
                      className="text-xs bg-orange-500 hover:bg-orange-600 text-white px-3 py-1.5 rounded-lg font-semibold transition-all opacity-0 group-hover:opacity-100 shadow-sm"
                      onClick={(e) => { e.stopPropagation(); handleUse(c.id); }}>
                      Use →
                    </button>
                  </div>
                  <div className="font-bold text-gray-900 text-sm mb-1">{c.name}</div>
                  <div className="text-xs text-gray-500 leading-relaxed">{c.desc}</div>
                  <div className="mt-3">
                    <span className="text-[10px] bg-green-50 text-green-600 px-2 py-0.5 rounded-full font-semibold">✓ Ready</span>
                    <span className="text-[10px] text-gray-400 ml-2">{c.category}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Coming soon section */}
        {filter(soon).length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xs font-bold text-gray-500 tracking-widest uppercase">Coming soon</span>
              <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-semibold">{filter(soon).length}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filter(soon).map((c) => (
                <div key={c.id} className="border border-gray-100 rounded-2xl p-5 bg-white/60 opacity-70">
                  <div className="flex items-start justify-between mb-3">
                    <div className={`w-10 h-10 rounded-xl ${c.iconBg} flex items-center justify-center text-lg font-bold shrink-0 grayscale opacity-60`}>
                      {c.icon}
                    </div>
                    <span className="text-[10px] bg-gray-100 text-gray-400 px-2 py-1 rounded-lg font-semibold">Soon</span>
                  </div>
                  <div className="font-bold text-gray-500 text-sm mb-1">{c.name}</div>
                  <div className="text-xs text-gray-400 leading-relaxed">{c.desc}</div>
                  <div className="mt-3">
                    <span className="text-[10px] text-gray-400">{c.category}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {filter(available).length === 0 && filter(soon).length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <div className="text-4xl mb-3">⌕</div>
            <div className="text-sm">No connectors match &ldquo;{search}&rdquo;</div>
          </div>
        )}

      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 mt-16 px-6 py-4 text-center text-[11px] text-gray-400">
        QUAERYX · Apache 2.0 · Open Source ·{" "}
        <a href="https://github.com/Vinseek91/quaeryx" target="_blank" className="hover:text-gray-600 transition-colors">
          github.com/Vinseek91/quaeryx
        </a>
      </footer>
    </div>
  );
}
