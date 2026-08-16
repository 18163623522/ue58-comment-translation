import test from "node:test";
import assert from "node:assert/strict";
import { createRestClient, encodePath } from "../lib/rest.js";

test("encodePath 逐段编码但保留分隔符", () => {
  assert.equal(
    encodePath("知乎/标题.md"),
    encodeURIComponent("知乎") + "/" + encodeURIComponent("标题.md")
  );
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
