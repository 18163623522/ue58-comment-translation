---
name: prompt-engineering
description: 工业级 prompt / system 指令设计指南，提炼自 xAI grok-build 的三套模板系统。当任务涉及写 system prompt、写 skill 的 SKILL.md、写 hook 规则、设计 subagent 任务、给团队定 prompt 规范时使用。
---

# Prompt Engineering — 工业级指令设计

提炼自 `xai-org/grok-build`（Apache-2.0）的 prompt 模板系统。grok 把 prompt 拆成三套精心设计的模板，用 XML 标签分区组织，支持按工具可用性动态渲染。本 skill 把这套方法论迁移到 ZCode 生态。

## 何时使用

**显式触发**：用户输入 `/prompt-engineering` 或明确说"写 prompt / 改 AGENTS.md / 设计 skill / 设计 agent 指令"。

**智能识别**：任务涉及以下场景时主动提示加载本 skill：
- 写 system prompt 或 system 指令
- 写 skill 的 SKILL.md
- 写 hook 规则 / hookify 规则
- 设计 subagent 任务（用 Agent 工具派发）
- 给团队定 prompt / agent 行为规范

## 三套模板

按场景选用，可直接复制改用：

- `templates/main-agent.md` —— 主 agent 长期 system prompt（用于自定义 CLI agent、写 AGENTS.md 条款）
- `templates/subagent.md` —— subagent 专用（用 Agent 工具派发任务时套用）
- `templates/patch-mode.md` —— 专注改代码模式（重构、bug 修复、Surgical Changes）

## 分区设计指南

不要线性堆砌 prompt，用 XML 标签分区组织（源自 grok 的 `<action_safety>` 等设计）：

- `<action_safety>` —— 动作安全分级（可逆性 + 影响范围）
- `<tool_calling>` —— 工具调用规范（优先级、并行、禁用项）
- `<output_efficiency>` —— 输出效率（简洁、高质量、无废话）
- `<formatting>` —— 输出格式（markdown、可扫描、文件引用）
- `<planning>` —— 计划工作流（何时列计划、计划质量）
- `<background_tasks>` —— 后台任务（如适用）

分区让 prompt 可读、可维护、可按需启停。

## 动态渲染思想

grok 用模板变量（`${{ tools.by_kind.read }}`）让 prompt 自适应工具集。ZCode 无需脚本，用**条件写作**实现：

- 如果用户要用 Agent 工具派 subagent → 套用 `subagent.md` 模板的指令
- 如果任务含 web_search 工具 → 加"先搜索再回答"段
- 如果任务含 image_gen 工具 → 加"图像生成后描述给用户"段
- 如果工具集固定 → 不需要条件段，直接写死

原则：**prompt 只提可用的工具**，提一个不存在的工具会误导模型。

## 质量检查清单

写完任何 prompt / system 指令后，逐条自检：

- [ ] **安全条款**：是否区分了"本地可逆"与"对外不可逆"，后者是否要求确认
- [ ] **一次同意**：是否明确"一次同意不是空白授权"
- [ ] **工具优先级**：是否指定了专用工具优先于 bash（Read > cat、Edit > sed）
- [ ] **禁用项**：是否禁止用 echo/printf 跟用户沟通
- [ ] **并行调用**：是否要求独立的工具调用并行发起
- [ ] **输出格式**：是否指定了 markdown 风格、可扫描结构、文件引用格式
- [ ] **简洁性**：是否要求按任务复杂度控制篇幅
- [ ] **Plan 触发**：是否说明了何时该先列计划
- [ ] **无空话**：是否避免了"适当处理错误""按需添加"等模糊措辞
- [ ] **工具存在性**：提到的每个工具都是目标环境真实存在的

## 衍生用法

- 写新 skill 的 SKILL.md 时，用本 skill 的分区思想和检查清单
- 写 AGENTS.md 条款时，参考 `main-agent.md` 的完整版
- 用 Agent 工具派发任务时，套用 `subagent.md` 构造 subagent prompt
- 做代码重构/bug 修复时，参考 `patch-mode.md` 的 Surgical Changes 原则
