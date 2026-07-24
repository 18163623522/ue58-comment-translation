# Prompt Engineering Skill 设计

**日期**：2026-07-25
**来源**：提炼自 `xai-org/grok-build` 的 prompt 模板系统（Apache-2.0，本地副本 `F:/Cache/AI/grok-build-analysis`）
**状态**：设计已确认，待写实现计划

---

## 一、背景与目标

### 背景

`xai-org/grok-build` 是 xAI 开源的终端 AI 编程 Agent（Rust，70+ crates）。其 prompt 工程水平极高，体现在三套精心设计的模板：

- `crates/codegen/xai-grok-agent/templates/prompt.md` —— 主 agent（交互式 / 非交互式分支）
- `crates/codegen/xai-grok-agent/templates/subagent_prompt.md` —— subagent 专用
- `crates/codegen/xai-grok-agent/templates/apply_patch_prompt.md` —— 补丁应用模式

三套模板的共性亮点：

1. **分区设计** —— 用 XML 标签组织（`<action_safety>` / `<tool_calling>` / `<output_efficiency>` / `<formatting>`），而非线性堆砌
2. **模板变量** —— `${{ tools.by_kind.read }}` 等变量让 prompt 自适应可用工具集
3. **Action Safety 分级** —— 按"可逆性 + 影响范围"给动作分级，"一次同意不是空白授权"
4. **Plan-first 工作流** —— 三个工具协同（`enter_plan_mode` / `todo` / `update_goal`）
5. **subagent 聚焦原则** —— "不扩范围、直接高效、报告结果"

### 目标

把 grok 的 prompt 工程思想迁移到 ZCode，**增强 ZCode 写 prompt / 写 skill / 写 AGENTS.md 时的质量**，并提供工业级参照模板。

### 非目标

- ❌ 替换 ZCode 主 system prompt（闭源 CLI 内置，不可改）
- ❌ 移植 grok 代码（Rust，与 ZCode 的 TS 生态不兼容）
- ❌ 做 memory / compaction / workflow（后续优先级）
- ❌ 翻译 grok 的模板变量语法 `${{...}}`（用自然语言条件描述替代）

---

## 二、需求确认

| 维度 | 决定 |
|---|---|
| 交付形态 | **skill + AGENTS.md 组合**（方案 A） |
| 覆盖范围 | Action Safety + Tool Calling + Output/Formatting + Plan/Progress（全四块） |
| subagent | 要，加专用 prompt 模板 |
| skill 触发 | 智能识别 + 显式调用结合 |

---

## 三、整体架构

```
F:/Cache/AI/
├── AGENTS.md                                      # 追加 "Prompt & Behavior Standards" 一节
└── .agents/skills/
    └── prompt-engineering/                        # 新 skill
        ├── SKILL.md                               # 主入口（触发条件 + 使用流程）
        └── templates/
            ├── main-agent.md                      # 主 agent prompt 模板（提炼自 grok prompt.md）
            ├── subagent.md                        # subagent 专用模板（提炼自 subagent_prompt.md）
            └── patch-mode.md                      # 补丁/重构模式（提炼自 apply_patch_prompt.md）
```

### 职责分工

