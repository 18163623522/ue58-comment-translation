# Kimi Code — 设计规格

> 状态：Draft · 日期：2026-07-26 · 作者：与用户协作产出
>
> 上游依据：`xai-org/grok-build`（本地 `F:\Cache\AI\grok-build-analysis`，Apache-2.0），目标对标 `~/.zcode`（Electron 桌面 GUI）。

---

## 1. 目标与非目标

### 1.1 目标（What）

做一个**桌面 GUI 应用**（Windows 优先），用户双击启动后能得到"开箱即用、品牌是 Kimi"的编码助手体验：

- 窗口里有聊天界面，输入指令，Kimi 模型回答并执行编码任务
- agent 能力（读写文件、跑命令、搜索、调用工具）来自 `grok.exe` 的 headless 模式
- 模型由 Moonshot Kimi 提供（OpenAI 兼容 API）
- 自带 Kimi 品牌外壳（名字、配色、logo 占位）

### 1.2 非目标（Not in scope，YAGNI）

第一个里程碑（可行性验证）**明确不做**以下内容：

- ❌ 不重编译 grok Rust 源码
- ❌ 不做插件系统、Skills 管理 UI、MCP 配置 UI、sandbox 配置 UI
- ❌ 不做自动更新、代码签名、公开分发
- ❌ 不做多人协作、云端会话同步、计费
- ❌ 不做模型微调、RAG 知识库

这些是 zcode 用数年沉淀的功能，第一个版本不该背。

---

## 2. 关键事实依据（Evidence）

以下结论均来自本地代码或官方文档查证，不靠猜：

| 事实 | 出处 |
|---|---|
| grok-build 原生支持任意 OpenAI 兼容 provider | `crates/codegen/xai-grok-shell/src/agent/model_providers.rs:7-24`，`11-custom-models.md:74-92` |
| grok-build 有官方 headless + streaming-json 接口 | `14-headless-mode.md:209-232`，事件类型 `text`/`thought`/`end`/`error` |
| 官方文档直接给了 Python 包装成 OpenAI API 的示例 | `14-headless-mode.md:347-410` |
| 官方提供 Windows 预编译二进制（PowerShell 一行装） | README、x.ai/cli、WebSearch 结果 |
| 多轮会话用 `--resume <sessionId>` 维持 | `14-headless-mode.md:255-268` |
| 能力边界用 `--allow`/`--deny`/`--tools`/`--sandbox` 控制 | `14-headless-mode.md:33-43, 83-112` |
| `GROK_HOME` 可隔离配置目录，不污染用户 `~/.grok` | `14-headless-mode.md:447, 513` |
| grok 请求会带 xAI 专有 header（`x-grok-conv-id` 等） | `crates/codegen/xai-grok-sampling-types/src/types.rs:1075-1084` —— **P0 风险点** |
| zcode 是 Electron 桌面 GUI（Chromium 渲染、托盘、自动更新） | `~/.zcode/v2/setting.json`：`closeToTrayOnWindows`、`desktopChromiumHardwareAccelerationEnabled`、`autoDownloadAndInstallUpdates` |
| zcode 后端绑定智谱 GLM（`open.bigmodel.cn`），用 `${Z_AI_API_KEY}` | `~/.zcode/cli/config.json` |

---

## 3. 架构

```
┌────────────────────────────────────────────────────────┐
│  Kimi Code（Electron 桌面应用）                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Renderer（React + TypeScript）                   │  │
│  │   聊天界面 / 会话列表 / 设置面板 / 托盘菜单         │  │
│  │   渲染 streaming-json 事件流                       │  │
│  └─────────────────┬────────────────────────────────┘  │
│                    │ IPC（contextBridge, preload）       │
│  ┌─────────────────▼────────────────────────────────┐  │
│  │  Main（Node.js）                                   │  │
│  │   - spawn grok.exe 子进程                          │  │
│  │   - 解析 NDJSON 流 → 转成前端事件                   │  │
│  │   - 管理 GROK_HOME=~/.kimi-code 隔离目录           │  │
│  │   - 写入 config.toml（Kimi provider）              │  │
│  │   - 用 keytar/keyring 安全存 Kimi API key          │  │
│  └─────────────────┬────────────────────────────────┘  │
└────────────────────┼───────────────────────────────────┘
                     │ stdin/stdout (NDJSON)
           ┌─────────▼────────────┐
           │  grok.exe（官方预编译）│  ← 不编译、不分发源码
           │  headless 模式         │     仅作为子进程被调用
           └─────────┬────────────┘
                     │ HTTPS（OpenAI 兼容协议）
           ┌─────────▼──────────────────────┐
           │  Moonshot Kimi API              │
           │  https://api.moonshot.cn/v1     │
           └────────────────────────────────┘
```

### 3.1 数据流（单轮对话）

