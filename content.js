const QUALITY_ORDER = ["original", "high", "medium", "low"];
const MEDIA_URL_REGEX = /(https?:\/\/[^\s)\]]+)/gi;

function decodeHtml(value) {
  if (!value) {
    return "";
  }
  const textarea = document.createElement("textarea");
  textarea.innerHTML = value;
  return textarea.value;
}

function decodeMediaUrl(url) {
  if (!url) {
    return "";
  }
  return decodeHtml(url.replace(/&amp;/g, "&"));
}

function cleanupMediaUrl(url) {
  if (!url) {
    return "";
  }
  try {
    const parsed = new URL(url);
    if (/i\.redd\.it$/.test(parsed.hostname) || /preview\.redd\.it$/.test(parsed.hostname)) {
      parsed.search = "";
    }
    if (/imgur\.com$/.test(parsed.hostname) && /\.gifv$/i.test(parsed.pathname)) {
      parsed.pathname = parsed.pathname.replace(/\.gifv$/i, ".mp4");
    }
    return parsed.toString();
  } catch (_error) {
    return url;
  }
}

function selectQualityVariants(urls = []) {
  const unique = [...new Set(urls.filter(Boolean).map(cleanupMediaUrl))];
  if (!unique.length) {
    return {};
  }

  const first = unique[0];
  const low = unique[0];
  const medium = unique[Math.floor((unique.length - 1) / 2)] || first;
  const high = unique[Math.max(unique.length - 2, 0)] || first;
  const original = unique[unique.length - 1] || first;

  return { original, high, medium, low };
}

function getPermalinkPath() {
  const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute("href");
  if (canonical) {
    try {
      const parsed = new URL(canonical, location.origin);
      return parsed.pathname.replace(/\/+$/, "");
    } catch (_error) {}
  }

  const match = location.pathname.match(/^(\/r\/[^/]+\/comments\/[^/]+\/[^/]+)(?:\/.*)?$/);
  if (match) {
    return match[1];
  }

  return location.pathname.replace(/\/+$/, "");
}

function buildJsonUrl() {
  const path = getPermalinkPath();
  return `${location.origin}${path}.json?raw_json=1&limit=500`;
}

function createItem({ id, sourceType, kind, label, qualities, postTitle }) {
  return {
    id,
    sourceType,
    kind,
    label,
    qualities,
    postTitle
  };
}

function getImageQualitiesFromMetadata(mediaMetadataEntry) {
  const urls = [];
  if (mediaMetadataEntry?.s?.u) {
    urls.push(decodeMediaUrl(mediaMetadataEntry.s.u));
  }
  for (const variant of mediaMetadataEntry?.p || []) {
    if (variant?.u) {
      urls.push(decodeMediaUrl(variant.u));
    }
  }
  const mp4 = mediaMetadataEntry?.s?.mp4;
  if (mp4) {
    urls.push(decodeMediaUrl(mp4));
  }
  return selectQualityVariants(urls);
}

function getImageQualitiesFromPreview(image) {
  const urls = [];
  if (image?.source?.url) {
    urls.push(decodeMediaUrl(image.source.url));
  }
  for (const variant of image?.resolutions || []) {
    if (variant?.url) {
      urls.push(decodeMediaUrl(variant.url));
    }
  }
  return selectQualityVariants(urls);
}

function getVideoQualities(postData) {
  const redditVideo = postData?.secure_media?.reddit_video || postData?.media?.reddit_video;
  if (redditVideo?.fallback_url) {
    return {
      original: cleanupMediaUrl(redditVideo.fallback_url),
      high: cleanupMediaUrl(redditVideo.fallback_url),
      medium: cleanupMediaUrl(redditVideo.fallback_url),
      low: cleanupMediaUrl(redditVideo.fallback_url)
    };
  }

  const previewVideo = postData?.preview?.reddit_video_preview?.fallback_url;
  if (previewVideo) {
    return {
      original: cleanupMediaUrl(previewVideo),
      high: cleanupMediaUrl(previewVideo),
      medium: cleanupMediaUrl(previewVideo),
      low: cleanupMediaUrl(previewVideo)
    };
  }

  return {};
}

function addItem(itemsMap, item) {
  if (!item || !item.id) {
    return;
  }
  const hasUrl = QUALITY_ORDER.some((quality) => item.qualities?.[quality]);
  if (!hasUrl) {
    return;
  }
  itemsMap.set(item.id, item);
}

function extractCommentUrls(text) {
  const urls = [];
  if (!text) {
    return urls;
  }

  let match;
  while ((match = MEDIA_URL_REGEX.exec(text)) !== null) {
    urls.push(match[1]);
  }
  return urls;
}

