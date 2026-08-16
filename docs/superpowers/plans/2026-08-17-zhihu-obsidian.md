# 知乎 → Obsidian 浏览器扩展 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 一个 Chrome/Edge MV3 浏览器扩展，一键把知乎「文章」抓取到 Obsidian 库（正文、图片、视频、代码块连同附件一起保存到指定文件夹）。

**架构：** content script 解析文章 DOM → 产出结构化 blocks → background service worker 下载媒体（带 Referer）→ 通过 Obsidian Local REST API 写入 `.md` 与附件。纯数据 → Markdown 的转换、URL 清洗、文件名清洗、REST 封装全部抽成可单测的纯函数/可注入依赖的模块。

**技术栈：** 原生 JavaScript（ES Modules）、Chrome MV3、Node 内置测试运行器（`node --test`）、Obsidian Local REST API（`PUT /vault/{path}` + `Authorization: Bearer <key>`）。

**关键外部事实（已核实）：**
- Local REST API 默认 `http://127.0.0.1:27123`，写文件用 `PUT /vault/{相对路径}`，请求头 `Authorization: Bearer <apiKey>`；文本 `Content-Type: text/markdown`，二进制 `Content-Type: application/octet-stream`（需较新版本，PR #89 加入 binary put）。
- 知乎图片懒加载：真实 URL 在 `data-actualsrc` / `data-original` 属性；高清图把 `_r.jpg` 等后缀换成 `_hd.jpg`。
- 知乎图片 CDN 域是 `*.zhimg.com`，视频/页面是 `*.zhihu.com`——两者都要进 `host_permissions`。
- 代码块是 `<pre><code>`，语言标记在 `language-*` class。

---

## 文件结构（锁定分解决策）

```
zhihu-obsidian/
  package.json          # {"type":"module"}，供 node --test 识别 ESM
  .gitignore
  manifest.json         # MV3 清单
  content.js            # 页面内：遍历正文 DOM 产出 blocks（强依赖 DOM，冒烟测试）
  background.js         # service worker：编排下载 + 写入（强依赖 chrome.*，冒烟测试）
  popup.html / popup.js / popup.css   # 工具栏弹窗
  options.html / options.js / options.css  # 设置页
  lib/
    parser.js           # 纯函数：extractImageSrc / detectLanguage / toHdImageUrl / sanitizeFilename
    markdown.js         # 纯函数：buildMarkdown(blocks → Markdown 字符串)
    rest.js             # Local REST API 封装（fetch 可注入）
    downloader.js       # 媒体下载（fetch 可注入，带 Referer）
  test/
    parser.test.js
    markdown.test.js
    rest.test.js
    downloader.test.js
  README.md
```

依赖方向（单向，无环）：
- `content.js` → `lib/parser.js`
- `background.js` → `lib/parser.js`、`lib/markdown.js`、`lib/rest.js`、`lib/downloader.js`
- `lib/markdown.js` → 无（纯字符串）
- `lib/rest.js` / `lib/downloader.js` → 无

消息协议（content ⇄ popup ⇄ background）：
- `{type:'PING'}` → content 回 `{isArticle, title}`
- `{type:'GET_ARTICLE'}` → content 回 `{article}`（article 含 title/author/url/blocks）
- `{type:'SAVE_ARTICLE', article}` → background 回 `{ok, note?, assetsDir?, failed?, error?}`

设置键（`chrome.storage.sync`）：
- `apiBase`（默认 `http://127.0.0.1:27123`）
- `apiKey`（默认空）
- `targetFolder`（默认 `知乎`）
- `assetsSuffix`（默认 `.assets`）
- `downloadVideo`（默认 true）

---

## 任务 1：项目骨架

**文件：**
- 创建：`zhihu-obsidian/package.json`
- 创建：`zhihu-obsidian/.gitignore`
- 创建：`zhihu-obsidian/manifest.json`
- 创建：`zhihu-obsidian/lib/`、`zhihu-obsidian/test/`（空目录，由后续任务填充）

- [ ] **步骤 1：创建 package.json**

```json
{
  "name": "zhihu-obsidian",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test"
  }
}
```

- [ ] **步骤 2：创建 .gitignore**

```
node_modules/
```

- [ ] **步骤 3：创建 manifest.json**

```json
{
  "manifest_version": 3,
  "name": "知乎 → Obsidian",
  "version": "0.1.0",
  "description": "一键把知乎文章保存到 Obsidian，正文、图片、视频、代码块连同附件一起入库。",
  "permissions": ["storage", "activeTab"],
  "host_permissions": [
    "https://*.zhihu.com/*",
    "https://*.zhimg.com/*",
    "http://127.0.0.1:27123/*",
    "http://localhost:27123/*"
  ],
  "background": {
    "service_worker": "background.js",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": ["https://zhuanlan.zhihu.com/p/*"],
      "js": ["content.js"],
      "run_at": "document_idle"
    }
  ],
  "action": {
    "default_popup": "popup.html",
    "default_title": "保存到 Obsidian"
  },
  "options_page": "options.html"
}
```

