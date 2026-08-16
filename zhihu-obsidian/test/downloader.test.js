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
