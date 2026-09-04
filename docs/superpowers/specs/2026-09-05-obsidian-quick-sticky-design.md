# Obsidian 桌面便签插件（Quick Sticky Notes）设计规格

- 日期：2026-09-05
- 状态：已批准（用户于头脑风暴会话中逐节确认）
- 项目目录：`F:\Cache\AI\obsidian-quick-sticky`（新建）
- 插件 id：`quick-sticky-notes`（社区市场唯一，与既有 sticky 类插件不冲突）

## 1. 目标与非目标

### 目标

为 Obsidian 桌面端做一个 Windows 便签式的悬浮快捷笔记插件：

- **桌面级独立窗口**：便签是独立 OS 窗口，可置顶于其他应用之上，Obsidian 主窗口最小化/后台时依然可用
- **随手记体验**：全局热键在任何应用下按一下即弹出新便签，光标就位直接写
- **便签即笔记**：每张便签是 vault 内一个真实 `.md` 文件，可搜索、可双链、可同步，随手记的内容有长成正式笔记的路径
- **多便签同开**：可同时开任意多张，重启 Obsidian 后位置/尺寸/置顶状态自动恢复
- **轻量管理**：侧边栏面板列出/搜索/打开全部便签

### 非目标（第一版明确不做）

- 移动端支持（依赖 Electron，物理不可能）
- 便签间吸附/边缘对齐、拖拽分组（Colorful StickyNotes 的花活，等真需要再加）
- Canvas 集成、拖拽转节点
- 便签模板系统（只用一个可配置的命名模板）
- e2e 自动化测试（先自用，上架前再补）
- 便签归档/回收站流（关闭 = 关窗口，文件本来就在 vault 里，删不删交给用户）

## 2. 技术路线（已验证）

### 2.1 核心结论

对 5 个同类社区插件做了竞品分析，精读了其中两个（`y-usuzumi/obsidian-desktop-sticky-notes`、`rephila/simple-sticky-notes`）的完整源码。本设计直接站在验证过的实现上：

| 难点 | 解法 | 来源 |
|---|---|---|
| popout ↔ 原生窗口映射 | 给 popout 文档设唯一标题，从 `BrowserWindow.getAllWindows()` 按标题找回 | 两竞品同招 |
| 置顶 | 先 `setParentWindow(null)` 解除父子，再 `setAlwaysOnTop(true, "screen-saver")` | dsn + ssn |
| 全局热键 | `@electron/remote` 的 `globalShortcut.register` + 录制 UI | dsn |
| 多便签恢复 | `onLayoutReady` 后多轮重试 + `setBounds()` 复位 + 收养已有 popout | ssn |
| 颜色/透明度 | CSS 变量 + `setOpacity()` / `setBackgroundColor()`，存 frontmatter | ssn |
| 隐藏 Obsidian chrome | CSS 类隐藏 + MutationObserver 防重渲染回弹 | ssn |

### 2.2 架构

```
┌─ Obsidian 主窗口 ──────────────────┐      ┌─ 便签窗口（独立 OS 窗口）─┐
│  插件主体                           │      │  📌 🎨 ✏ ✕  ← 原生 header │
│  ├─ 命令/热键/右键菜单/ribbon        │─────▶│  完整 Markdown 编辑器      │
│  ├─ 便签列表侧边栏面板               │ 打开  │  （live preview、双链、    │
│  └─ 设置页                          │       │   主题、其他插件全兼容）    │
│                                    │      └──────────────────────────┘
│  ElectronBridge ── @electron/remote ──▶ BrowserWindow：置顶/透明度/位置/任务栏
└────────────────────────────────────┘
```

- 每张便签 = `workspace.openPopoutLeaf({size, x, y})` 打开的独立窗口 + 内嵌完整 Markdown 编辑器
- **保留 Obsidian 原生 view header**（用户选定：最稳路线），在 view-actions 放置操作按钮，CSS 隐藏其余 chrome
- `isDesktopOnly: true`，`minAppVersion: 1.5.0`

### 2.3 已知风险与接受理由

| 风险 | 影响 | 接受理由 |
|---|---|---|
| 依赖 popout 内部 DOM 类名（titlebar、tab-header 等） | Obsidian 大版本更新可能需要修 CSS | 竞品同样承担；选择器集中在一个常量清单里，修起来是一处改动 |
| `@electron/remote` 非官方推荐 | 理论上 Obsidian 可能封禁 | 两个竞品在用；官方市场在架的 abdo-reda 版也用；先自用不受审核约束 |
| Linux 原生 Wayland 置顶无效 | Linux 用户体验降级 | 用户是 Windows；文档标注即可 |
| 窗口标题匹配法找 BrowserWindow | 标题被其他插件改写时失效 | 匹配后立即恢复原标题；窗口标题含不可见分隔符 + encodeURIComponent(path) 的稳定 key（dsn 做法） |