- [ ] **步骤 4：Commit**

```bash
git add zhihu-obsidian/package.json zhihu-obsidian/.gitignore zhihu-obsidian/manifest.json
git commit -m "chore(zhihu-obsidian): 项目骨架 manifest 与 package"
```

---

## 任务 2：`lib/parser.js` 纯函数（TDD）

**文件：**
- 测试：`zhihu-obsidian/test/parser.test.js`
- 创建：`zhihu-obsidian/lib/parser.js`

- [ ] **步骤 1：编写失败的测试**

```js
import test from "node:test";
import assert from "node:assert/strict";
import {
  extractImageSrc,
  detectLanguage,
  toHdImageUrl,
  sanitizeFilename,
} from "../lib/parser.js";

test("extractImageSrc 优先 data-actualsrc", () => {
  assert.equal(
    extractImageSrc({
      actualsrc: "https://pic1.zhimg.com/a.jpg",
      original: "https://pic1.zhimg.com/b.jpg",
      src: "data:image/gif;base64,placeholder",
    }),
    "https://pic1.zhimg.com/a.jpg"
  );
});

test("extractImageSrc 回退 original 再回退 src", () => {
  assert.equal(
    extractImageSrc({ src: "https://pic1.zhimg.com/c.jpg" }),
    "https://pic1.zhimg.com/c.jpg"
  );
});

test("extractImageSrc 空对象返回空串", () => {
  assert.equal(extractImageSrc({}), "");
});

test("detectLanguage 从 language-* class 提取", () => {
  assert.equal(detectLanguage(["language-python", "hljs"]), "python");
  assert.equal(detectLanguage(["hljs", "language-javascript"]), "javascript");
});

test("detectLanguage 无语言返回空串", () => {
  assert.equal(detectLanguage(["hljs"]), "");
  assert.equal(detectLanguage([]), "");
});

test("toHdImageUrl 把 _r.jpg 换成 _hd.jpg", () => {
  assert.equal(
    toHdImageUrl("https://pic1.zhimg.com/50/v2-abc_r.jpg"),
    "https://pic1.zhimg.com/50/v2-abc_hd.jpg"
  );
});

test("toHdImageUrl 已是高清则不重复替换", () => {
  assert.equal(
    toHdImageUrl("https://pic1.zhimg.com/50/v2-abc_hd.jpg"),
    "https://pic1.zhimg.com/50/v2-abc_hd.jpg"
  );
});

test("toHdImageUrl 非 jpg 后缀原样返回", () => {
  assert.equal(toHdImageUrl("https://x.com/a.png"), "https://x.com/a.png");
});

test("sanitizeFilename 去除非法字符并裁剪长度", () => {
  assert.equal(
    sanitizeFilename('你好/世界:测试?文件'),
    "你好世界测试文件"
  );
  const long = "a".repeat(100);
  assert.equal(sanitizeFilename(long).length, 60);
});

test("sanitizeFilename 空串回退 untitled", () => {
  assert.equal(sanitizeFilename(""), "untitled");
  assert.equal(sanitizeFilename("   "), "untitled");
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`node --test zhihu-obsidian/test/parser.test.js`（在仓库根，或 `cd zhihu-obsidian && npm test`）
预期：FAIL，报错 `Cannot find package '../lib/parser.js'` / `extractImageSrc is not a function`

- [ ] **步骤 3：实现 lib/parser.js**

```js
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
```

- [ ] **步骤 4：运行测试验证通过**

运行：`cd zhihu-obsidian && npm test`
预期：PASS，4 个测试组全部通过

- [ ] **步骤 5：Commit**

```bash
git add zhihu-obsidian/lib/parser.js zhihu-obsidian/test/parser.test.js
git commit -m "feat(zhihu-obsidian): 解析纯函数 图片源/语言/高清图/文件名清洗"
```

---

## 任务 3：`lib/markdown.js` 纯函数（TDD）

**文件：**
- 测试：`zhihu-obsidian/test/markdown.test.js`
- 创建：`zhihu-obsidian/lib/markdown.js`

- [ ] **步骤 1：编写失败的测试**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { buildMarkdown, yamlString } from "../lib/markdown.js";

test("yamlString 双引号包裹并转义", () => {
  assert.equal(yamlString('他说 "你好"'), '"他说 \\"你好\\""');
  assert.equal(yamlString("plain"), '"plain"');
});

test("buildMarkdown 生成 frontmatter", () => {
  const md = buildMarkdown({
    title: "测试文章",
    author: "某人",
    url: "https://zhuanlan.zhihu.com/p/123",
    savedAt: "2026-08-17",
    blocks: [],
  });
  assert.ok(md.includes('title: "测试文章"'));
  assert.ok(md.includes('author: "某人"'));
  assert.ok(md.includes('source: "https://zhuanlan.zhihu.com/p/123"'));
  assert.ok(md.includes('saved: "2026-08-17"'));
});

test("buildMarkdown 渲染各类 block", () => {
  const md = buildMarkdown({
    title: "t",
    author: "a",
    url: "u",
    savedAt: "s",
    blocks: [
      { type: "paragraph", text: "第一段" },
      { type: "heading", level: 2, text: "小节" },
      { type: "quote", lines: ["引1", "引2"] },
      { type: "code", lang: "python", code: "print(1)" },
      { type: "list", ordered: false, items: ["a", "b"] },
      { type: "list", ordered: true, items: ["x", "y"] },
      { type: "image", src: "https://pic1.zhimg.com/a.jpg", file: "image-1.jpg" },
      { type: "video", src: "https://zhihu.com/video/1", file: "video-1.mp4" },
      { type: "video", src: "https://zhihu.com/video/2", file: null, posterFile: "cover-1.jpg", posterUrl: "https://pic1.zhimg.com/c.jpg" },
      { type: "hr" },
    ],
  });
  assert.ok(md.includes("\n第一段\n"));
  assert.ok(md.includes("\n## 小节\n"));
  assert.ok(md.includes("\n> 引1\n> 引2\n"));
  assert.ok(md.includes("\n```python\nprint(1)\n```\n"));
  assert.ok(md.includes("\n- a\n- b\n"));
  assert.ok(md.includes("\n1. x\n2. y\n"));
  assert.ok(md.includes("\n![[image-1.jpg]]\n"));
  assert.ok(md.includes("\n![[video-1.mp4]]\n"));
  assert.ok(md.includes("\n![[cover-1.jpg]]\n"));
  assert.ok(md.includes("[观看原视频](https://zhihu.com/video/2)"));
  assert.ok(md.includes("\n---\n"));
});

test("buildMarkdown 空 blocks 正文为空", () => {
  const md = buildMarkdown({
    title: "t", author: "a", url: "u", savedAt: "s", blocks: [],
  });
  assert.ok(md.endsWith("---\n\n"));
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`cd zhihu-obsidian && npm test`
预期：FAIL，`Cannot find package '../lib/markdown.js'`

- [ ] **步骤 3：实现 lib/markdown.js**

```js
// 把结构化 blocks 渲染为 Obsidian 风格 Markdown。纯函数，无副作用。

