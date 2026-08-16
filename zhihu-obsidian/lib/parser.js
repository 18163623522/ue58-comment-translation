// 知乎文章解析相关的纯函数。不依赖 DOM，便于 Node 单测。
// content.js 会把真实 DOM 元素的属性拍平成普通对象后调用这些函数。

// 知乎图片懒加载：真实地址通常在 data-actualsrc / data-original。
export function extractImageSrc(attrs) {
  return attrs.actualsrc || attrs.original || attrs.src || "";
}

// 代码块语言：<pre><code> 的 class 形如 "language-python hljs"。
export function detectLanguage(classList) {
  for (const cls of classList) {
    const m = /^language-([a-zA-Z0-9+#-]+)$/.exec(cls);
    if (m) return m[1];
  }
  return "";
}

// 高清图：把知乎缩略图后缀 _r/_s/_b/_m 等换成 _hd。
export function toHdImageUrl(url) {
  return url.replace(/_(?:r|s|b|m|t|l)\.(jpg)$/i, "_hd.jpg");
}

// 文件名清洗：去掉 Windows 与 Obsidian 链接语法里的非法字符，限制长度。
export function sanitizeFilename(name) {
  const cleaned = String(name)
    .replace(/[\\/:*?"<>|#^\[\]]/g, "")
    .replace(/\s+/g, "")
    .slice(0, 60)
    .trim();
  return cleaned.length > 0 ? cleaned : "untitled";
}
