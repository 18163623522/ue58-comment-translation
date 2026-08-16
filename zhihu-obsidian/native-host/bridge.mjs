// 本机桥接程序（Chrome Native Messaging host）。
// 从 stdin 读 4 字节小端长度 + JSON 消息，执行任务，结果以同样格式写回 stdout。
//
// 协议（Chrome Native Messaging 标准）：
//   - 每条消息 = 4 字节无符号小端整数（消息字节长度） + UTF-8 JSON
//   - host 从 stdin 读、往 stdout 写；stdout 绝不能混入其它输出。
//
// 任务「convert」：用 ffmpeg 把 m3u8 转封装成 mp4，读字节后 PUT 到 Local REST API。
// 视频字节不经过 Chrome 扩展（native messaging 单条消息有 1MB 限制），由 host 直传。

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

const execFileAsync = promisify(execFile);

function readMessage() {
  return new Promise((resolve, reject) => {
    const onData = (chunk) => {
      process.stdin.removeListener("data", onData);
      process.stdin.pause();
      try {
        const buf = Buffer.from(chunk);
        const len = buf.readUInt32LE(0);
        const json = buf.slice(4, 4 + len).toString("utf8");
        resolve(JSON.parse(json));
      } catch (e) {
        reject(e);
      }
    };
    process.stdin.on("data", onData);
    process.stdin.resume();
  });
}

function sendMessage(obj) {
  const json = Buffer.from(JSON.stringify(obj), "utf8");
  const header = Buffer.alloc(4);
  header.writeUInt32LE(json.length, 0);
  process.stdout.write(Buffer.concat([header, json]));
}

function buildArgs(msg) {
  const args = ["-y"];
  if (msg.referer) {
    args.push("-headers", `Referer: ${msg.referer}`);
  }
  args.push("-i", msg.m3u8Url, "-c", "copy", "-bsf:a", "aac_adtstoasc", msg.outputPath);
  return args;
}

// vault 相对路径逐段 URL 编码（与扩展 lib/rest.js 的 encodePath 一致）。
function encodePath(vaultPath) {
  return vaultPath.split("/").map((seg) => encodeURIComponent(seg)).join("/");
}

async function uploadToVault(apiBase, apiKey, vaultPath, buffer) {
  const base = String(apiBase).replace(/\/+$/, "");
  const res = await fetch(`${base}/vault/${encodePath(vaultPath)}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "video/mp4",
    },
    body: buffer,
  });
  if (!res.ok) {
    throw new Error(`REST API 上传失败 (HTTP ${res.status})`);
  }
}

async function convert(msg) {
  const tmpFile = join(tmpdir(), `zhihu-video-${randomBytes(6).toString("hex")}.mp4`);
  try {
    // 1. ffmpeg 转封装到临时文件
    await execFileAsync("ffmpeg", buildArgs({ ...msg, outputPath: tmpFile }), {
      windowsHide: true,
    });
    // 2. 读字节
    const buffer = await readFile(tmpFile);
    // 3. 上传到 Obsidian vault
    await uploadToVault(msg.apiBase, msg.apiKey, msg.vaultPath, buffer);
    return { ok: true, vaultPath: msg.vaultPath };
  } catch (e) {
    const tail = String(e.stderr || e.message || "").slice(-800);
    return { ok: false, error: tail };
  } finally {
    unlink(tmpFile).catch(() => {});
  }
}

async function handle(msg) {
  if (msg.type === "ping") {
    return { ok: true, type: "pong" };
  }
  if (msg.type !== "convert") {
    return { ok: false, error: `未知消息类型：${msg.type}` };
  }
  return convert(msg);
}

async function main() {
  process.stdin.setEncoding("binary");
  while (true) {
    let msg;
    try {
      msg = await readMessage();
    } catch {
      // stdin 关闭（Chrome 结束连接）或读取失败 → 退出。
      break;
    }
    const result = await handle(msg);
    sendMessage(result);
  }
}

main();
