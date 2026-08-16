// service worker：接收 SAVE_ARTICLE，下载媒体、写附件、写 .md。
import { sanitizeFilename } from "./lib/parser.js";
import { buildMarkdown } from "./lib/markdown.js";
import { createRestClient } from "./lib/rest.js";
import { downloadMedia, extFromContentType } from "./lib/downloader.js";

const DEFAULTS = {
  apiBase: "http://127.0.0.1:27123",
  apiKey: "",
  targetFolder: "知乎",
  assetsSuffix: ".assets",
  downloadVideo: true,
};

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

async function handleSave(article) {
  const settings = await getSettings();
  if (!settings.apiKey) {
    return { ok: false, error: "未配置 API Key，请在扩展选项里填写 Local REST API 的 API Key。" };
  }

  const client = createRestClient({ baseUrl: settings.apiBase, apiKey: settings.apiKey });
  const title = sanitizeFilename(article.title);
  const assetsDir = `${settings.targetFolder}/${title}${settings.assetsSuffix}`;
  const referer = "https://www.zhihu.com/";
  const failed = [];

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

      if (settings.downloadVideo && block.src) {
        vidSeq += 1;
        try {
          const file = await downloadAndPut(client, assetsDir, block.src, `video-${vidSeq}`, referer);
          blocks.push({ ...block, file, posterFile: null });
        } catch (e) {
          failed.push({ kind: "video", url: block.src, error: String(e && e.message) });
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

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "SAVE_ARTICLE") {
    handleSave(msg.article)
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: String(e && e.message) }));
    return true; // 异步响应
  }
  return false;
});
