import test from "node:test";
import assert from "node:assert/strict";
import { selectBestVideoUrl, qualityScore } from "../lib/video.js";

test("qualityScore 从 URL 路径识别清晰度", () => {
  assert.equal(qualityScore("https://vdn.vzuu.com/FHD/abc.mp4"), 5);
  assert.equal(qualityScore("https://vdn.vzuu.com/HD/abc.mp4"), 4);
  assert.equal(qualityScore("https://vdn.vzuu.com/SD/abc.mp4"), 3);
  assert.equal(qualityScore("https://vdn.vzuu.com/LD/abc.mp4"), 2);
  assert.equal(qualityScore("https://x.com/abc.mp4"), 1);
});

test("selectBestVideoUrl 选最高清", () => {
  const srcs = [
    "https://vdn.vzuu.com/LD/a.mp4",
    "https://vdn.vzuu.com/HD/a.mp4",
    "https://vdn.vzuu.com/SD/a.mp4",
  ];
  assert.equal(selectBestVideoUrl(srcs), "https://vdn.vzuu.com/HD/a.mp4");
});

test("selectBestVideoUrl 过滤 blob 与 m3u8", () => {
  assert.equal(
    selectBestVideoUrl(["blob:https://x.com/1", "https://x.com/a.m3u8", "https://x.com/a.mp4"]),
    "https://x.com/a.mp4"
  );
});

test("selectBestVideoUrl 全是流媒体返回空串", () => {
  assert.equal(selectBestVideoUrl(["blob:https://x.com/1", "https://x.com/a.m3u8"]), "");
});

test("selectBestVideoUrl 空数组或 undefined 返回空串", () => {
  assert.equal(selectBestVideoUrl([]), "");
  assert.equal(selectBestVideoUrl(undefined), "");
});

test("selectBestVideoUrl 同分时 mp4 优先", () => {
  const srcs = ["https://x.com/a.webm", "https://x.com/b.mp4"];
  assert.equal(selectBestVideoUrl(srcs), "https://x.com/b.mp4");
});
