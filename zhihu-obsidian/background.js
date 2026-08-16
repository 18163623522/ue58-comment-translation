// service worker：接收 SAVE_ARTICLE，下载媒体、写附件、写 .md。
// 视频分两路：mp4 直链直接下载；m3u8 流媒体通过 native messaging 桥交给本机 ffmpeg 转 mp4。
import { sanitizeFilename } from "./lib/parser.js";
import { buildMarkdown } from "./lib/markdown.js";
import { createRestClient } from "./lib/rest.js";
import { downloadMedia, extFromContentType } from "./lib/downloader.js";
import { selectBestVideoUrl } from "./lib/video.js";
import { buildNativeHostMessage } from "./lib/ffmpeg.js";

const DEFAULTS = {
  apiBase: "http://127.0.0.1:27123",
  apiKey: "",
  targetFolder: "知乎",
  assetsSuffix: ".assets",
  downloadVideo: true,
};

const NATIVE_HOST_NAME = "com.zhihu_obsidian.ffmpeg";

// 嗅探到的 m3u8 地址，按 tabId 缓存（tabId -> 最新 m3u8 URL）。
const m3u8Cache = new Map();

async function getSettings() {
  const stored = await chrome.storage.sync.get(DEFAULTS);
  return { ...DEFAULTS, ...stored };
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

// 下载一个媒体并落盘；返回落盘后的文件名，失败抛出（由调用方捕获）。
async function downloadAndPut(client, assetsDir, url, fileBaseName, referer) {
  const { buffer, contentType } = await downloadMedia(url, { referer });
  const ext = extFromContentType(contentType);
  const fileName = `${fileBaseName}.${ext}`;
  await client.putBinary(`${assetsDir}/${fileName}`, buffer, contentType);
  return fileName;
}

// 通过 native messaging 调本机 ffmpeg：转 m3u8 → 上传到 vault，返回落盘文件名。
function convertViaNativeHost(msg) {
  return new Promise((resolve) => {
    let settled = false;
    let port;
    try {
      port = chrome.runtime.connectNative(NATIVE_HOST_NAME);
    } catch (e) {
      resolve({ ok: false, error: `无法连接本机桥接程序：${e.message}` });
      return;
    }
    port.onMessage.addListener((resp) => {
      if (!settled) {
        settled = true;
        resolve(resp);
        port.disconnect();
      }
    });
    port.onDisconnect.addListener(() => {
      if (!settled) {
        settled = true;
        const err = chrome.runtime.lastError;
        resolve({
          ok: false,
          error: `本机桥接程序未安装或已断开：${err ? err.message : "未知错误"}`,
        });
      }
    });
    port.postMessage(msg);
  });
}

async function handleSave(article, tabId) {
  const settings = await getSettings();
  if (!settings.apiKey) {
    return { ok: false, error: "未配置 API Key，请在扩展选项里填写 Local REST API 的 API Key。" };
  }

  const client = createRestClient({ baseUrl: settings.apiBase, apiKey: settings.apiKey });
  const title = sanitizeFilename(article.title);
  const assetsDir = `${settings.targetFolder}/${title}${settings.assetsSuffix}`;
  const referer = "https://www.zhihu.com/";
  const failed = [];

  // 当前 tab 嗅探到的 m3u8（若有）
  const sniffedM3u8 = m3u8Cache.get(tabId) || "";

  let imgSeq = 0;
  let vidSeq = 0;
  let covSeq = 0;

  const blocks = [];
  for (const block of article.blocks) {
    if (block.type === "image") {
      imgSeq += 1;
      try {
        const file = await downloadAndPut(client, assetsDir, block.src, `image-${imgSeq}`, referer);
        blocks.push({ ...block, file });
      } catch (e) {
        failed.push({ kind: "image", url: block.src, error: String(e && e.message) });
        blocks.push({ ...block, file: null });
      }
    } else if (block.type === "video") {
      // 先尝试存封面图（若有）
      let posterFile = null;
      if (block.posterUrl) {
        covSeq += 1;
        posterFile = await downloadAndPut(
          client, assetsDir, block.posterUrl, `cover-${covSeq}`, referer
        ).catch(() => null);
      }

      if (!settings.downloadVideo) {
        blocks.push({ ...block, file: null, posterFile });
        continue;
      }

      // 路 1：候选源里有可下载的 mp4 直链 → 直接下载。
      const bestUrl = selectBestVideoUrl(block.sources || [block.src]);
      if (bestUrl) {
        vidSeq += 1;
        try {
          const file = await downloadAndPut(client, assetsDir, bestUrl, `video-${vidSeq}`, referer);
          blocks.push({ ...block, file, posterFile: null });
          continue;
        } catch (e) {
          failed.push({ kind: "video", url: bestUrl, error: String(e && e.message) });
          // 下载失败，继续尝试 m3u8 路径
        }
      }

      // 路 2：m3u8 流媒体 → 本机 ffmpeg 转 mp4。
      const m3u8Url = block.m3u8 || sniffedM3u8 || "";
      if (m3u8Url) {
        vidSeq += 1;
        const vaultPath = `${assetsDir}/video-${vidSeq}.mp4`;
        const resp = await convertViaNativeHost(
          buildNativeHostMessage({
            m3u8Url,
            referer,
            apiBase: settings.apiBase,
            apiKey: settings.apiKey,
            vaultPath,
          })
        );
        if (resp && resp.ok) {
          blocks.push({ ...block, file: `video-${vidSeq}.mp4`, posterFile: null });
        } else {
          failed.push({
            kind: "video",
            url: m3u8Url,
            error: (resp && resp.error) || "ffmpeg 转换失败",
          });
          blocks.push({ ...block, file: null, posterFile });
        }
      } else {
        blocks.push({ ...block, file: null, posterFile });
      }
    } else {
      blocks.push(block);
    }
  }

  const md = buildMarkdown({
    title: article.title,
    author: article.author,
    url: article.url,
    savedAt: today(),
    blocks,
  });

  const notePath = `${settings.targetFolder}/${title}.md`;
  await client.putText(notePath, md);

  return { ok: true, note: notePath, assetsDir, failed };
}

// 嗅探 m3u8：拦截所有网络请求，凡 URL 含 .m3u8 的按发起 tab 缓存。
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (details.tabId >= 0 && /\.m3u8(\?|$)/i.test(details.url)) {
      m3u8Cache.set(details.tabId, details.url);
    }
  },
  { urls: ["https://*/*", "http://*/*"], types: ["media", "xmlhttprequest"] }
);

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "SAVE_ARTICLE") {
    const tabId = msg.tabId != null ? msg.tabId : (sender.tab && sender.tab.id);
    handleSave(msg.article, tabId)
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: String(e && e.message) }));
    return true; // 异步响应
  }
  return false;
});
