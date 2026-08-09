const WEB = "https://web-vinay-s-projects10.vercel.app";

// Create context menu on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "quaeryx-search",
    title: 'Search QUAERYX for "%s"',
    contexts: ["selection"],
  });
  chrome.contextMenus.create({
    id: "quaeryx-open",
    title: "Open QUAERYX",
    contexts: ["page", "action"],
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "quaeryx-search" && info.selectionText) {
    // Option 1: Open QUAERYX with the query
    const url = `${WEB}?q=${encodeURIComponent(info.selectionText)}`;
    chrome.tabs.create({ url });
  }
  if (info.menuItemId === "quaeryx-open") {
    chrome.tabs.create({ url: WEB });
  }
});