## 3. 数据模型

### 3.1 跟文件走：frontmatter（官方 `processFrontMatter` API）

颜色/透明度是便签的**内容属性**，写进 md 文件，换设备同步不丢：

```yaml
---
sticky-color: "#fff3a3"
sticky-opacity: 0.95
---
```

### 3.2 跟设备走：插件 data.json

窗口位置/置顶是**屏幕属性**，存插件设置：

```jsonc
{
  "folder": "StickyNotes",          // 便签默认文件夹，空 = vault 根
  "nameTemplate": "便签 YYYY-MM-DD HH-mm",  // 新便签命名模板（Moment 格式）
  "globalHotkey": "Super+F10",      // Windows 默认，设置页可录制/清除
  "defaultColor": "#fff3a3",
  "defaultOpacity": 1.0,
  "defaultSize": { "width": 360, "height": 360 },
  "restoreOnStartup": true,         // 启动时恢复上次打开的便签
  "windows": [                      // 上次会话的窗口状态
    { "file": "StickyNotes/便签 2026-09-05 14-30.md",
      "bounds": { "x": 100, "y": 100, "width": 360, "height": 360 },
      "pinned": true }
  ]
}
```

### 3.3 边界行为

- 便签文件被删 → `vault.on("delete")`：关闭对应窗口（若开）、清理 `windows` 记录、更新列表面板
- 便签文件被改名/移动 → `vault.on("rename")`：同步注册表与 `windows` 记录的 file 路径
- 文件被移出便签文件夹 → 仍出现在列表面板（面板列的是"开启过的便签 + 文件夹内的文件"并集）；frontmatter 无 sticky 字段的普通文件不改写
- 恢复时位置在已不存在的显示器上 → 用 `screen.getAllDisplays()` 校验，clamp 到主显示器 workArea（dsn 的 `positionIsVisible` 模式）

## 4. 第一版功能

### 4.1 创建便签（四种入口）

1. ribbon 图标（左侧栏）
2. 命令面板：「新建便签」「当前文件作为便签打开」「隐藏当前文件的便签」「打开便签列表面板」
3. 文件管理器/编辑器右键菜单：「作为便签打开」
4. **全局热键**（任何应用下生效）

### 4.2 全局热键行为（定义死，避免歧义）

按下热键 → **新建一张便签**并聚焦光标：

- 若 Obsidian 完全退出 → 热键无效（无进程可响应，物理限制，Tray 插件靠常驻托盘解决，第一版不做）
- 同一分钟内重复按热键 → 命名模板冲突，文件名追加序号避让（见 §7.1 命名生成）
- 「作为便签打开」/ 列表面板点击等**通用打开路径**若目标文件已在某便签窗口打开 → 置前该窗口而非重复开（去重收养，见 §4.3）
- 设置页提供录制 UI（keydown 捕获 → accelerator 格式）+ 清除按钮；热键为空 = 禁用
- Obsidian 渲染进程重载后重新注册（防旧回调残留，dsn 的 `isRegistered` 检查模式）

### 4.3 多便签 + 状态记忆

- 便签窗口关闭（用户点 X）→ 从 `windows` 记录移除，文件保留
- Obsidian 退出/卸载 → 保存全部在开便签的 {file, bounds, pinned} 到 settings
- 启动 → `onLayoutReady` 后按 300ms / 2s / 5s 三轮 + `layout-change` 750ms 防抖重试恢复（Obsidian 自身恢复 popout 有时序竞争，收养已有 popout 而不是重开，ssn 模式）
- 每张便签打开时设稳定窗口标题 key：`便签 — {文件名}\u2063{encodeURIComponent(path)}`，用于窗口找回与去重

### 4.4 便签窗口操作（原生 header 的 view-actions）

| 按钮 | 行为 |
|---|---|
| 📌 pin | 切换置顶：先 `setParentWindow(null)` 再 `setAlwaysOnTop(切换值, "screen-saver")`；图标 pin/pin-off 反映状态 |
| 🎨 取色 | 下拉色板：6 个预设（黄/粉/薄荷绿/蓝/薰衣草/橙）+ 系统取色器；写入 frontmatter `sticky-color` 并应用到窗口背景 CSS 变量 + `setBackgroundColor`（拖拽/缩放时原生底色一致） |
| 👁 透明度 | 弹出滑杆 0.3–1.0，实时预览，写入 frontmatter `sticky-opacity` |
| ✏ 模式 | 编辑 ⇄ 阅读视图切换 |
| ✕ 关闭 | 关闭该便签窗口（detach leaf + close/destroy 原生窗口，文件保留） |