function walkCommentNodes(nodes, visitor) {
  for (const node of nodes || []) {
    if (node?.kind !== "t1" || !node?.data) {
      continue;
    }
    visitor(node.data);
    const replies = node.data?.replies?.data?.children;
    if (Array.isArray(replies) && replies.length) {
      walkCommentNodes(replies, visitor);
    }
  }
}

function isSupportedMediaUrl(url) {
  return /\.(jpg|jpeg|png|webp|gif|mp4|webm)(\?|$)/i.test(url) || /(?:i\.redd\.it|v\.redd\.it|preview\.redd\.it)/i.test(url);
}

function getKindFromUrl(url) {
  if (/\.(mp4|webm)(\?|$)/i.test(url) || /v\.redd\.it/i.test(url)) {
    return "video";
  }
  if (/\.gif(\?|$)/i.test(url)) {
    return "gif";
  }
  return "image";
}

async function loadRedditJson() {
  const response = await fetch(buildJsonUrl(), { credentials: "include" });
  if (!response.ok) {
    throw new Error(`Failed to load post JSON: ${response.status}`);
  }
  return response.json();
}

function parseMediaFromJson(json) {
  const itemsMap = new Map();
  const post = json?.[0]?.data?.children?.[0]?.data;
  if (!post) {
    return { items: [], summary: { total: 0, post: 0, gallery: 0, comment: 0 } };
  }

  const postTitle = post.title || document.title || "reddit-post";
  const postPrefix = `post-${post.id || "current"}`;

  if (post.is_gallery && post.gallery_data?.items?.length) {
    for (const galleryItem of post.gallery_data.items) {
      const mediaId = galleryItem.media_id;
      const metadata = post.media_metadata?.[mediaId];
      const qualities = getImageQualitiesFromMetadata(metadata);

      addItem(
        itemsMap,
        createItem({
          id: `gallery-${mediaId}`,
          sourceType: "gallery",
          kind: metadata?.e === "AnimatedImage" ? "gif" : "image",
          label: `gallery-${galleryItem.id || mediaId}`,
          qualities,
          postTitle
        })
      );
    }
  }

  const videoQualities = getVideoQualities(post);
  if (videoQualities.original) {
    addItem(
      itemsMap,
      createItem({
        id: `${postPrefix}-video`,
        sourceType: "post",
        kind: "video",
        label: "post-video",
        qualities: videoQualities,
        postTitle
      })
    );
  }

  const postUrl = cleanupMediaUrl(post.url_overridden_by_dest || post.url || "");
  if (postUrl && isSupportedMediaUrl(postUrl)) {
    addItem(
      itemsMap,
      createItem({
        id: `${postPrefix}-direct`,
        sourceType: "post",
        kind: getKindFromUrl(postUrl),
        label: "post-media",
        qualities: { original: postUrl, high: postUrl, medium: postUrl, low: postUrl },
        postTitle
      })
    );
  }

  const previewImage = post.preview?.images?.[0];
  const previewQualities = getImageQualitiesFromPreview(previewImage);
  if (previewQualities.original) {
    addItem(
      itemsMap,
      createItem({
        id: `${postPrefix}-preview`,
        sourceType: "post",
        kind: post.post_hint === "image" ? "image" : "gif",
        label: "post-preview",
        qualities: previewQualities,
        postTitle
      })
    );
  }

  const comments = json?.[1]?.data?.children || [];
  walkCommentNodes(comments, (commentData) => {
    const body = [commentData.body || "", decodeHtml(commentData.body_html || "")].join("\n");
    const urls = extractCommentUrls(body)
      .map(cleanupMediaUrl)
      .filter((url) => isSupportedMediaUrl(url));

    urls.forEach((url, index) => {
      const id = `comment-${commentData.id}-${index}`;
      addItem(
        itemsMap,
        createItem({
          id,
          sourceType: "comment",
          kind: getKindFromUrl(url),
          label: `comment-${commentData.author || "user"}-${index + 1}`,
          qualities: { original: url, high: url, medium: url, low: url },
          postTitle
        })
      );
    });
  });

  const items = [...itemsMap.values()];
  const summary = {
    total: items.length,
    post: items.filter((item) => item.sourceType === "post").length,
    gallery: items.filter((item) => item.sourceType === "gallery").length,
    comment: items.filter((item) => item.sourceType === "comment").length
  };

  return { items, summary };
}

async function scanMedia() {
  try {
    const json = await loadRedditJson();
    return parseMediaFromJson(json);
  } catch (_error) {
    return { items: [], summary: { total: 0, post: 0, gallery: 0, comment: 0 } };
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "scan_media") {
    return false;
  }

  scanMedia()
    .then((result) => sendResponse(result))
    .catch(() => sendResponse({ items: [], summary: { total: 0, post: 0, gallery: 0, comment: 0 } }));

  return true;
});