1. 用户在 Renderer 输入消息，点发送
2. Renderer 通过 IPC 把 `{sessionId?, prompt, cwd}` 发给 Main
3. Main 构造命令：`grok.exe -p <prompt> --output-format streaming-json --yolo --cwd <cwd> [--resume <sessionId>]`
4. Main spawn 子进程，环境变量注入 `GROK_HOME=~/.kimi-code`、`MOONSHOT_API_KEY=<kimi key>`
   - **变量选择**：grok 凭证解析顺序为 `model.api_key` → `model.env_key` 指向的变量 → `XAI_API_KEY`。我们在 config 里设 `env_key = "MOONSHOT_API_KEY"` 并注入此变量，走第 2 条优先级。不依赖 `XAI_API_KEY` fallback，避免与用户已有 grok 环境混淆。
5. Main 逐行读 stdout，解析 JSON，按 `type` 转成 IPC 事件推给 Renderer
6. Renderer 增量渲染：`text` → 追加气泡，`thought` → 折叠区，`end` → 结束 + 存 sessionId，`error` → 红色提示
7. 进程退出后 Main 通知 Renderer 会话结束

### 3.2 模块边界

| 模块 | 职责 | 接口 | 依赖 |
|---|---|---|---|
| `main/spawn.ts` | 启动/管理 grok 子进程 | `runGrok(opts): AsyncIterable<GrokEvent>` | grok.exe |
| `main/config.ts` | 读写 `~/.kimi-code/config.toml` | `ensureConfig(model, apiKey)` | `@iarna/toml` |
| `main/secrets.ts` | Kimi API key 安全存储 | `getApiKey()/setApiKey()` | OS keychain |
| `main/grok-resolver.ts` | 定位 grok.exe 路径（PATH / 内置 / 引导安装） | `resolveGrokPath()` | fs |
| `renderer/Chat.tsx` | 聊天界面 | 订阅 IPC 事件 | React |
| `renderer/SessionList.tsx` | 会话列表 | localStorage + IPC | React |
| `renderer/Settings.tsx` | 设置面板（API key、模型、cwd） | 表单 → Main | React |
| `preload.ts` | contextBridge 暴露安全 API | `window.kimi.*` | Electron |

每个模块可独立测试（Main 的解析器可单测，Renderer 可 storybook 隔离）。

---

## 4. 模型配置

`~/.kimi-code/config.toml`：

```toml
[models]
default = "kimi-k2"

[model.kimi-k2]
model = "kimi-k2-0905-preview"           # Moonshot 实际模型 ID（验证时确认）
base_url = "https://api.moonshot.cn/v1"
name = "Kimi K2"
api_backend = "chat_completions"          # Kimi 用标准 OpenAI Chat Completions
env_key = "MOONSHOT_API_KEY"              # grok 从此变量读 key
context_window = 131072                   # Kimi K2 上下文，验证时确认
temperature = 0.6
max_completion_tokens = 8192

[cli]
auto_update = false                       # 关闭自动更新检查
```

**凭证解析顺序**（grok 行为，来自 `11-custom-models.md:96-101`）：
1. model 的 `api_key` 字段 → 2. `env_key` 指向的环境变量 → 3. 登录 session → 4. `XAI_API_KEY`

我们走第 2 条：Main 进程 spawn 时把 Kimi key 注入 `MOONSHOT_API_KEY` 环境变量。

---

## 5. 风险与对策

### P0：grok.exe 能否正常调通 Kimi

**风险**：grok 请求可能强制发送 xAI 专有 header（`x-grok-conv-id` 等，见 `types.rs:1075-1084`），Moonshot 服务端若严格校验可能拒绝；或 grok 的 system prompt 带 "You are Grok" 品牌色，污染 Kimi 回答。

**对策**：第一里程碑（可行性验证）**只验证这一件事**。如果失败：
- 备选 A：尝试 `--system-prompt-override` / `--rules` 覆盖品牌
- 备选 B：换 agent 内核（Claude Code CLI、或直接用 Anthropic/OpenAI SDK 自研薄 agent 层）—— 这会让项目规模翻倍，但仍是可行路径

### P1：Windows 上 grok.exe 子进程稳定性

**风险**：Windows 下 spawn 大型 Rust 二进制、流式读 stdout，可能遇到编码（UTF-16 vs UTF-8）、缓冲、Ctrl+C 处理问题。

**对策**：用 `child_process.spawn` + 强制 `encoding: 'utf-8'`；逐行读取（`readline`）；超时保护。

### P2：xAI 品牌残留

**风险**：grok 在 system prompt、错误消息、UI 文案里大量出现 "Grok"/"xAI" 字样，污染 Kimi Code 的品牌纯净度。

**对策**：MVP 阶段只要聊天回答里不出现 "Grok" 就算可接受；品牌纯净度作为后续迭代项。

---

## 6. 里程碑划分