隐藏的 chrome（CSS）：标签栏、view-header 面包屑/导航、sidebar 切换按钮、状态栏、frontmatter 属性区、内联标题、编辑工具栏冲突元素（与用户已装的 editing-toolbar 的冲突在实测中调整 selector 清单）。

### 4.5 便签列表面板（ItemView，官方 API）

- dock 到左侧或右侧边栏（命令「打开便签列表面板」，用户手动放）
- 列表项：颜色圆点（便签色）、标题、首行内容预览（`metadataCache` 取）、开启中标记
- 顶部：搜索框（按标题/内容过滤）+ 新建按钮
- 点击项 → 打开/置前对应便签
- 数据源：便签文件夹内全部 `.md` ∪ `windows` 记录中的文件，按修改时间倒序

## 5. 代码结构

```
obsidian-quick-sticky/
  manifest.json          id: quick-sticky-notes, isDesktopOnly: true
  package.json           devDeps: obsidian, @electron/remote, esbuild, typescript, vitest
  esbuild.config.mjs     官方模板
  styles.css             chrome 隐藏 + 便签样式
  src/
    main.ts              入口：命令/ribbon/右键菜单/事件注册/生命周期（unload 时清理全部窗口与热键）
    settings.ts          设置模型 + 迁移 + 设置页（含热键录制控件）
    ElectronBridge.ts    @electron/remote 唯一封装点：
                         findByTitle/getAlwaysOnTop/setAlwaysOnTop/setParentWindow/
                         setOpacity/setBounds/getPosition/setBackgroundColor/
                         screen.getAllDisplays/globalShortcut；Electron 不可用时降级返回 null
    StickyWindow.ts      单张便签：打开 popout、标题标记、找原生窗口、注入 chrome 按钮、
                         应用颜色/透明度、MutationObserver 防回弹、销毁
    WindowManager.ts     多便签注册表（path → windows）、去重收养、保存/恢复编排
    NoteFileService.ts   文件创建（命名模板/文件夹确保存在）、frontmatter 读写、
                         vault rename/delete 同步
    StickyListView.ts    侧边栏列表面板
  tests/                 vitest：settings 合并、位置校验/clamp、命名生成、恢复序列、
                         frontmatter 解析（DOM/Electron 全部 mock）
```

模块职责边界：`ElectronBridge` 是唯一碰 Electron 的地方（降级逻辑集中）；`WindowManager` 只管编排不碰 DOM；`StickyWindow` 只管单窗口生命周期；文件系统操作全部收在 `NoteFileService`。

## 6. 错误处理

| 场景 | 行为 |
|---|---|
| Electron 不可用 / 找不到 BrowserWindow | 便签照常打开（普通 popout，无置顶/透明度），Notice 提示一次 |
| 热键注册失败（被其他程序占用） | 设置页显示错误状态，Notice 提示，不阻塞其他功能 |
| 恢复时文件已删 | 跳过 + 清理 `windows` 记录 |
| popout 加载未就绪就初始化 | 轮询等待（`.app-container .workspace-leaf` 出现 + view containerEl connected，上限 80×50ms，ssn 模式） |
| unload 时 | 注销热键、保存位置、detach 全部便签 leaf、关闭原生窗口 |

## 7. 测试与验收

### 7.1 vitest 单测（纯逻辑，DOM/Electron mock）

- settings 读写与默认值合并、热键平台归一化
- `positionIsVisible` / clamp 到 workArea
- 命名模板 → 文件名（含冲突避让）
- 恢复序列：给定 `windows` 记录与模拟 workspace 状态，断言开窗/收养/跳过决策
- frontmatter ↔ 窗口状态的读写映射

### 7.2 手动验收清单

1. Obsidian 最小化到任务栏，其他应用全屏 → 按热键 → 新便签弹出且可输入
2. 便签置顶后，其他最大化应用不再遮挡它
3. 开 3 张便签（不同颜色/透明度/位置）→ 重启 Obsidian → 全部按原样恢复
4. 双显示器场景：便签在副屏 → 拔副屏 → 重启 → 便签 clamp 回主屏
5. 便签内写双链、切阅读视图、换主题（Baseline）→ 渲染正常
6. 与 editing-toolbar、obsidian-hider 共存 → 无 UI 破损（selector 冲突实测修正）
7. 便签文件在文件管理器中被改名/删除 → 窗口与列表面板正确响应

## 8. 参考（竞品源码，本地缓存 `%TEMP%/sticky-research/`）

- `dsn/` = y-usuzumi/obsidian-desktop-sticky-notes（窗口找回、热键、pin 所有权、位置记忆）
- `ssn/` = rephila/simple-sticky-notes（chrome 隐藏、恢复编排、透明度、frontmatter、测试组织）
