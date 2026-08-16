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

test("toHdImageUrl 支持 webp/gif/png", () => {
  assert.equal(
    toHdImageUrl("https://pic1.zhimg.com/v2-abc_r.webp"),
    "https://pic1.zhimg.com/v2-abc_hd.webp"
  );
  assert.equal(
    toHdImageUrl("https://pic1.zhimg.com/v2-abc_b.gif"),
    "https://pic1.zhimg.com/v2-abc_hd.gif"
  );
  assert.equal(
    toHdImageUrl("https://pic1.zhimg.com/v2-abc_m.png"),
    "https://pic1.zhimg.com/v2-abc_hd.png"
  );
});

test("toHdImageUrl 支持 _720w/_xl 等现代尺寸后缀", () => {
  assert.equal(
    toHdImageUrl("https://picx.zhimg.com/v2-abc_720w.jpg"),
    "https://picx.zhimg.com/v2-abc_hd.jpg"
  );
  assert.equal(
    toHdImageUrl("https://picx.zhimg.com/v2-abc_xl.jpg"),
    "https://picx.zhimg.com/v2-abc_hd.jpg"
  );
});

test("toHdImageUrl 无尺寸后缀的地址原样返回", () => {
  assert.equal(
    toHdImageUrl("https://picx.zhimg.com/v2-abc.jpg"),
    "https://picx.zhimg.com/v2-abc.jpg"
  );
});

test("toHdImageUrl 已带 _hd 保持幂等", () => {
  assert.equal(
    toHdImageUrl("https://pic1.zhimg.com/v2-abc_hd.jpg"),
    "https://pic1.zhimg.com/v2-abc_hd.jpg"
  );
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
