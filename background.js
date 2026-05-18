const QUALITY_PRIORITY = ["original", "high", "medium", "low"];
const DOWNLOAD_SCOPE_POST = "post";
const DOWNLOAD_SCOPE_ALL = "all";

function sanitizePart(value, fallback = "reddit-media") {
  const normalized = (value || "").replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, " ").trim();
  return normalized || fallback;
}

function getBestQualityUrl(item, selectedQuality) {
  const qualities = item.qualities || {};
  if (selectedQuality && qualities[selectedQuality]) {
    return { quality: selectedQuality, url: qualities[selectedQuality] };
  }

  for (const quality of QUALITY_PRIORITY) {
    if (qualities[quality]) {
      return { quality, url: qualities[quality] };
    }
  }

  return { quality: "", url: "" };
}

function getExtensionFromUrl(url, fallback = "bin") {
  if (!url) {
    return fallback;
  }
  try {
    const pathname = new URL(url).pathname;
    const match = pathname.match(/\.([a-zA-Z0-9]+)$/);
    if (match) {
      return match[1].toLowerCase();
    }
  } catch (_error) {}
  return fallback;
}

async function getActiveRedditTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab || !tab.id || !tab.url || !/https?:\/\/(www\.|old\.)?reddit\.com\//.test(tab.url)) {
    return null;
  }
  return tab;
}

async function getMediaFromTab(tabId) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: "scan_media" });
    if (response && Array.isArray(response.items)) {
      return response;
    }
  } catch (_error) {}
  return { items: [], summary: { total: 0, post: 0, gallery: 0, comment: 0 } };
}

function filterByScope(items, scope) {
  if (scope === DOWNLOAD_SCOPE_POST) {
    return items.filter((item) => item.sourceType === "post" || item.sourceType === "gallery");
  }
  return items;
}

async function sendProgress(progress) {
  try {
    await chrome.runtime.sendMessage({ type: "download_progress", progress });
  } catch (_error) {}
}

async function startDownloads({ items, scope, quality }) {
  const selectedItems = filterByScope(items, scope);
  const total = selectedItems.length;

  if (!total) {
    await sendProgress({ status: "complete", completed: 0, total, scope });
    return { completed: 0, total };
  }

  let completed = 0;
  for (const item of selectedItems) {
    const { quality: pickedQuality, url } = getBestQualityUrl(item, quality);
    const filenameExt = getExtensionFromUrl(url, item.kind === "video" ? "mp4" : "jpg");
    const postPart = sanitizePart(item.postTitle, "reddit-post");
    const sourcePart = item.sourceType === "comment" ? "comments" : item.sourceType;
    const itemPart = sanitizePart(item.label || item.id || "media");
    const filename = `reddit-media/${postPart}/${sourcePart}/${itemPart}.${filenameExt}`;

    await sendProgress({
      status: "started",
      completed,
      total,
      itemId: item.id,
      label: item.label,
      quality: pickedQuality || quality
    });

    try {
      await chrome.downloads.download({
        url,
        filename,
        saveAs: false,
        conflictAction: "uniquify"
      });
      completed += 1;
      await sendProgress({
        status: "done",
        completed,
        total,
        itemId: item.id,
        label: item.label,
        quality: pickedQuality || quality
      });
    } catch (error) {
      await sendProgress({
        status: "error",
        completed,
        total,
        itemId: item.id,
        label: item.label,
        quality: pickedQuality || quality,
        error: error?.message || "Failed download"
      });
    }
  }

  await sendProgress({ status: "complete", completed, total, scope });
  return { completed, total };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "download_media") {
    return false;
  }

  startDownloads({
    items: Array.isArray(message.items) ? message.items : [],
    scope: message.scope || DOWNLOAD_SCOPE_ALL,
    quality: message.quality || "original"
  })
    .then((result) => sendResponse({ ok: true, result }))
    .catch((error) => sendResponse({ ok: false, error: error?.message || "Download failed" }));

  return true;
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "download-current-post-media" && command !== "download-all-media") {
    return;
  }

  const tab = await getActiveRedditTab();
  if (!tab) {
    return;
  }

  const media = await getMediaFromTab(tab.id);
  const qualitySetting = await chrome.storage.sync.get({ preferredQuality: "original" });
  const scope = command === "download-current-post-media" ? DOWNLOAD_SCOPE_POST : DOWNLOAD_SCOPE_ALL;

  await startDownloads({
    items: media.items,
    scope,
    quality: qualitySetting.preferredQuality || "original"
  });
});
