// ffmpeg 命令构造与 Native Messaging 消息构造的纯函数。便于 Node 单测。

// 构造 ffmpeg 转封装命令：把 m3u8（HLS）无损转成 mp4。
// -c copy 是「转封装」不重编码，速度快且画质无损；-bsf:a aac_adtstoasc 修复 AAC 音轨（HLS→mp4 必需）。
export function buildFfmpegArgs({ m3u8Url, outputPath, referer }) {
  const args = ["-y"];
  if (referer) {
    args.push("-headers", `Referer: ${referer}`);
  }
  args.push("-i", m3u8Url, "-c", "copy", "-bsf:a", "aac_adtstoasc", outputPath);
  return args;
}

// 构造发送给本机桥接程序的消息体。
// 桥接程序负责：ffmpeg 转码 → 读字节 → 上传到 Local REST API 的 vaultPath（相对路径）。
export function buildNativeHostMessage({ m3u8Url, referer, apiBase, apiKey, vaultPath }) {
  return { type: "convert", m3u8Url, referer, apiBase, apiKey, vaultPath };
}