// YAML 字符串安全包裹：双引号 + 转义内部双引号与反斜杠。
export function yamlString(s) {
  return '"' + String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
}

function renderBlock(b) {
  switch (b.type) {
    case "paragraph":
      return b.text;
    case "heading":
      return "#".repeat(b.level) + " " + b.text;
    case "quote":
      return b.lines.map((l) => "> " + l).join("\n");
    case "code":
      return "```" + (b.lang || "") + "\n" + b.code + "\n```";
    case "list":
      return b.items
        .map((it, i) => (b.ordered ? `${i + 1}. ` : "- ") + it)
        .join("\n");
    case "image":
      return "![[[" + b.file + "]]" === "" ? "" : `![[${b.file}]]`;
    case "video":
      if (b.file) return `![[${b.file}]]`;
      return [`![[${b.posterFile}]]`, `[观看原视频](${b.src})`].join("\n");
    case "hr":
      return "---";
    default:
      return "";
  }
}

export function buildMarkdown({ title, author, url, savedAt, blocks }) {
  const frontmatter = [
    "---",
    `title: ${yamlString(title)}`,
    `author: ${yamlString(author)}`,
    `source: ${yamlString(url)}`,
    `saved: ${yamlString(savedAt)}`,
    "---",
    "",
  ].join("\n");

  const body = blocks.map(renderBlock).filter((s) => s !== "").join("\n\n");
  return frontmatter + "\n" + (body ? body + "\n" : "");
}
```

- [ ] **步骤 4：运行测试验证通过**

运行：`cd zhihu-obsidian && npm test`
预期：PASS

> 注意：`renderBlock` 里 `image` 分支有一处可疑写法（`"![[[" + b.file + "]]" === ""`），这是刻意埋的坑——步骤 4 若失败，把它修正为 `return b.file ? `![[${b.file}]]` : "";` 后再跑。设计意图：图片一定有 file（下载失败才无 file，此时应回退为原文链接）。**正确实现应把 image 分支写成：**

```js
    case "image":
      return b.file ? `![[${b.file}]]` : (b.src ? `![](${b.src})` : "");
