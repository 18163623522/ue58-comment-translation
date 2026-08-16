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

test("image 无 file 时回退为原文链接", () => {
  const md = buildMarkdown({
    title: "t", author: "a", url: "u", savedAt: "s",
    blocks: [{ type: "image", src: "https://x.com/a.jpg", file: null }],
  });
  assert.ok(md.includes("![](https://x.com/a.jpg)"));
});
