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

### 3. 配置

点扩展图标 → 右键 → 选项，填写 API 地址、API Key、目标文件夹等。

## 使用

打开任意知乎文章页（`zhuanlan.zhihu.com/p/xxx`），点扩展图标，点「保存到 Obsidian」。

## 目录结构

```
<目标文件夹>/
  文章标题.md
  文章标题.assets/
    image-1.jpg
    video-1.mp4
    cover-1.jpg   # 视频下载失败时的封面图
```

## 开发

```bash
cd zhihu-obsidian
npm test   # node --test 运行单测
```

## 已知限制

- 仅支持知乎「文章」，不支持「回答」页。
- 视频下载受知乎防盗链限制，失败时回退为封面图 + 原文链接。
- Local REST API 需关闭 HTTPS 自签证书（改用 HTTP）。
