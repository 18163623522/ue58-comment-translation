# 知乎 → Obsidian 浏览器扩展设计

- 日期：2026-08-17
- 状态：已批准
- 目标：一个 Chrome/Edge 浏览器扩展（MV3），一键把知乎「文章」抓取到 Obsidian 库，正文、图片、视频、代码块连同附件一起保存到指定文件夹。

## 1. 目标与非目标

### 目标
- 在知乎文章页一键保存文章到 Obsidian。
- 正文结构保留：标题、段落、引用、有序/无序列表、代码块、图片、视频。
- 图片下载并存入附件文件夹，正文用 Obsidian 可识别的嵌入语法引用。
- 视频尝试下载本体（mp4），失败时回退为「封面图存入附件 + 正文保留知乎链接」。
- 代码块保留，并优先识别语言标记。
- 附件与笔记按「每篇文章一个附件文件夹」组织。
- 同一文章二次保存时覆盖更新（重写 .md，附件目录按需增删）。
- 通过 Obsidian 社区插件 Local REST API 写入库。

### 非目标（本期不做）
- 不支持知乎「回答」页（仅文章 zhuanlan.zhihu.com/p/xxx）。
- 不抓取评论区、点赞数、收藏等元数据（除 frontmatter 基本信息外）。
- 不做批量抓取 / 订阅同步 / 定时任务。
- 不做 Firefox 适配（仅 Chrome/Edge，Chromium MV3）。

## 2. 关键决策（已与用户确认）

| 决策点 | 选择 |
|---|---|
| 写入方式 | Obsidian Local REST API 插件 |
| 浏览器 | Chrome / Edge（Chromium MV3） |
| 内容范围 | 仅知乎文章 |
| 视频 | 尽力下载 mp4，失败回退封面图 + 链接 |
| 附件组织 | 每篇文章一个附件文件夹 |
| 库内目录 | 统一进一个可配置文件夹 |
| 重复保存 | 覆盖更新 |

## 3. 架构

采用「content script 解析 → background 下载与写入」的双层架构。

### 3.1 组件

1. **content script**（`content.js`）
   - 匹配 `zhuanlan.zhihu.com/p/*`。
   - 解析标题、正文（段落/引用/列表/代码块/图片/视频），产出结构化 JSON。
   - 通过 `chrome.runtime.sendMessage` 发送给 background。

2. **background service worker**（`background.js`）
   - 接收解析结果。
   - 用 `host_permissions` 覆盖的 `fetch` 下载媒体（带 `Referer: https://www.zhihu.com/`，绕过 CORS 与防盗链）。
   - 调用 Local REST API 写入 `.md` 与附件。
   - 返回保存状态（成功 / 失败 / 跳过项）。

3. **popup**（`popup.html/js`）
   - 工具栏弹窗：显示当前文章标题、「保存到 Obsidian」按钮、保存进度/结果。

4. **options 页**（`options.html/js`）
   - 配置：REST API 地址（默认 `http://127.0.0.1:27123`）、API Key、目标文件夹、附件文件夹后缀（默认 `.assets`）、是否下载视频。

5. **markdown 生成器**（`markdown.js`）
   - 纯函数：解析结果 + 附件路径 → Obsidian 风格 Markdown。
   - frontmatter（标题、作者、原文链接、保存日期）。
   - 图片用 `![[文件名]]` 或相对路径嵌入；代码块带语言；视频 `![[video.mp4]]` 或回退链接。

### 3.2 数据流

```
知乎文章页
  → content script 解析
  → chrome.runtime.sendMessage(结构化 JSON)
  → background: 逐个下载媒体(带 Referer)
  → 写入附件文件到 REST API (PUT)
  → 生成 Markdown
  → 写入 .md 到 REST API (PUT)
  → 回传 popup 状态(成功/失败/跳过哪些)
```

### 3.3 为什么 content script 不直接下载/写入

content script 运行在 `zhihu.com` 页面上下文：从 `zhihu.com` 向 `127.0.0.1:27123` 发请求会撞 CORS；且 Local REST API 默认 HTTPS 自签证书，页面上下文无法忽略证书错误。因此把下载与写入移到有 `host_permissions` 的 background，content script 只做解析。

## 4. 文件布局

```
<目标文件夹>/
  <文章标题>.md
  <文章标题>.assets/
    image-1.png
    image-2.jpg
    video-1.mp4
    cover-1.jpg   # 视频回退时的封面图
```

- 附件文件名规则：`image-<序号>.<ext>`、`video-<序号>.mp4`、`cover-<序号>.<ext>`。
- 文章标题做文件名清洗（去掉 Windows/OS 非法字符，限制长度）。
- frontmatter 记录 `source: https://zhuanlan.zhihu.com/p/<id>`，二次保存靠此匹配同一篇。

## 5. 错误处理

- 单个媒体下载失败：记录到「失败清单」，不阻断整体，保存结果中提示。
- REST API 未启动 / 连接失败：明确提示「请确认 Obsidian 与 Local REST API 插件已启动」。
- API Key 错误 / 401：提示「检查 options 里的 API Key」。
- 非文章页：popup 显示「当前不是知乎文章页」并禁用保存按钮。
- 视频下载失败：回退封面图 + 正文保留链接，并在结果中标注。

## 6. 需要用户额外安装

- Obsidian 社区插件 **Local REST API**，并在其设置中取得 API Key。
- 已知坑：该插件默认启用 HTTPS 自签证书，浏览器扩展访问会报证书错误。需要在插件设置里关闭 HTTPS（改用 HTTP），或信任证书。扩展 options 默认 `http://127.0.0.1:27123`。

## 7. 测试

- markdown 生成器：纯函数单测（Node 环境，不引入重框架，使用 `node:test`）。
- content script 解析器：用固定 HTML 样本做单测（Node 环境）。
- background 下载/写入：用 mock fetch 验证 Referer 头、请求 URL、错误回退路径。
- 手动冒烟：真实知乎文章页 + 本地 Obsidian 库验证端到端。

## 8. 项目目录

```
zhihu-obsidian/
  manifest.json
  content.js
  background.js
  popup.html
  popup.js
  popup.css
  options.html
  options.js
  options.css
  markdown.js
  lib/
    parser.js      # content script 解析逻辑（可在 Node 里单测）
    downloader.js  # 媒体下载逻辑
    rest.js        # Local REST API 封装
  test/
    parser.test.js
    markdown.test.js
  README.md
```

## 9. 成功标准

1. 在 Chrome/Edge 加载扩展后，知乎文章页 popup 能识别文章标题。
2. 点击保存后，Obsidian 库目标文件夹出现 `文章标题.md` 和 `文章标题.assets/`，图片正确嵌入且能预览。
3. 含代码块的文章，代码块保留且带语言标记。
4. 含视频的文章，能下载则存 mp4，否则存封面图 + 链接。
5. 同一文章二次保存不产生重复文件（覆盖更新）。
6. 单元测试通过。
