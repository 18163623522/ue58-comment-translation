# 知乎 → Obsidian 浏览器扩展

一键把知乎「文章」保存到 Obsidian：正文、图片、视频、代码块连同附件一起入库。

## 安装

### 1. Obsidian 侧：装 Local REST API

1. 在 Obsidian 设置 → 第三方插件 → 关闭安全模式，浏览社区插件，搜索并安装 **Local REST API**。
2. 打开该插件设置，复制一个 **API Key**。
3. **重要**：插件默认启用 HTTPS 自签证书，浏览器扩展无法访问。请在插件设置里
   **关闭 HTTPS（改用 HTTP）**，或信任其证书。默认端口 `27123`。

### 2. 浏览器侧：加载扩展

1. Chrome/Edge 打开 `chrome://extensions`（Edge 为 `edge://extensions`）。
2. 开启「开发者模式」。
3. 点「加载已解压的扩展程序」，选择本目录 `zhihu-obsidian/`。
4. 记下该扩展的 **ID**（扩展卡片上那串 32 位字母）。

### 3. 配置

点扩展图标 → 右键 → 选项，填写 API 地址、API Key、目标文件夹等。

## 视频高清（可选，需装 ffmpeg）

图片和 mp4 视频扩展直接就能抓高清。但知乎部分视频是 m3u8 流媒体，要转成 mp4 需要本机装 **ffmpeg** 并注册一个桥接程序。

### 装 ffmpeg

- 方式 A（推荐）：`winget install Gyan.FFmpeg`，装完重启终端。
- 方式 B：从 <https://ffmpeg.org> 下载，把 `bin` 目录加入系统 PATH。

验证：命令行输入 `ffmpeg -version` 能输出版本号即成功。

### 注册桥接程序（一次性）

1. 确认已装 Node.js（`node -v` 有输出）。
2. 用 PowerShell 进入 `native-host` 目录，运行：

```powershell
.\install-host.ps1 -ExtensionId "你在第 2 步记下的扩展 ID"
```

3. 回到 `chrome://extensions`，点扩展的「刷新」重新加载。

### 使用前提（重要）

m3u8 地址靠「拦截视频的网络请求」嗅探，所以：

> **保存前，先在知乎页面上点一下视频，让它开始播放**，扩展才能抓到 m3u8 地址。

没点播放就保存，该视频会回退为「封面图 + 原文链接」。

## 使用

打开任意知乎文章页（`zhuanlan.zhihu.com/p/xxx`），点扩展图标，点「保存到 Obsidian」。

## 目录结构

```
<目标文件夹>/
  文章标题.md
  文章标题.assets/
    image-1.jpg
    video-1.mp4   # mp4 直链或 ffmpeg 转出的视频
    cover-1.jpg   # 视频失败时的封面图
```

## 开发

```bash
cd zhihu-obsidian
npm test   # node --test 运行单测
```

## 已知限制

- 仅支持知乎「文章」，不支持「回答」页。
- 图片存的是知乎原图（`_hd` 后缀）；视频 mp4 直链选最高清（FHD/HD/SD/LD）。
- m3u8 流媒体视频需本机装 ffmpeg + 桥接程序，且保存前要先播放视频以嗅探地址；否则回退封面图 + 链接。
- m3u8 分片若被 AES 加密或知乎改接口，ffmpeg 转换可能失败，会记录在保存结果里。
- Local REST API 需关闭 HTTPS 自签证书（改用 HTTP）。
