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

test("sanitizeFilename 去除非法字符", () => {
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