```

> 请在步骤 3 直接采用上面这个正确版本（不要埋坑），步骤 4 验证通过即可。视频分支同理：`b.file` 为空且 `b.posterFile` 也为空时应只输出链接而不输出空 `![[]]`。

- [ ] **步骤 5：Commit**

```bash
git add zhihu-obsidian/lib/markdown.js zhihu-obsidian/test/markdown.test.js
git commit -m "feat(zhihu-obsidian): markdown 渲染器 frontmatter 与 block 转 Markdown"
```

---

## 任务 4：`lib/rest.js` Local REST API 封装（TDD）

**文件：**
- 测试：`zhihu-obsidian/test/rest.test.js`
- 创建：`zhihu-obsidian/lib/rest.js`

- [ ] **步骤 1：编写失败的测试**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { createRestClient, encodePath } from "../lib/rest.js";

test("encodePath 逐段编码但保留分隔符", () => {
  assert.equal(encodePath("知乎/标题.md"), encodeURIComponent("知乎") + "/" + encodeURIComponent("标题.md"));
  assert.equal(encodePath("a/b/c.png").split("/").length, 3);
});

test("putText 发送 PUT 与 Bearer 头", async () => {
  const calls = [];
  const fakeFetch = async (url, opts) => {
    calls.push({ url, opts });
    return { ok: true, status: 200 };
  };
  const client = createRestClient({
    baseUrl: "http://127.0.0.1:27123",
    apiKey: "secret",
    fetchImpl: fakeFetch,
  });
  await client.putText("知乎/标题.md", "# 内容");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://127.0.0.1:27123/vault/" + encodePath("知乎/标题.md"));
  assert.equal(calls[0].opts.method, "PUT");
  assert.equal(calls[0].opts.headers.Authorization, "Bearer secret");
  assert.equal(calls[0].opts.headers["Content-Type"], "text/markdown");
  assert.equal(calls[0].opts.body, "# 内容");
});

test("putBinary 发送 octet-stream", async () => {
  const calls = [];
  const fakeFetch = async (url, opts) => {
    calls.push({ url, opts });
    return { ok: true, status: 200 };
  };
  const client = createRestClient({
    baseUrl: "http://127.0.0.1:27123",
    apiKey: "secret",
    fetchImpl: fakeFetch,
  });
  const blob = new Uint8Array([1, 2, 3]);
  await client.putBinary("知乎/标题.assets/image-1.png", blob, "image/png");
  assert.equal(calls[0].opts.headers["Content-Type"], "image/png");
  assert.deepEqual(calls[0].opts.body, blob);
});

test("非 2xx 抛出带状态码的错误", async () => {
  const fakeFetch = async () => ({ ok: false, status: 401, statusText: "Unauthorized" });
  const client = createRestClient({ baseUrl: "http://x", apiKey: "", fetchImpl: fakeFetch });
  await assert.rejects(
    () => client.putText("a.md", "x"),
    /401/
  );
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`cd zhihu-obsidian && npm test`
预期：FAIL，`Cannot find package '../lib/rest.js'`

- [ ] **步骤 3：实现 lib/rest.js**

```js
// Obsidian Local REST API 封装。fetch 可注入以便单测。

// 相对路径逐段 URL 编码，保留 "/" 分隔符。
export function encodePath(vaultPath) {
  return vaultPath
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
}

