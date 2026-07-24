<!-- superpowers-zh:begin (do not edit between these markers) -->
# Superpowers-ZH 中文增强版

本项目已安装 superpowers-zh 技能框架 + Anthropic 官方 Skills + UI/UX 设计 Skills + GitHub Stars 扩展（共 106+ 个 skills）。

## 核心规则

1. **收到任务时，先检查是否有匹配的 skill** — 哪怕只有 1% 的可能性也要检查
2. **设计先于编码** — 收到功能需求时，先用 brainstorming skill 做需求分析
3. **测试先于实现** — 写代码前先写测试（TDD）
4. **验证先于完成** — 声称完成前必须运行验证命令

## 可用 Skills

Skills 位于 `.Codex/skills/` 目录，每个 skill 有独立的 `SKILL.md` 文件。

- **brainstorming**: 在任何创造性工作之前必须使用此技能——创建功能、构建组件、添加功能或修改行为。在实现之前先探索用户意图、需求和设计。
- **chinese-code-review**: 中文 review 沟通参考——话术模板、分级标注（必须修复/建议修改/仅供参考）、国内团队常见反模式应对。仅在用户显式 /chinese-code-review 时调用，不要根据上下文自动触发。
- **chinese-commit-conventions**: 中文 commit 与 changelog 配置参考——Conventional Commits 中文适配、commitlint/husky/commitizen 中文模板、conventional-changelog 中文配置。仅在用户显式 /chinese-commit-conventions 时调用，不要根据上下文自动触发。
- **chinese-documentation**: 中文文档排版参考——中英文空格、全半角标点、术语保留、链接格式、中文文案排版指北约定。仅在用户显式 /chinese-documentation 时调用，不要根据上下文自动触发。
- **chinese-git-workflow**: 国内 Git 平台配置参考——Gitee、Coding.net、极狐 GitLab、CNB 的 SSH/HTTPS/凭据/CI 接入差异与镜像同步配置。仅在用户显式 /chinese-git-workflow 时调用，不要根据上下文自动触发。
- **dispatching-parallel-agents**: 当面对 2 个以上可以独立进行、无共享状态或顺序依赖的任务时使用
- **executing-plans**: 当你有一份书面实现计划需要在单独的会话中执行，并设有审查检查点时使用
- **finishing-a-development-branch**: 当实现完成、所有测试通过、需要决定如何集成工作时使用——通过提供合并、PR 或清理等结构化选项来引导开发工作的收尾
- **mcp-builder**: MCP 服务器构建方法论 — 系统化构建生产级 MCP 工具，让 AI 助手连接外部能力
- **receiving-code-review**: 收到代码审查反馈后、实施建议之前使用，尤其当反馈不明确或技术上有疑问时——需要技术严谨性和验证，而非敷衍附和或盲目执行
- **requesting-code-review**: 完成任务、实现重要功能或合并前使用，用于验证工作成果是否符合要求
- **subagent-driven-development**: 当在当前会话中执行包含独立任务的实现计划时使用
- **systematic-debugging**: 遇到任何 bug、测试失败或异常行为时使用，在提出修复方案之前执行
- **test-driven-development**: 在实现任何功能或修复 bug 时使用，在编写实现代码之前
- **using-git-worktrees**: 当需要开始与当前工作区隔离的功能开发，或在执行实现计划之前使用——通过原生工具或 git worktree 回退机制确保隔离工作区存在
- **using-superpowers**: 在开始任何对话时使用——确立如何查找和使用技能，要求在任何响应（包括澄清性问题）之前调用 Skill 工具
- **verification-before-completion**: 在宣称工作完成、已修复或测试通过之前使用，在提交或创建 PR 之前——必须运行验证命令并确认输出后才能声称成功；始终用证据支撑断言
- **workflow-runner**: 在 Codex / OpenClaw / Cursor 中直接运行 agency-orchestrator YAML 工作流——无需 API key，使用当前会话的 LLM 作为执行引擎。当用户提供 .yaml 工作流文件或要求多角色协作完成任务时触发。
- **writing-plans**: 当你有规格说明或需求用于多步骤任务时使用，在动手写代码之前
- **writing-skills**: 当创建新技能、编辑现有技能或在部署前验证技能是否有效时使用
- **algorithmic-art**: 使用 p5.js 创建算法艺术（种子随机性、交互式参数探索、流场、粒子系统）
- **anysearch**: 实时搜索引擎 — 网页搜索、垂直领域搜索、并行批量搜索、URL 内容提取
- **banner-design**: 社交媒体/广告/网站横幅设计，多艺术方向 + AI 生成图像
- **brand**: 品牌声音、视觉识别、消息框架、资产管理、品牌一致性
- **brand-guidelines**: 应用 Anthropic 官方品牌颜色和排版到产出物
- **canvas-design**: 创建设计精美的 PNG/PDF 视觉艺术作品（海报、设计、静态作品）
- **Codex-api**: 构建/调试/优化 Codex API 应用，含 prompt caching 和模型版本迁移
- **design**: 综合设计技能 — Logo（55 风格）、CIP（50 交付物）、HTML 演示（Chart.js）、横幅（22 风格）
- **design-system**: 三层次令牌架构（primitive→semantic→component）、组件规格、幻灯片生成
- **doc-coauthoring**: 结构化文档共创工作流 — 方案、技术规格、决策文档
- **docx**: 创建/读取/编辑 Word 文档，含表格、图片、目录、批注
- **frontend-design**: 创建生产级前端界面（React、Tailwind、shadcn/ui）
- **internal-comms**: 撰写内部通讯（状态报告、领导层更新、项目更新、FAQ 等）
- **karpathy-guidelines**: 基于 Andrej Karpathy 对 LLM 编码问题的观察，减少常见编码错误
- **pdf**: 读取/合并/拆分/旋转/加水印/创建 PDF 文件
- **pptx**: 创建/读取/解析 PowerPoint 演示文稿
- **skill-creator**: 创建/修改/优化/评估技能，含性能基准测试和方差分析
- **slack-gif-creator**: 为 Slack 创建优化的动画 GIF
- **slides**: 使用 Chart.js、设计令牌、响应式布局创建战略 HTML 演示
- **theme-factory**: 10 个预设主题（颜色/字体），可应用于幻灯片、文档、网页等
- **ui-styling**: 使用 shadcn/ui + Tailwind CSS 创建美观可访问的 UI
- **ui-ux-pro-max**: UI/UX 设计智能 — 50+ 风格、161 调色板、57 字体配对、99 UX 指南、25 图表类型
- **web-artifacts-builder**: 使用 React/Tailwind/shadcn 创建复杂多组件 HTML artifacts
- **webapp-testing**: 使用 Playwright 测试本地 Web 应用 — 截图、浏览器日志、UI 调试
- **xlsx**: 创建/读取/编辑 Excel 电子表格（.xlsx/.xlsm/.csv/.tsv）

