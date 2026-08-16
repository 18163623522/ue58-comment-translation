// 知乎文章页 content script：遍历正文 DOM，产出结构化 blocks。
// MV3 content script 是 classic script，不支持静态 import，
// 因此用动态 import 加载 lib/parser.js（已在 manifest 声明 web_accessible_resources）。

// 在顶层异步加载纯函数，注册消息监听。
(async function main() {
  const { extractImageSrc, detectLanguage, toHdImageUrl } =
    await import(chrome.runtime.getURL("lib/parser.js"));

  function titleOf() {
    const el = document.querySelector("h1.Post-Title, .Post-Title, .Article-Title");
    return el ? el.textContent.trim() : document.title.replace(/ - 知乎$/, "").trim();
  }

  function authorOf() {
    const el = document.querySelector(".AuthorInfo-name, .AuthorInfo .Popover, .Post-Author .AuthorLink");
    return el ? el.textContent.trim() : "";
  }

  // 从真实 DOM 元素提取图片源（拍平成 attrs 对象交给纯函数）。
  function imgSrcOf(img) {
    return extractImageSrc({
      actualsrc: img.getAttribute("data-actualsrc"),
      original: img.getAttribute("data-original"),
      src: img.getAttribute("src") || img.getAttribute("data-src") || "",
    });
  }

  // 收集 <video> 标签的所有候选源（不同清晰度），供 background 选最高清。
  function collectVideoSources(videoEl) {
    const set = new Set();
    const push = (s) => {
      if (s && /^https?:\/\//i.test(s)) set.add(s);
    };
    if (videoEl) {
      push(videoEl.getAttribute("data-src"));
      push(videoEl.getAttribute("data-original"));
      push(videoEl.getAttribute("src"));
      push(videoEl.currentSrc);
      videoEl.querySelectorAll("source").forEach((s) => push(s.getAttribute("src")));
    }
    return Array.from(set);
  }

  function parseContent() {
    const container =
      document.querySelector(".Post-RichTextContainer, .Post-RichText, .RichText") ||
      document.querySelector(".Post-Content") ||
      document.body;
    const blocks = [];

    for (const node of container.children) {
      const tag = node.tagName ? node.tagName.toLowerCase() : "";

      // 视频卡片：figure 内嵌 video 或 zvideo 容器
      if (tag === "figure" && (node.querySelector("video") || node.querySelector(".zvideo"))) {
        const v = node.querySelector("video");
        const sources = collectVideoSources(v);
        const poster = node.querySelector("img");
        blocks.push({
          type: "video",
          sources,
          src: sources[0] || "",
          file: null,
          posterFile: null,
          posterUrl: poster ? toHdImageUrl(imgSrcOf(poster)) : "",
        });
        continue;
      }

      // 图片
      if (tag === "figure") {
        const img = node.querySelector("img");
        if (img) {
          blocks.push({ type: "image", src: toHdImageUrl(imgSrcOf(img)), file: null });
        }
        continue;
      }

      // 引用
      if (tag === "blockquote") {
        const lines = node.textContent.split("\n").map((s) => s.trim()).filter(Boolean);
        if (lines.length) blocks.push({ type: "quote", lines });
        continue;
      }

      // 代码块
      if (tag === "pre") {
        const code = node.querySelector("code");
        const cls = code ? Array.from(code.classList) : Array.from(node.classList);
        blocks.push({
          type: "code",
          lang: detectLanguage(cls),
          code: node.textContent.replace(/\n$/, ""),
        });
        continue;
      }

      // 列表
      if (tag === "ul" || tag === "ol") {
        blocks.push({
          type: "list",
          ordered: tag === "ol",
          items: Array.from(node.children).map((li) => li.textContent.trim()).filter(Boolean),
        });
        continue;
      }

      // 分隔线
      if (tag === "hr") {
        blocks.push({ type: "hr" });
        continue;
      }

      // 标题
      if (/^h[1-6]$/.test(tag)) {
        blocks.push({ type: "heading", level: Number(tag[1]), text: node.textContent.trim() });
        continue;
      }

      // 默认当段落处理（p、div、纯文本等）
      const text = node.textContent.trim();
      if (text) blocks.push({ type: "paragraph", text });
    }

    return blocks;
  }

  function collectArticle() {
    return {
      title: titleOf(),
      author: authorOf(),
      url: location.href,
      blocks: parseContent(),
    };
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === "PING") {
      sendResponse({ isArticle: true, title: titleOf() });
    } else if (msg.type === "GET_ARTICLE") {
      sendResponse({ article: collectArticle() });
    }
    return false;
  });
})();