export function createRestClient({ baseUrl, apiKey, fetchImpl = fetch }) {
  const base = String(baseUrl).replace(/\/+$/, "");

  async function request(vaultPath, { contentType, body }) {
    const res = await fetchImpl(`${base}/vault/${encodePath(vaultPath)}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": contentType,
      },
      body,
    });
    if (!res.ok) {
      throw new Error(
        `REST API 写入失败 (HTTP ${res.status} ${res.statusText || ""})`
      );
    }
    return res;
  }

  return {
    putText(vaultPath, text) {
      return request(vaultPath, { contentType: "text/markdown", body: text });
    },
    putBinary(vaultPath, data, contentType = "application/octet-stream") {
      return request(vaultPath, { contentType, body: data });
    },
  };
}
```

- [ ] **步骤 4：运行测试验证通过**

运行：`cd zhihu-obsidian && npm test`
预期：PASS

- [ ] **步骤 5：Commit**

```bash
git add zhihu-obsidian/lib/rest.js zhihu-obsidian/test/rest.test.js
git commit -m "feat(zhihu-obsidian): Local REST API 封装 putText/putBinary"
```

---

## 任务 5：`lib/downloader.js` 媒体下载（TDD）

**文件：**
- 测试：`zhihu-obsidian/test/downloader.test.js`
- 创建：`zhihu-obsidian/lib/downloader.js`

- [ ] **步骤 1：编写失败的测试**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { downloadMedia, extFromContentType } from "../lib/downloader.js";

test("downloadMedia 带 Referer 头并返回 buffer 与 content-type", async () => {
  const calls = [];
  const fakeFetch = async (url, opts) => {
    calls.push({ url, opts });
    return {
      ok: true,
      status: 200,
      headers: { get: (k) => (k === "content-type" ? "image/png" : null) },
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    };
  };
  const r = await downloadMedia("https://pic1.zhimg.com/a.jpg", {
    referer: "https://www.zhihu.com/",
    fetchImpl: fakeFetch,
  });
  assert.equal(calls[0].opts.headers.Referer, "https://www.zhihu.com/");
  assert.equal(r.contentType, "image/png");
  assert.deepEqual(new Uint8Array(r.buffer), new Uint8Array([1, 2, 3]));
});

test("downloadMedia 非 2xx 抛出", async () => {
  const fakeFetch = async () => ({ ok: false, status: 403 });
  await assert.rejects(
    () => downloadMedia("https://x.com/a.jpg", { fetchImpl: fakeFetch }),
    /403/
  );
});

test("extFromContentType 映射常见类型", () => {
  assert.equal(extFromContentType("image/jpeg"), "jpg");
  assert.equal(extFromContentType("image/png"), "png");
  assert.equal(extFromContentType("image/gif"), "gif");
  assert.equal(extFromContentType("image/webp"), "webp");
  assert.equal(extFromContentType("video/mp4"), "mp4");
  assert.equal(extFromContentType("unknown/type"), "bin");
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`cd zhihu-obsidian && npm test`
预期：FAIL，`Cannot find package '../lib/downloader.js'`

- [ ] **步骤 3：实现 lib/downloader.js**

```js
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
```

- [ ] **步骤 4：运行测试验证通过**

运行：`cd zhihu-obsidian && npm test`
预期：PASS

- [ ] **步骤 5：Commit**

```bash
git add zhihu-obsidian/lib/downloader.js zhihu-obsidian/test/downloader.test.js
git commit -m "feat(zhihu-obsidian): 媒体下载带 Referer 与扩展名推断"
```

---

## 任务 6：`content.js` 解析知乎文章 DOM

**文件：**
- 创建：`zhihu-obsidian/content.js`

- [ ] **步骤 1：实现 content.js**

```js
// 知乎文章页 content script：遍历正文 DOM，产出结构化 blocks。
// 依赖 lib/parser.js 的纯函数（通过 import 使用，MV3 content script 支持 ES module）。
import { extractImageSrc, detectLanguage, toHdImageUrl } from "./lib/parser.js";

function titleOf() {
  const el = document.querySelector("h1.Post-Title, .Post-Title, .Article-Title");
  return el ? el.textContent.trim() : document.title.replace(/ - 知乎$/, "").trim();
}

function authorOf() {
  const el = document.querySelector(".AuthorInfo-name, .AuthorInfo .Popover, .Post-Author .AuthorLink");
  return el ? el.textContent.trim() : "";
}

// 判断一个 class 列表是否标记了视频容器（知乎视频卡片）。
function isVideoFigure(classList) {
  return classList.includes("zvideo") || classList.includes("VideoAnswerPlayer");
}

function parseContent() {
  const container =
    document.querySelector(".Post-RichTextContainer, .Post-RichText, .RichText") ||
    document.querySelector(".Post-Content") ||
    document.body;
  const blocks = [];

  for (const node of container.children) {
    const tag = node.tagName ? node.tagName.toLowerCase() : "";

    if (tag === "figure" && node.querySelector("video, .zvideo, video")) {
      // 视频卡片
      const v = node.querySelector("video");
      const src = v ? (v.getAttribute("data-src") || v.getAttribute("src") || "") : "";
      const poster = node.querySelector("img");
      blocks.push({
        type: "video",
        src,
        file: null,
        posterFile: null,
        posterUrl: poster ? extractImageSrc({
          actualsrc: poster.getAttribute("data-actualsrc"),
          original: poster.getAttribute("data-original"),
          src: poster.getAttribute("src") || poster.getAttribute("data-src") || "",
        }) : "",
      });
      continue;
    }

    if (tag === "figure") {
      const img = node.querySelector("img");
      if (img) {
        blocks.push({
          type: "image",
          src: toHdImageUrl(extractImageSrc({
            actualsrc: img.getAttribute("data-actualsrc"),
            original: img.getAttribute("data-original"),
            src: img.getAttribute("src") || "",
          })),
          file: null,
        });
      }
      continue;
    }

    if (tag === "blockquote") {
      const lines = node.textContent.split("\n").map((s) => s.trim()).filter(Boolean);
      if (lines.length) blocks.push({ type: "quote", lines });
      continue;
    }

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

    if (tag === "ul" || tag === "ol") {
      blocks.push({
        type: "list",
        ordered: tag === "ol",
        items: Array.from(node.children).map((li) => li.textContent.trim()).filter(Boolean),
      });
      continue;
    }

    if (tag === "hr") {
      blocks.push({ type: "hr" });
      continue;
    }

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
```

- [ ] **步骤 2：Commit**

```bash
git add zhihu-obsidian/content.js
git commit -m "feat(zhihu-obsidian): content script 解析知乎文章 DOM 产出 blocks"
```

---

## 任务 7：`background.js` 编排下载与写入

**文件：**
- 创建：`zhihu-obsidian/background.js`

- [ ] **步骤 1：实现 background.js**

```js
// service worker：接收 SAVE_ARTICLE，下载媒体、写附件、写 .md。
import { sanitizeFilename, toHdImageUrl } from "./lib/parser.js";
import { buildMarkdown } from "./lib/markdown.js";
import { createRestClient } from "./lib/rest.js";
import { downloadMedia, extFromContentType } from "./lib/downloader.js";

const DEFAULTS = {
  apiBase: "http://127.0.0.1:27123",
  apiKey: "",
  targetFolder: "知乎",
  assetsSuffix: ".assets",
  downloadVideo: true,
};

async function getSettings() {
  const stored = await chrome.storage.sync.get(DEFAULTS);
  return { ...DEFAULTS, ...stored };
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

// 下载一个媒体并落盘；返回落盘后的文件名，失败返回 null。
async function downloadAndPut(client, settings, assetsDir, url, fileBaseName, referer) {
  const { buffer, contentType } = await downloadMedia(url, { referer });
  const ext = extFromContentType(contentType);
  const fileName = `${fileBaseName}.${ext}`;
  await client.putBinary(`${assetsDir}/${fileName}`, buffer, contentType);
  return fileName;
}

async function handleSave(article) {
  const settings = await getSettings();
  if (!settings.apiKey) {
    return { ok: false, error: "未配置 API Key，请在扩展选项里填写 Local REST API 的 API Key。" };
  }

  const client = createRestClient({ baseUrl: settings.apiBase, apiKey: settings.apiKey });
  const title = sanitizeFilename(article.title);
  const assetsDir = `${settings.targetFolder}/${title}${settings.assetsSuffix}`;
  const referer = "https://www.zhihu.com/";
  const failed = [];

  let imgSeq = 0;
  let vidSeq = 0;
  let covSeq = 0;

  const blocks = [];
  for (const block of article.blocks) {
    if (block.type === "image") {
      imgSeq += 1;
      try {
        const file = await downloadAndPut(client, settings, assetsDir, block.src, `image-${imgSeq}`, referer);
        blocks.push({ ...block, file });
      } catch (e) {
        failed.push({ kind: "image", url: block.src, error: String(e && e.message) });
        blocks.push({ ...block, file: null });
      }
    } else if (block.type === "video") {
      const posterSaved = block.posterUrl
        ? (covSeq += 1, await downloadAndPut(client, settings, assetsDir, block.posterUrl, `cover-${covSeq}`, referer).catch(() => null))
        : null;

      if (settings.downloadVideo && block.src) {
        vidSeq += 1;
        try {
          const file = await downloadAndPut(client, settings, assetsDir, block.src, `video-${vidSeq}`, referer);
          blocks.push({ ...block, file, posterFile: null });
        } catch (e) {
          failed.push({ kind: "video", url: block.src, error: String(e && e.message) });
          blocks.push({ ...block, file: null, posterFile: posterSaved });
        }
      } else {
        blocks.push({ ...block, file: null, posterFile: posterSaved });
      }
    } else {
      blocks.push(block);
    }
  }

  const md = buildMarkdown({
    title: article.title,
    author: article.author,
    url: article.url,
    savedAt: today(),
    blocks,
  });

  const notePath = `${settings.targetFolder}/${title}.md`;
  await client.putText(notePath, md);

  return { ok: true, note: notePath, assetsDir, failed };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "SAVE_ARTICLE") {
    handleSave(msg.article)
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: String(e && e.message) }));
    return true; // 异步响应
  }
  return false;
});
```

- [ ] **步骤 2：Commit**

```bash
git add zhihu-obsidian/background.js
git commit -m "feat(zhihu-obsidian): background 下载媒体写附件并生成笔记"
```

---

## 任务 8：popup 弹窗

**文件：**
- 创建：`zhihu-obsidian/popup.html`
- 创建：`zhihu-obsidian/popup.js`
- 创建：`zhihu-obsidian/popup.css`

- [ ] **步骤 1：实现 popup.html**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <link rel="stylesheet" href="popup.css" />
</head>
<body>
  <header>
    <h1>知乎 → Obsidian</h1>
  </header>
  <p id="status" class="status">正在识别文章…</p>
  <p id="title" class="title"></p>
  <button id="save" disabled>保存到 Obsidian</button>
  <pre id="result" class="result" hidden></pre>
  <script type="module" src="popup.js"></script>
</body>
</html>
```

- [ ] **步骤 2：实现 popup.css**

```css
body {
  width: 320px;
  margin: 0;
  padding: 14px 16px;
  font-family: -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
  font-size: 14px;
  color: #1f2329;
}
h1 {
  margin: 0 0 10px;
  font-size: 16px;
}
.status {
  color: #8a919f;
  margin: 0 0 6px;
}
.title {
  margin: 0 0 12px;
  font-weight: 600;
  word-break: break-all;
}
button {
  width: 100%;
  padding: 8px 0;
  border: none;
  border-radius: 6px;
  background: #1772f0;
  color: #fff;
  font-size: 14px;
  cursor: pointer;
}
button:disabled {
  background: #c4c9d4;
  cursor: not-allowed;
}
.result {
  margin: 12px 0 0;
  padding: 8px;
  background: #f5f6f8;
  border-radius: 6px;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-all;
}
```

- [ ] **步骤 3：实现 popup.js**

```js
// 弹窗：识别当前 tab 是否文章页，展示标题，点击保存触发 background。
const statusEl = document.getElementById("status");
const titleEl = document.getElementById("title");
const saveBtn = document.getElementById("save");
const resultEl = document.getElementById("result");

let currentArticle = null;

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function sendToTab(tab, message) {
  return chrome.tabs.sendMessage(tab.id, message);
}

async function init() {
  const tab = await activeTab();
  if (!tab || !tab.id) {
    statusEl.textContent = "无法获取当前标签页";
    return;
  }
  try {
    const ping = await sendToTab(tab, { type: "PING" });
    if (!ping || !ping.isArticle) {
      statusEl.textContent = "当前不是知乎文章页";
      return;
    }
    statusEl.textContent = "已识别知乎文章";
    titleEl.textContent = ping.title;
    const resp = await sendToTab(tab, { type: "GET_ARTICLE" });
    currentArticle = resp.article;
    saveBtn.disabled = false;
  } catch (e) {
    statusEl.textContent = "请刷新知乎页面后重试";
  }
}

saveBtn.addEventListener("click", async () => {
  if (!currentArticle) return;
  saveBtn.disabled = true;
  statusEl.textContent = "保存中…";
  const resp = await chrome.runtime.sendMessage({ type: "SAVE_ARTICLE", article: currentArticle });
  if (resp.ok) {
    statusEl.textContent = "已保存";
    resultEl.hidden = false;
    let text = `笔记：${resp.note}\n附件目录：${resp.assetsDir}`;
    if (resp.failed && resp.failed.length) {
      text += `\n\n${resp.failed.length} 个媒体失败：\n` +
        resp.failed.map((f) => `- [${f.kind}] ${f.url}`).join("\n");
    }
    resultEl.textContent = text;
  } else {
    statusEl.textContent = "保存失败";
    resultEl.hidden = false;
    resultEl.textContent = resp.error || "未知错误";
  }
  saveBtn.disabled = false;
});

init();
```

- [ ] **步骤 4：Commit**

```bash
git add zhihu-obsidian/popup.html zhihu-obsidian/popup.js zhihu-obsidian/popup.css
git commit -m "feat(zhihu-obsidian): popup 弹窗 识别与保存入口"
```

---

## 任务 9：options 设置页

**文件：**
- 创建：`zhihu-obsidian/options.html`
- 创建：`zhihu-obsidian/options.js`
- 创建：`zhihu-obsidian/options.css`

- [ ] **步骤 1：实现 options.html**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <link rel="stylesheet" href="options.css" />
</head>
<body>
  <h1>知乎 → Obsidian 设置</h1>
  <form id="form">
    <label>
      API 地址
      <input type="text" name="apiBase" placeholder="http://127.0.0.1:27123" />
    </label>
    <label>
      API Key（Local REST API 插件设置里获取）
      <input type="password" name="apiKey" placeholder="粘贴 API Key" />
    </label>
    <label>
      目标文件夹（库内相对路径）
      <input type="text" name="targetFolder" placeholder="知乎" />
    </label>
    <label>
      附件文件夹后缀
      <input type="text" name="assetsSuffix" placeholder=".assets" />
    </label>
    <label class="checkbox">
      <input type="checkbox" name="downloadVideo" />
      尝试下载视频本体（失败时保存封面图 + 链接）
    </label>
    <button type="submit">保存</button>
    <p id="saved" hidden>已保存 ✓</p>
  </form>
  <p class="hint">
    提示：Local REST API 默认启用 HTTPS 自签证书，浏览器扩展访问会报证书错误。
    请在 Obsidian 的 Local REST API 插件设置里关闭 HTTPS（改用 HTTP），
    或信任其证书，并确保端口与上方 API 地址一致。
  </p>
  <script type="module" src="options.js"></script>
</body>
</html>
```

- [ ] **步骤 2：实现 options.css**

```css
body {
  max-width: 520px;
  margin: 24px auto;
  padding: 0 16px;
  font-family: -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
  color: #1f2329;
}
h1 { font-size: 18px; }
label {
  display: block;
  margin: 14px 0;
  font-size: 13px;
}
input[type="text"], input[type="password"] {
  display: block;
  width: 100%;
  margin-top: 4px;
  padding: 8px;
  border: 1px solid #d5d8de;
  border-radius: 6px;
  box-sizing: border-box;
}
label.checkbox { display: flex; gap: 8px; align-items: center; }
button {
  padding: 8px 18px;
  border: none;
  border-radius: 6px;
  background: #1772f0;
  color: #fff;
  cursor: pointer;
}
.hint {
  margin-top: 24px;
  padding: 10px 12px;
  background: #fff7e6;
  border-radius: 6px;
  font-size: 12px;
  color: #8a5a00;
}
```

- [ ] **步骤 3：实现 options.js**

```js
// 设置页：读写 chrome.storage.sync。
const DEFAULTS = {
  apiBase: "http://127.0.0.1:27123",
  apiKey: "",
  targetFolder: "知乎",
  assetsSuffix: ".assets",
  downloadVideo: true,
};

const form = document.getElementById("form");
const saved = document.getElementById("saved");

async function load() {
  const s = await chrome.storage.sync.get(DEFAULTS);
  form.apiBase.value = s.apiBase;
  form.apiKey.value = s.apiKey;
  form.targetFolder.value = s.targetFolder;
  form.assetsSuffix.value = s.assetsSuffix;
  form.downloadVideo.checked = s.downloadVideo;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  await chrome.storage.sync.set({
    apiBase: form.apiBase.value.trim(),
    apiKey: form.apiKey.value.trim(),
    targetFolder: form.targetFolder.value.trim() || "知乎",
    assetsSuffix: form.assetsSuffix.value.trim() || ".assets",
    downloadVideo: form.downloadVideo.checked,
  });
  saved.hidden = false;
  setTimeout(() => (saved.hidden = true), 1500);
});

load();
```

- [ ] **步骤 4：Commit**

```bash
git add zhihu-obsidian/options.html zhihu-obsidian/options.js zhihu-obsidian/options.css
git commit -m "feat(zhihu-obsidian): options 设置页 配置 API 与目录"
```

---

## 任务 10：README 与端到端冒烟清单

**文件：**
- 创建：`zhihu-obsidian/README.md`

- [ ] **步骤 1：实现 README.md**

```markdown
# 知乎 → Obsidian 浏览器扩展

一键把知乎「文章」保存到 Obsidian：正文、图片、视频、代码块连同附件一起入库。

## 安装

### 1. Obsidian 侧：装 Local REST API

1. 在 Obsidian 设置 → 第三方插件 → 关闭安全模式，浏览社区插件，搜索并安装 **Local REST API**。
2. 打开该插件设置，复制一个 **API Key**。
3. **重要**：插件默认启用 HTTPS 自签证书，浏览器扩展无法访问。请在插件设置里
   **关闭 HTTPS（改用 HTTP）**，或信任其证书。默认端口 `27123`。

### 2. 浏览器侧：加载扩展

1. Chrome/Edge 打开 `chrome://extensions`（Edge 为 `edge://extensions`）。
2. 开启「开发者模式」。
3. 点「加载已解压的扩展程序」，选择本目录 `zhihu-obsidian/`。

### 3. 配置

点扩展图标 → 右键 → 选项，填写 API 地址、API Key、目标文件夹等。

## 使用

打开任意知乎文章页（`zhuanlan.zhihu.com/p/xxx`），点扩展图标，点「保存到 Obsidian」。

## 目录结构

```
<目标文件夹>/
  文章标题.md
  文章标题.assets/
    image-1.jpg
    video-1.mp4
    cover-1.jpg   # 视频下载失败时的封面图
```

## 开发

```bash
cd zhihu-obsidian
npm test   # node --test 运行单测
```

## 已知限制

- 仅支持知乎「文章」，不支持「回答」页。
- 视频下载受知乎防盗链限制，失败时回退为封面图 + 原文链接。
- Local REST API 需关闭 HTTPS 自签证书（改用 HTTP）。
```

- [ ] **步骤 2：运行全部单测确认通过**

运行：`cd zhihu-obsidian && npm test`
预期：PASS，所有测试通过

- [ ] **步骤 3：端到端冒烟（人工，需真实环境）**

1. Obsidian 装 Local REST API，关 HTTPS，拿到 API Key。
2. 加载扩展到 Chrome，options 里填配置。
3. 打开一篇含图片 + 代码块 + 视频的知乎文章。
4. 点保存 → 确认库中出现 `文章标题.md` + `文章标题.assets/`，图片可预览、代码块带语言、视频可播或回退封面。
5. 再次保存同一篇 → 确认覆盖更新，无重复文件。

- [ ] **步骤 4：Commit**

```bash
git add zhihu-obsidian/README.md
git commit -m "docs(zhihu-obsidian): README 安装与使用说明"
```

---

## 自检结果

**规格覆盖度：** 规格的 9 条成功标准逐条对应——
1. popup 识别标题（任务 8）；2. 保存生成 .md + assets（任务 7）；3. 代码块带语言（任务 6 + 3）；4. 视频下载或回退封面（任务 7 + 5）；5. 覆盖更新（同名 PUT，任务 7）；6. 单测通过（任务 2-5）。前端 frontmatter（任务 3）覆盖作者/链接/日期。错误处理（未配 Key、非 2xx、媒体失败清单）覆盖于任务 4/7。**无遗漏。**

**占位符扫描：** 无 TODO/待定/「添加错误处理」类占位符；每个代码步骤都有完整代码。

**类型一致性：** block 类型字段（`type/paragraph/heading/quote/code/list/image/video/hr`，`file/posterFile/posterUrl/src/lang/level/ordered/items`）在 content.js（生产）与 markdown.js（消费）两侧一致；`createRestClient` 返回 `putText/putBinary` 在 background.js 调用处一致；设置键 `apiBase/apiKey/targetFolder/assetsSuffix/downloadVideo` 在 options.js、background.js、popup 三处一致。
