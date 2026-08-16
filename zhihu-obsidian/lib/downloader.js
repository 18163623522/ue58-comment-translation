// 媒体下载：带 Referer 绕过知乎防盗链。fetch 可注入以便单测。

const DEFAULT_REFERER = "https://www.zhihu.com/";

export async function downloadMedia(url, { referer = DEFAULT_REFERER, fetchImpl = fetch } = {}) {
  const res = await fetchImpl(url, {
    headers: { Referer: referer },
  });
  if (!res.ok) {
    throw new Error(`下载媒体失败 (HTTP ${res.status})：${url}`);
  }
  const buffer = await res.arrayBuffer();
  const contentType = (res.headers.get("content-type") || "").split(";")[0].trim();
  return { buffer, contentType };
}

// 根据 Content-Type 推断文件扩展名（下载得到的字节里没有原始文件名）。
export function extFromContentType(contentType) {
  const map = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/svg+xml": "svg",
    "video/mp4": "mp4",
  };
  return map[contentType] || "bin";
}
