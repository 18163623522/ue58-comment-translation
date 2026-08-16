// 本机桥接程序（Chrome Native Messaging host）。
// 从 stdin 读 4 字节小端长度 + JSON 消息，调用 ffmpeg 把 m3u8 转封装成 mp4，
// 结果以同样格式写回 stdout。
//
// 协议（Chrome Native Messaging 标准）：
//   - 每条消息 = 4 字节无符号小端整数（消息字节长度） + UTF-8 JSON
//   - host 从 stdin 读、往 stdout 写；stdout 绝不能混入其它输出。

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function readMessage() {
  return new Promise((resolve, reject) => {
    const onData = (chunk) => {
      process.stdin.removeListener("data", onData);
      process.stdin.pause();
      try {
        const buf = Buffer.from(chunk);
        // 前 4 字节是小端 uint32 长度
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

async function handle(msg) {
  if (msg.type === "ping") {
    return { ok: true, type: "pong" };
  }
  if (msg.type !== "convert") {
    return { ok: false, error: `未知消息类型：${msg.type}` };
  }
  try {
    await execFileAsync("ffmpeg", buildArgs(msg), { windowsHide: true });
    return { ok: true, outputPath: msg.outputPath };
  } catch (e) {
    // ffmpeg 失败时 stderr 含有用信息，截取末尾返回给扩展定位问题。
    const tail = String(e.stderr || e.message || "").slice(-800);
    return { ok: false, error: tail };
  }
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