| 层 | 职责 | 生效方式 |
|---|---|---|
| **AGENTS.md** | 最高频核心规则（3-4 条强约束） | 默认每次会话注入 |
| **skill SKILL.md** | 完整模板库 + 使用指南 + 质量检查清单 | 按需加载 |
| **templates/** | 可直接复制改用的 prompt 文本 | 写自定义 skill/hook/agent 时参照 |

**切分原则**：AGENTS.md 太长会稀释每条规则权重，只放"必须每次都在场"的安全/行为铁律；细节模板放 skill，调用时才进 context，不污染日常对话。

---

## 四、AGENTS.md 追加内容

位置：现有 `atlas-ledger` 段之后、`pua` 段之前（或末尾），用 `<!-- prompt-standards:begin -->` / `<!-- prompt-standards:end -->` 标记包裹，与现有 atlas-contract/pua/karpathy 风格一致。

### 核心条款（约 60-80 行）

#### 1. Action Safety 分级

- **本地可逆**（编辑文件、跑测试、读代码）→ 自由做
- **对外不可逆 / 难撤销** → **必须先说计划再问用户**，包括但不限于：
  - 破坏性操作：删文件/分支、drop 表、kill 进程、`rm -rf`、丢弃未提交工作
  - 不可逆操作：force-push（覆盖远端历史）、`git reset --hard`、改已发布 commit、升降级依赖、改 CI/CD
  - 对外可见 / 改共享状态：push 代码、开关/评论 PR 和 issue、发消息（Slack/邮件/GitHub）、post 到外部服务、改共享基础设施或权限
- **一次同意不是空白授权** —— 上次同意 push 不代表这次不用问
- 遇到陌生文件/分支/配置 → 先查清再动，可能是用户在途工作

#### 2. Tool Calling 优先级

- 读文件用 `Read`，不用 `cat/head/tail`
- 改文件用 `Edit/Write`，不用 `sed/awk`
- 找代码用 `Grep/Glob`，不用 `grep -r/find`
- bash 只用于真正的系统命令和终端操作
- **禁止用 `echo/printf` 跟用户沟通** —— 沟通走回复正文
- 独立的工具调用要**并行**发起，不要串行

#### 3. Plan-first 触发条件

任务满足任一即先列计划再动手：
- 多步骤（含"然后/接着/再/之后/先…再…"且每步独立实质工作）
- 两个以上独立功能
- 非平凡多动作任务
- 用户要求多于一件事

简单单步任务直接做，不要用计划凑数。计划是高质量的可验证步骤，不是废话清单。

---

## 五、prompt-engineering skill 设计

### SKILL.md 结构

```
---
name: prompt-engineering
description: 工业级 prompt / system 指令设计指南，提炼自 xAI grok-build 的三套模板系统。当任务涉及写 system prompt / 写 skill 的 SKILL.md / 写 hook 规则 / 设计 subagent 任务 / 给团队定 prompt 规范时使用。
---

# Prompt Engineering — 工业级指令设计

## 何时使用
[显式触发 + 智能识别场景]

## 三套模板
- templates/main-agent.md    —— 主 agent 长期 system prompt
- templates/subagent.md      —— subagent 专用（用 Agent 工具派发时套用）
- templates/patch-mode.md    —— 专注改代码模式（重构、bug 修复）

## 分区设计指南
[XML 标签组织法：<action_safety> / <tool_calling> / <output_efficiency> / <formatting>]

## 动态渲染思想
[按工具可用性条件写作，不写脚本]

## 质量检查清单
[写完 prompt 后自检：安全条款/输出格式/无 echo 沟通/工具优先/并行调用等]
```

### 触发方式

- **显式**：用户输入 `/prompt-engineering` 或明确说"写 prompt / 改 AGENTS.md / 设计 skill / 设计 agent 指令"
- **智能识别**：任务涉及以下场景时主动提示加载：
  - 写 system prompt 或 system 指令
  - 写 skill 的 SKILL.md
  - 写 hook 规则 / hookify 规则
  - 设计 subagent 任务（用 Agent 工具派发）
  - 给团队定 prompt / agent 行为规范

### templates/ 三份文档

每份是**可直接复制的 prompt 文本**，从 grok 三份模板提炼，做 ZCode 适配：

| 模板 | 来源 | ZCode 适配要点 |
|---|---|---|
| `main-agent.md` | grok `prompt.md` | 工具名改 Read/Edit/Grep/Bash；去 grok 特有变量语法；保留四分区结构 |
| `subagent.md` | grok `subagent_prompt.md` | 加"用 Agent 工具时如何套用"说明；保留聚焦不扩范围原则 |
| `patch-mode.md` | grok `apply_patch_prompt.md` | 适配为"专注改代码模式"；去 apply_patch 工具特定语法，改通用 Edit |

---

## 六、内容映射

| grok 原始位置 | 落地到 | 处理方式 |
|---|---|---|
| `<action_safety>` | AGENTS.md（精简）+ `main-agent.md`（完整） | AGENTS.md 放铁律，模板放完整版 |
| `<tool_calling>` | AGENTS.md（精简）+ `main-agent.md`（完整） | 同上 |
| `<output_efficiency>` + `<formatting>` | `main-agent.md` | 只进模板，不进 AGENTS.md |
| Plan-first / Planning | AGENTS.md（触发条件）+ `main-agent.md`（完整指南） | 触发条件默认生效，细节按需查 |
| Preamble / Progress updates | `main-agent.md` | 进模板 |
| Final answer structure | `main-agent.md` | 进模板 |
| `subagent_prompt.md` 全文 | `subagent.md` | 直接适配，加 Agent 工具套用说明 |
| `apply_patch_prompt.md` 全文 | `patch-mode.md` | 适配为"专注改代码模式" |
| `<user_info>` / 环境信息 | 不做 | ZCode 已自动注入 Environment 段 |
| `<user_guide>` / TUI 文档 | 不做 | ZCode 非 TUI |

---

## 七、明确不做的事（YAGNI）

| 不做 | 原因 |
|---|---|
| 动态 prompt 生成脚本 | ZCode 工具集相对固定，收益小，违反 YAGNI |
| 替换 ZCode 主 system prompt | 闭源，不可改 |
| 翻译 grok 模板变量语法 `${{...}}` | 增加复杂度，自然语言条件描述即可 |
| 做成 hookify 规则 | hook 拦截工具调用，不注入 prompt，层次不对 |
| 覆盖 memory / compaction / workflow | 后续优先级，本次聚焦 prompt |
| 翻译 THIRD-PARTY-NOTICES | 只借鉴思想不用代码，无义务 |

---

## 八、验证标准

实现完成的判定依据：

1. **AGENTS.md** 追加段存在，含 Action Safety / Tool Calling / Plan-first 三块，用 begin/end 标记包裹
2. **`.agents/skills/prompt-engineering/SKILL.md`** 存在，含触发条件、三模板说明、分区指南、质量检查清单
3. **`templates/main-agent.md`** 含四分区（action_safety / tool_calling / output_efficiency / formatting）+ Plan-first 完整指南
4. **`templates/subagent.md`** 含聚焦不扩范围原则 + Agent 工具套用说明
5. **`templates/patch-mode.md`** 含专注改代码模式规范
6. 新会话启动后，AGENTS.md 追加段被正确注入（通过观察我自己的 system context 确认）
7. 显式说"帮我写个 prompt"时，skill 能被识别加载

---

## 九、后续优先级（不在本次范围）

完成本 skill 后，按之前的可提取能力清单继续：

- 🟡 **第二优先级**：Memory 向量检索（better-sqlite3 + sqlite-vec）、Workflow journal 断点续跑、Compaction 工具配对保留
- 🔴 **第三优先级**：Subagent persona 系统、Doom loop 检测、多 namespace 工具抽象
