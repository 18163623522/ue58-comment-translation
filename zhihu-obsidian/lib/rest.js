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