### GitHub Stars 扩展 Skills

- **ameath-skill**: Wuthering Waves 角色 Ameath 对话生成/调优/产品化技能（角色扮演 API、人格系统、对话策略）
- **huashu-design**: 花叔 Design — HTML 高保真原型、交互 Demo、幻灯片、动画、设计变体探索 + 20 种设计哲学 + 5 维评审 + MP4 导出
- **graphify**: 代码/文档/论文知识图谱生成 — 将任意文件夹转为可查询知识图谱（社区检测、GraphRAG、交互式 HTML）
- **api-design**: API 设计最佳实践
- **coding-standards**: 通用编码规范
- **python-patterns**: Python 设计模式与最佳实践
- **golang-patterns**: Go 语言模式
- **frontend-patterns**: 前端开发模式
- **backend-patterns**: 后端开发模式
- **security-review**: 安全审查
- **tdd-workflow**: TDD 工作流
- **docker-patterns**: Docker 容器化模式
- **postgres-patterns**: PostgreSQL 最佳实践
- **deployment-patterns**: 部署模式
- **liquid-glass-design**: 液态玻璃设计风格

## 如何使用

当任务匹配某个 skill 时，使用 `Skill` 工具加载对应 skill 并严格遵循其流程。绝不要用 Read 工具读取 SKILL.md 文件。

如果你认为哪怕只有 1% 的可能性某个 skill 适用于你正在做的事情，你必须调用该 skill 检查。
<!-- superpowers-zh:end -->

---

