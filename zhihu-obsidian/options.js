// 设置页：读写 chrome.storage.sync。
const DEFAULTS = {
  apiBase: "http://127.0.0.1:27123",
  apiKey: "",
  targetFolder: "知乎",
  assetsSuffix: ".assets",
  downloadVideo: true,
};

const form = document.getElementById("form");
const saved = document.getElementById("saved");

async function load() {
  const s = await chrome.storage.sync.get(DEFAULTS);
  form.apiBase.value = s.apiBase;
  form.apiKey.value = s.apiKey;
  form.targetFolder.value = s.targetFolder;
  form.assetsSuffix.value = s.assetsSuffix;
  form.downloadVideo.checked = s.downloadVideo;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  await chrome.storage.sync.set({
    apiBase: form.apiBase.value.trim(),
    apiKey: form.apiKey.value.trim(),
    targetFolder: form.targetFolder.value.trim() || "知乎",
    assetsSuffix: form.assetsSuffix.value.trim() || ".assets",
    downloadVideo: form.downloadVideo.checked,
  });
  saved.hidden = false;
  setTimeout(() => (saved.hidden = true), 1500);
});

load();
