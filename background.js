const BADGE_CLEAR_DELAY_MS = 2200;

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) {
    return;
  }

  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractBestMediaFromCurrentPost
    });

    if (!result || !Array.isArray(result.media) || result.media.length === 0) {
      await setTemporaryBadge(tab.id, "!", "#d93025");
      return;
    }

    const base = buildBaseFileName(result.title, result.postId);

    await Promise.all(
      result.media.map((media, index) => {
        const extension = inferFileExtension(media.url, media.kind);
        const suffix = result.media.length > 1 ? `_${index + 1}` : "";

        return chrome.downloads.download({
          url: media.url,
          filename: `reddit-media/${base}${suffix}.${extension}`,
          conflictAction: "uniquify",
          saveAs: false
        });
      })
    );

    await setTemporaryBadge(tab.id, "✓", "#188038");
  } catch (error) {
    console.error("Reddit Media Downloader error:", error);
    await setTemporaryBadge(tab.id, "!", "#d93025");
  }
});

async function setTemporaryBadge(tabId, text, color) {
  await chrome.action.setBadgeBackgroundColor({ tabId, color });
  await chrome.action.setBadgeText({ tabId, text });

  setTimeout(() => {
    chrome.action.setBadgeText({ tabId, text: "" });
  }, BADGE_CLEAR_DELAY_MS);
}

function buildBaseFileName(title, postId) {
  const cleanTitle = (title || "reddit_post")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[^a-z0-9 _-]/gi, "")
    .replace(/ +/g, "_")
    .slice(0, 80);

  return `${cleanTitle || "reddit_post"}_${postId || "post"}`;
}

function inferFileExtension(rawUrl, kind) {
  try {
    const url = new URL(rawUrl);
    const pathname = url.pathname.toLowerCase();
    const match = pathname.match(/\.([a-z0-9]{2,5})$/i);

    if (match) {
      return match[1];
    }

    if (/\/dash_\d+$/i.test(pathname)) {
      return "mp4";
    }
  } catch (_) {
    // Fallback below.
  }

  if (kind === "video") {
    return "mp4";
  }

  return "jpg";
}

function extractBestMediaFromCurrentPost() {
  const postIdMatch = window.location.pathname.match(/\/comments\/([a-z0-9]+)/i);
  const postId = postIdMatch ? postIdMatch[1] : "post";

  const candidates = [
    document.querySelector(`#t3_${postId}`),
    document.querySelector(`shreddit-post[thingid=\"t3_${postId}\"]`),
    document.querySelector("shreddit-post"),
    document.querySelector("article[data-testid='post-container']")
  ].filter(Boolean);

  const root = candidates[0] || document;

  const title =
    root.querySelector("h1")?.textContent?.trim() ||
    root.querySelector("[slot='title']")?.textContent?.trim() ||
    document.querySelector("h1")?.textContent?.trim() ||
    (document.title || "reddit_post").replace(/\s*:\s*reddit.*/i, "").trim();

  const pickedByKey = new Map();

  const toAbsoluteUrl = (value) => {
    if (!value) {
      return null;
    }

    const cleaned = value.replace(/&amp;/g, "&").trim();

    if (cleaned.startsWith("data:") || cleaned.startsWith("blob:")) {
      return null;
    }

    try {
      return new URL(cleaned, window.location.href).toString();
    } catch (_) {
      return null;
    }
  };

  const stripQuery = (url) => url.replace(/[?#].*$/, "");

  const computeVideoKeyAndScore = (url) => {
    const dash = url.match(/\/DASH_(\d+)\.mp4(?:[?#].*)?$/i);

    if (dash) {
      return {
        key: url.replace(/\/DASH_\d+\.mp4(?:[?#].*)?$/i, ""),
        score: Number(dash[1])
      };
    }

    return { key: stripQuery(url), score: 0 };
  };

  const computeImageScore = (url) => {
    const width = url.match(/[?&]width=(\d+)/i);
    const height = url.match(/[?&]height=(\d+)/i);

    return Math.max(Number(width?.[1] || 0), Number(height?.[1] || 0));
  };

  const addCandidate = (urlValue, kind, score = 0, keyOverride) => {
    const url = toAbsoluteUrl(urlValue);

    if (!url || /\/DASH_AUDIO_/i.test(url)) {
      return;
    }

    const key = keyOverride || stripQuery(url);
    const existing = pickedByKey.get(key);

    if (!existing || score > existing.score) {
      pickedByKey.set(key, { url, kind, score });
    }
  };

  root.querySelectorAll("video").forEach((video) => {
    const srcValues = [];

    if (video.src) {
      srcValues.push(video.src);
    }

    video.querySelectorAll("source[src]").forEach((source) => srcValues.push(source.getAttribute("src")));

    srcValues.forEach((src) => {
      const url = toAbsoluteUrl(src);

      if (!url) {
        return;
      }

      const { key, score } = computeVideoKeyAndScore(url);
      addCandidate(url, "video", score, key);
    });
  });

  root.querySelectorAll("img").forEach((img) => {
    const srcSet = img.getAttribute("srcset");

    if (srcSet) {
      let top = null;

      srcSet
        .split(",")
        .map((part) => part.trim())
        .forEach((part) => {
          const [src, sizeHint] = part.split(/\s+/);
          const width = Number((sizeHint || "").replace(/[^\d]/g, ""));

          if (!top || width > top.width) {
            top = { src, width };
          }
        });

      if (top?.src) {
        const imgUrl = toAbsoluteUrl(top.src);

        if (imgUrl) {
          addCandidate(imgUrl, "image", top.width || computeImageScore(imgUrl), stripQuery(imgUrl));
        }
      }
    }

    const src = img.currentSrc || img.getAttribute("src");

    if (src) {
      const imgUrl = toAbsoluteUrl(src);

      if (imgUrl) {
        addCandidate(imgUrl, "image", computeImageScore(imgUrl), stripQuery(imgUrl));
      }
    }
  });

  root.querySelectorAll("a[href]").forEach((anchor) => {
    const href = anchor.getAttribute("href");

    if (!href) {
      return;
    }

    if (!/\.(jpe?g|png|gif|webp|mp4|mov|webm)(?:$|[?#])|\/DASH_\d+\.mp4/i.test(href)) {
      return;
    }

    const url = toAbsoluteUrl(href);

    if (!url) {
      return;
    }

    if (/\/DASH_\d+\.mp4/i.test(url)) {
      const { key, score } = computeVideoKeyAndScore(url);
      addCandidate(url, "video", score, key);
      return;
    }

    addCandidate(url, /\.(mp4|mov|webm)(?:$|[?#])/i.test(url) ? "video" : "image", computeImageScore(url), stripQuery(url));
  });

  const ogVideo = document.querySelector('meta[property="og:video"]')?.content;
  const ogImage = document.querySelector('meta[property="og:image"]')?.content;

  if (ogVideo) {
    const { key, score } = computeVideoKeyAndScore(ogVideo);
    addCandidate(ogVideo, "video", score, key);
  }

  if (ogImage) {
    addCandidate(ogImage, "image", computeImageScore(ogImage), stripQuery(ogImage));
  }

  return {
    postId,
    title,
    media: Array.from(pickedByKey.values()).map(({ url, kind }) => ({ url, kind }))
  };
}