| 里程碑 | 目标 | 验收标准 | 预估 |
|---|---|---|---|
| **M1 可行性验证** | 证明 grok.exe 能调通 Kimi | 命令行 `grok -p "hi" -m kimi-k2` 能收到 Kimi 的非空回答 | 3 天 |
| **M2 最薄 Electron MVP** | 双击应用能聊天 | Electron 窗口 + 一个聊天框 + 流式输出 + Kimi 配置 + API key 输入 | 1-2 周 |
| **M3 能用的产品** | 多会话、设置面板、托盘 | 会话列表、设置 UI、托盘菜单、模型切换 | 1-2 月 |
| **M4 接近 zcode** | 插件/MCP/sandbox/skills | 上述 zcode 主要功能 | 3 月+ |

**当前阶段：M1。** M1 通过才进入 M2。

---

## 7. M1 验收脚本（可重复执行）

```powershell
# 1. 装官方 grok（PowerShell）
irm https://x.ai/cli/install.ps1 | iex
grok --version

# 2. 写 Kimi provider 配置
# 写入 $env:USERPROFILE\.kimi-code\config.toml（见第 4 节）
$env:GROK_HOME = "$env:USERPROFILE\.kimi-code"
$env:MOONSHOT_API_KEY = "<用户填>"

# 3. 跑一发
grok -p "你好，请用中文回复，并告诉我你是什么模型" `
  -m kimi-k2 `
  --output-format streaming-json `
  --yolo

# 验收：
# - 收到 {"type":"text","data":"..."} 事件流
# - 文本里出现中文回复，且不含 "Grok"/"xAI" 字样
# - 进程 exit code = 0
```

**"失败"的判定标准**（任一命中即判 M1 失败，需执行 P0 备选评估）：
- 进程 exit code ≠ 0 且错误信息指向协议/认证/header 不兼容
- stdout 收到 `{"type":"error",...}` 且 error.message 提示 Kimi 端拒绝
- `end` 事件有 `usage` 但 `text` 为空或仅含错误回显
- 收到的回答明显是 grok 自己的兜底（如 "I'm Grok"），而非 Kimi 的真实回复

仅"回答里偶现 'Grok' 字样"**不算** M1 失败（归为 P2 品牌残留，后续处理）。

通过 → 进入 M2；失败 → 执行 P0 备选方案评估。

---

## 8. 技术栈锁定（M2 及以后）

- **Runtime**：Electron 30+（LTS），Node 20 LTS
- **前端**：React 18 + TypeScript 5 + Vite
- **UI**：Tailwind CSS（AI 生成稳定、迭代快）
- **构建/打包**：Electron Forge（官方推荐，Windows .exe 输出成熟）
- **状态**：Zustand（轻量，AI 写起来比 Redux 稳）
- **TOML**：`@iarna/toml`
- **密钥存储**：`keytar`（跨平台 OS keychain）
- **测试**：Vitest（Main 单测）+ Playwright（Electron E2E，已有 skill）

不引入：Next.js（不需要 SSR）、Redux（过度工程）、Material UI（包太大、定制痛苦）。

---

## 9. 目录结构（M2 起建立）

```
kimi-code/
├── package.json
├── forge.config.ts            # Electron Forge 配置
├── tsconfig.json
├── src/
│   ├── main/                  # Electron 主进程
│   │   ├── index.ts           # 入口
│   │   ├── spawn.ts           # grok 子进程管理
│   │   ├── config.ts          # config.toml 读写
│   │   ├── secrets.ts         # API key 安全存储
│   │   └── grok-resolver.ts   # 定位 grok.exe
│   ├── preload/
│   │   └── index.ts           # contextBridge
│   ├── renderer/              # React UI
│   │   ├── index.html
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── Chat.tsx
│   │   │   ├── SessionList.tsx
│   │   │   └── Settings.tsx
│   │   └── stores/
│   │       └── session.ts     # Zustand
│   └── shared/
│       └── types.ts           # IPC 事件类型（Main/Renderer 共享）
└── docs/
    └── specs/
```

---

## 10. 开放问题（M2 前需解决）

1. grok.exe 是否允许被打包/再分发？需查 LICENSE（Apache-2.0 通常允许，但要确认 NOTICE 要求）—— **M2 启动前确认**
2. Moonshot Kimi K2 的确切模型 ID、context window、定价 —— M1 验证时填实
3. 是否需要做"grok 未安装"的引导安装流程 —— M2 决策
4. Kimi key 怎么获取（用户自己去 platform.moonshot.cn 申请？要不要做引导？）—— M2 决策

---

## 附录 A：与 zcode 的对照（非目标，仅参考）

| 维度 | zcode | Kimi Code（本设计） |
|---|---|---|
| 形态 | Electron GUI | Electron GUI（同） |
| Agent 内核 | 自研嵌入式 CLI | spawn 官方 grok.exe |
| 模型 | 智谱 GLM | Moonshot Kimi |
| 品牌 | zcode | Kimi |
| 插件系统 | 有 | M1-M3 不做 |
| 自动更新 | 有 | M3 前不做 |