<!-- karpathy-guidelines:begin -->
# Karpathy-Inspired Coding Guidelines

Behavioral guidelines to reduce common LLM coding mistakes, derived from [Andrej Karpathy's observations](https://x.com/karpathy/status/2015883857489522876).

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
<!-- karpathy-guidelines:end -->

---

<!-- atlas-contract:begin -->
# Atlas Contract — Goal Integrity

Prevent silent goal drift during implementation. Derived from [atlas-contract v6.2](https://github.com/wede-wx/atlas).

## Risk Signals（出现即进入合同模式）

每次收到任务时，扫描以下信号来决定防卫级别：

| 信号 | 含义 |
|---|---|
| **Backend** | 涉及后端 / API / 数据库 / 持久化 / 认证 / 真实数据 |
| **Preserve** | 用户要求保留 / 不改变 / 保护现有行为 |
| **Data** | 数据完整性 / schema / 枚举 / 共享状态 / 统计 |
| **Tests** | 测试 / 验证 / 验收标准（存在被削弱风险） |
| **Fidelity** | 参考图 / 截图 / 布局 / 结构必须匹配 |

## 三个防卫等级

| 等级 | 信号数 | 行为 |
|---|---|---|
| **轻量** | 0 个 | 不输出合同，不输出事件。只管照 Core Rule 做好。 |
| **中等** | 1~2 个 | 输出一次目标合同 → 等确认 → 直跑 → 最终审计 |
| **重量** | 3+ 个，或命中硬锚 | 完整流程：合同 → 阶段账本 → 每阶段检查 → 最终审计 |

## 必须进重量级的硬锚（不看信号数）

以下任一命中，**强制重量级**：
1. **多步骤** —— 含"然后/接着/再/之后/先…再…"且每步是独立实质工作
2. **两个以上独立功能** —— 每个可独立交付
3. **重做上下文** —— 用户说上次结果不对/不完整/缩水
4. **Preserve + (Backend 或 Data)**
5. **完整性语言** —— 用户说"完整/端到端/全部"

阈值不确定时选更重的一级。

## Core Rule（所有等级必须遵守）

**绝不偷偷修改、缩水、隐藏、移除、禁用、stub、mock、替换、削弱、重新解读、或声称部分工作已完成。**

以下行为全部禁止：
- 不自我裁定影响 —— 不能说"这不影响 X"除非 grep 过所有用法、跑过相关测试
- 要求的结果必须存在 —— 不能隐藏/移除/禁用/stub/mock 替代真实实现
- 不降级范围 —— "端到端/完整"不能缩成前端 only
- 不假完成 —— 不能通过弱化/删除测试、隐藏 bug、用 mock 数据/骨架冒充完成
- 保留现有行为 —— 不改范围外的 API/数据流/布局/路由/权限/样式系统

## 最终审计

每次声称完成前：
1. 逐条对比合同里的 Must Do / Must Not Do / Preserve / Check
2. 每条标注：`Complete`（已验证）/ `Partial`（部分）/ `Unverified`（未验证）/ `Violation`（违反）
3. 有 `Unverified` 不得说"完成"——标出来让用户裁决
4. 审计结果要有 Atlas 事件头：`事件编号 / 类型 / 触发来源 / 阶段 / 停止状态`
<!-- atlas-contract:end -->

---

<!-- atlas-ledger:begin -->
# Atlas Ledger — Drift Memory

Companion to atlas-contract. When a drift is caught, distill it into a reusable guardrail. From [atlas-ledger v2.2](https://github.com/wede-wx/atlas).

## 触发条件

atlas-contract 最终审计发现硬偏离后**自动触发**；或在用户说"记下来下次别再犯"时触发。

## 蒸馏流程

```
caught drift
 → 陈述事实（不猜动机）
 → 起草 WHEN / DON'T / INSTEAD
 → 四道闸自检：可执行性 → 回放 → 泛化 → 误伤
 → 首次出现 = Observation [O#]；重复或高严重度 = 确认条款 [L#]
 → 提议 → 等用户确认 → 写入 Atlas.md
```

**高严重度（首次即确认）**：mock/fake 冒充真实实现、隐藏/删除用户要求的功能、削弱/删除测试强行通过、数据丢失/持久化损坏、安全/权限改动、Preserve 项被破坏、端到端降级为前端 only。

## Atlas.md 格式（只写根目录）

```
# Atlas Ledger
## Confirmed Clauses
- [L1] (seen 2x, severity: high)
  WHEN:    [条件]
  DON'T:   [禁止行为]
  INSTEAD: [正确行为]
  Source:  [来源审计事件]

## Provisional Observations
- [O1] (seen 1x)
  WHEN:    [条件]
  DON'T:   [禁止行为]
  INSTEAD: [正确行为]
  Source:  [来源]
```

已确认条款 ≤ 15 条。禁止 only-append——合并相近条款。用户可随时退休任何条款。
<!-- atlas-ledger:end -->

---

<!-- pua:begin -->
# PUA — Anti-Give-Up Engine

Force exhaustive problem-solving. When stuck, don't surrender — escalate. From [tanweai/pua](https://github.com/tanweai/pua).

## 触发条件（满足任一即激活）

1. 同一任务失败 **2 次以上**，或反复微调同一思路无进展
2. 即将说"我无法解决"、"建议手动操作"、未验证就归因外部环境
3. **被动等待** —— 不主动搜索、不读源码、不查文档、只等指示
4. 用户不满信号：*"再试试"* / *"换个方法"* / *"为什么还不行"* / *"怎么又失败了"*

首次失败或已知修复在执行中时不触发。

## 激活后行为

| 级别 | 做法 |
|---|---|
| **L0 轻推** | 换一个角度，不要重复上一轮的思路 |
| **L1 加压** | 列出 3 种不同方案（含激进方案），评估可行性后选最优 |
| **L2 深挖** | 读源码/查文档/搜索相似 issue，不要凭猜测 |
| **L3 穷尽** | 系统性排除假设：列所有可能原因 → 逐条验证 → 不跳过任一条 |
| **L4 绝境** | 承认卡住但给出最小复现 + 已排除路径 + 最可能的 2 个方向，等用户反馈 |

**核心原则**：永远在放弃之前验证所有假设。搜索 > 猜测。证据 > 直觉。
<!-- pua:end -->

---

<!-- prompt-standards:begin -->
# Prompt & Behavior Standards

提炼自 `xai-org/grok-build`（Apache-2.0）的 prompt 模板系统。以下三条为所有会话默认生效的核心规则，完整模板与设计指南见 `prompt-engineering` skill。

## Action Safety 分级

按可逆性和影响范围给每个动作分级。

- **本地可逆**（编辑文件、跑测试、读代码）→ 自由做。
- **对外不可逆 / 难撤销** → **必须先说计划再问用户**，包括但不限于：
  - 破坏性操作：删文件/分支、drop 表、kill 进程、`rm -rf`、丢弃未提交工作
  - 不可逆操作：force-push（覆盖远端历史）、`git reset --hard`、改已发布 commit、升降级依赖、改 CI/CD 流水线
  - 对外可见 / 改共享状态：push 代码、开关/评论 PR 和 issue、发消息（Slack/邮件/GitHub）、post 到外部服务、改共享基础设施或权限
- **一次同意不是空白授权** —— 在某情境下批准一次（如 git push），不代表后续情境都批准。除非用户已预先授权，否则都要确认。
- 发现陌生状态（不熟悉的文件、分支、配置）时，先调查再删除或覆盖 —— 它可能是用户在途的工作。

## Tool Calling 优先级

- 读文件用 `Read`，不用 `cat/head/tail`。
- 改文件用 `Edit`/`Write`，不用 `sed/awk`。
- 找代码用 `Grep`/`Glob`，不用 `grep -r/find`。
- bash 工具只用于真正的系统命令和终端操作。
- **禁止用 `echo`/`printf` 跟用户沟通** —— 沟通走回复正文。
- 独立的工具调用**并行**发起，不要串行。

## Plan-first 触发条件

任务满足任一即先列计划再动手：

- 多步骤（含"然后/接着/再/之后/先…再…"且每步独立实质工作）
- 两个以上独立功能
- 非平凡多动作任务
- 用户要求多于一件事

简单单步任务直接做，不要用计划凑数。计划是高质量的可验证步骤（每步 5-7 词、有逻辑序、可判断完成），不是废话清单。
<!-- prompt-standards:end -->
