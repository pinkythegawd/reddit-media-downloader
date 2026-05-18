const state = {
  items: [],
  summary: { total: 0, post: 0, gallery: 0, comment: 0 }
};

const qualityEl = document.getElementById("quality");
const summaryEl = document.getElementById("summary");
const progressTextEl = document.getElementById("progressText");
const progressBarEl = document.getElementById("progressBar");
const statusListEl = document.getElementById("statusList");
const downloadPostBtn = document.getElementById("downloadPost");
const downloadAllBtn = document.getElementById("downloadAll");

function setSummaryText() {
  summaryEl.textContent = `Found ${state.summary.total} item(s): ${state.summary.post} post, ${state.summary.gallery} gallery, ${state.summary.comment} comment.`;
}

function updateStatusItem(progress) {
  if (!progress?.itemId) {
    return;
  }

  let item = document.getElementById(`status-${progress.itemId}`);
  if (!item) {
    item = document.createElement("li");
    item.id = `status-${progress.itemId}`;
    item.className = "status-item";
    statusListEl.prepend(item);
  }

  const quality = progress.quality ? ` (${progress.quality})` : "";
  const suffix = progress.error ? ` - ${progress.error}` : "";
  item.textContent = `${progress.label || progress.itemId}: ${progress.status}${quality}${suffix}`;
}

function updateProgress(progress) {
  if (!progress) {
    return;
  }

  if (typeof progress.total === "number") {
    progressBarEl.max = Math.max(progress.total, 1);
  }
  if (typeof progress.completed === "number") {
    progressBarEl.value = progress.completed;
  }

  if (progress.status === "complete") {
    progressTextEl.textContent = `Done: ${progress.completed}/${progress.total}`;
  } else if (typeof progress.completed === "number" && typeof progress.total === "number") {
    progressTextEl.textContent = `Progress: ${progress.completed}/${progress.total}`;
  }

  updateStatusItem(progress);
}

async function getActiveTabId() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0]?.id;
}

async function scanTabMedia() {
  const tabId = await getActiveTabId();
  if (!tabId) {
    summaryEl.textContent = "Open a Reddit post page first.";
    return;
  }

  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: "scan_media" });
    state.items = Array.isArray(response?.items) ? response.items : [];
    state.summary = response?.summary || { total: 0, post: 0, gallery: 0, comment: 0 };
    setSummaryText();
  } catch (_error) {
    summaryEl.textContent = "Unable to scan page. Open a Reddit post page and refresh.";
    state.items = [];
    state.summary = { total: 0, post: 0, gallery: 0, comment: 0 };
  }
}

async function sendDownload(scope) {
  if (!state.items.length) {
    progressTextEl.textContent = "Nothing to download.";
    return;
  }

  const quality = qualityEl.value || "original";
  await chrome.storage.sync.set({ preferredQuality: quality });

  progressBarEl.value = 0;
  progressBarEl.max = Math.max(scope === "post" ? state.summary.post + state.summary.gallery : state.summary.total, 1);
  progressTextEl.textContent = "Starting downloads...";

  await chrome.runtime.sendMessage({
    type: "download_media",
    items: state.items,
    scope,
    quality
  });
}

qualityEl.addEventListener("change", async () => {
  await chrome.storage.sync.set({ preferredQuality: qualityEl.value || "original" });
});

downloadPostBtn.addEventListener("click", () => sendDownload("post"));
downloadAllBtn.addEventListener("click", () => sendDownload("all"));

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "download_progress") {
    updateProgress(message.progress);
  }
});

(async function init() {
  const saved = await chrome.storage.sync.get({ preferredQuality: "original" });
  qualityEl.value = saved.preferredQuality || "original";
  await scanTabMedia();
})();
