const API = "https://quaero-14zr.onrender.com";
const WEB = "https://web-vinay-s-projects10.vercel.app";

let selectedMode = "general";
let currentQuery = "";

// Mode buttons
document.querySelectorAll(".mode-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".mode-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    selectedMode = btn.dataset.mode;
  });
});

// Search on Enter
document.getElementById("query").addEventListener("keydown", (e) => {
  if (e.key === "Enter") doSearch();
});

document.getElementById("searchBtn").addEventListener("click", doSearch);

// Open full results
document.getElementById("openBtn").addEventListener("click", () => {
  const url = `${WEB}?q=${encodeURIComponent(currentQuery)}&mode=${selectedMode}`;
  chrome.tabs.create({ url });
});

// Check for selected text from context menu
chrome.storage.local.get(["quaeryx_selection"], (data) => {
  if (data.quaeryx_selection) {
    document.getElementById("query").value = data.quaeryx_selection;
    chrome.storage.local.remove("quaeryx_selection");
    doSearch();
  }
});

async function doSearch() {
  const q = document.getElementById("query").value.trim();
  if (!q) return;

  currentQuery = q;
  const btn = document.getElementById("searchBtn");
  const resultArea = document.getElementById("resultArea");
  const answerEl = document.getElementById("answerText");

  btn.disabled = true;
  btn.textContent = "···";
  resultArea.style.display = "block";
  answerEl.textContent = "";
  answerEl.innerHTML = '<span class="cursor">▋</span>';

  try {
    const resp = await fetch(
      `${API}/api/search?q=${encodeURIComponent(q)}&mode=${selectedMode}&stream=true`,
    );

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let answer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = decoder.decode(value);
      for (const line of text.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        try {
          const data = JSON.parse(line.slice(6));
          if (data.type === "answer_chunk") {
            answer += data.data;
            // Show first 800 chars in popup
            answerEl.textContent = answer.slice(0, 800) + (answer.length > 800 ? "…" : "");
          }
        } catch {}
      }
    }
  } catch (err) {
    answerEl.textContent = "Could not reach QUAERYX API. Make sure the backend is running.";
  } finally {
    btn.disabled = false;
    btn.textContent = "Search";
  }
}
