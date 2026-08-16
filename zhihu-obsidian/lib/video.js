// 视频源选择纯函数。不依赖 DOM，便于 Node 单测。

const QUALITY_SCORE = { fhd: 5, hd: 4, sd: 3, ld: 2 };

// 从 URL 判断清晰度分数（1 = 未知/无标记）。
// 老式知乎视频 CDN 形如 https://vdn.vzuu.com/HD/xxx.mp4，路径里带清晰度段。
export function qualityScore(url) {
  const u = String(url).toLowerCase();
  let best = 1;
  for (const [key, score] of Object.entries(QUALITY_SCORE)) {
    if (u.includes("/" + key + "/") || u.includes("_" + key) || u.includes("-" + key)) {
      best = Math.max(best, score);
    }
  }
  return best;
}

// 是否可直接下载为单文件（排除 blob / m3u8 / mpd 等流媒体）。
function isDownloadable(url) {
  const u = String(url);
  if (!u || u.startsWith("blob:")) return false;
  const lower = u.toLowerCase();
  return !(lower.includes(".m3u8") || lower.includes(".mpd") || lower.includes("dash"));
}

// 从多个源里选最高清的可下载 mp4。无可用源返回空串。
export function selectBestVideoUrl(sources) {
  const candidates = (sources || [])
    .filter((u) => isDownloadable(u))
    .filter((u) => /^https?:\/\//i.test(u));

  if (candidates.length === 0) return "";

  return candidates
    .map((url, i) => ({
      url,
      i,
      score: qualityScore(url),
      isMp4: /\.mp4(\?|$)/i.test(url),
    }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        (b.isMp4 ? 1 : 0) - (a.isMp4 ? 1 : 0) ||
        a.i - b.i
    )[0].url;
}
