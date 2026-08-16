// 弹窗：识别当前 tab 是否文章页，展示标题，点击保存触发 background。
const statusEl = document.getElementById("status");
const titleEl = document.getElementById("title");
const saveBtn = document.getElementById("save");
const resultEl = document.getElementById("result");

let currentArticle = null;
let currentTabId = null;

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function sendToTab(tab, message) {
  return chrome.tabs.sendMessage(tab.id, message);
}

async function init() {
  const tab = await activeTab();
  if (!tab || !tab.id) {
    statusEl.textContent = "无法获取当前标签页";
    return;
  }
  currentTabId = tab.id;
  try {
    const ping = await sendToTab(tab, { type: "PING" });
    if (!ping || !ping.isArticle) {
      statusEl.textContent = "当前不是知乎文章页";
      return;
    }
    statusEl.textContent = "已识别知乎文章";
    titleEl.textContent = ping.title;
    const resp = await sendToTab(tab, { type: "GET_ARTICLE" });
    currentArticle = resp.article;
    saveBtn.disabled = false;
  } catch (e) {
    statusEl.textContent = "请刷新知乎页面后重试";
  }
}

saveBtn.addEventListener("click", async () => {
  if (!currentArticle) return;
  saveBtn.disabled = true;
  statusEl.textContent = "保存中…";
  const resp = await chrome.runtime.sendMessage({ type: "SAVE_ARTICLE", article: currentArticle, tabId: currentTabId });
  if (resp.ok) {
    statusEl.textContent = "已保存";
    resultEl.hidden = false;
    let text = `笔记：${resp.note}\n附件目录：${resp.assetsDir}`;
    if (resp.failed && resp.failed.length) {
      text += `\n\n${resp.failed.length} 个媒体失败：\n` +
        resp.failed.map((f) => `- [${f.kind}] ${f.url}`).join("\n");
    }
    resultEl.textContent = text;
  } else {
    statusEl.textContent = "保存失败";
    resultEl.hidden = false;
    resultEl.textContent = resp.error || "未知错误";
  }
  saveBtn.disabled = false;
});

init();
