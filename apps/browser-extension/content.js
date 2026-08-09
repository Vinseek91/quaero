// Content script — listens for text selection, stores for popup
document.addEventListener("mouseup", () => {
  const selected = window.getSelection()?.toString().trim();
  if (selected && selected.length > 3 && selected.length < 500) {
    chrome.storage.local.set({ quaeryx_selection: selected });
  }
});
