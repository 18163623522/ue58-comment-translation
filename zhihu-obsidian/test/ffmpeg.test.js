import test from "node:test";
import assert from "node:assert/strict";
import { buildFfmpegArgs, buildNativeHostMessage } from "../lib/ffmpeg.js";

test("buildFfmpegArgs 转封装不重编码", () => {
  const args = buildFfmpegArgs({
    m3u8Url: "https://x.com/video.m3u8",
    outputPath: "C:/vault/知乎/标题.assets/video-1.mp4",
    referer: "https://www.zhihu.com/",
  });
  // -y 覆盖；-headers 带 Referer；-i 输入；-c copy 转封装；-bsf:a aac_adtstoasc 修 AAC 音轨
  assert.deepEqual(args, [
    "-y",
    "-headers",
    "Referer: https://www.zhihu.com/",
    "-i",
    "https://x.com/video.m3u8",
    "-c",
    "copy",
    "-bsf:a",
    "aac_adtstoasc",
    "C:/vault/知乎/标题.assets/video-1.mp4",
  ]);
});

test("buildFfmpegArgs 无 referer 时不加 headers", () => {
  const args = buildFfmpegArgs({
    m3u8Url: "https://x.com/a.m3u8",
    outputPath: "C:/out.mp4",
  });
  assert.ok(!args.includes("-headers"));
  assert.ok(args.includes("-c"));
  assert.ok(args.includes("copy"));
});

test("buildNativeHostMessage 生成标准消息", () => {
  const msg = buildNativeHostMessage({
    type: "convert",
    m3u8Url: "https://x.com/a.m3u8",
    outputPath: "C:/out.mp4",
    referer: "https://www.zhihu.com/",
  });
  assert.equal(msg.type, "convert");
  assert.equal(msg.m3u8Url, "https://x.com/a.m3u8");
  assert.equal(msg.outputPath, "C:/out.mp4");
  assert.equal(msg.referer, "https://www.zhihu.com/");
});
