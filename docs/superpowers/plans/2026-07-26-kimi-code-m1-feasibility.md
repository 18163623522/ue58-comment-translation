# Kimi Code M1（可行性验证）实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 验证"官方 grok.exe 能否在 Windows 上调通 Moonshot Kimi"，产出可重复运行的验证脚本和一份决策记录。通过则解锁 M2（Electron MVP），失败则触发备选方案评估。

**架构：** 不写应用代码。在 `kimi-code/m1/` 子目录里产出：(1) Kimi provider 的 grok config.toml；(2) 三个 PowerShell 验证脚本（基础连通、流式、多轮会话）；(3) 一份结果记录模板。所有验证通过手工+脚本双轨执行。

**技术栈：** PowerShell 5.1+（Windows 自带）、grok.exe（官方预编译）、TOML（手写）。

**上游 spec：** `docs/superpowers/specs/2026-07-26-kimi-code-design.md`

**预估工期：** 0.5-1 天（不含等待用户申请 Kimi API key 的时间）

---

## 文件结构

```
kimi-code/                       # 新建顶层目录（与 docs/ 平级）
└── m1/                          # M1 阶段产物，M2 起会建立完整的 src/ 结构
    ├── config.toml              # grok 的 Kimi provider 配置（验证用）
    ├── README.md                # 给人看的执行说明
    ├── scripts/
    │   ├── 00-check-prereq.ps1  # 检查 grok 是否已装、key 是否已设
    │   ├── 10-basic.ps1         # 基础连通验证（单轮、plain 文本）
    │   ├── 20-streaming.ps1     # 流式验证（streaming-json）
    │   └── 30-multiturn.ps1     # 多轮会话验证（--resume）
    └── results/
        └── TEMPLATE.md          # 验证结果记录模板（复制为 2026-XX-XX.md 填写）
```

**职责说明：**
- `config.toml` —— 唯一一份给 grok 用的配置，三个脚本都通过 `GROK_HOME` 指向它。把"配置正确性"这一变量孤立出来。
- 三个脚本递进验证（plain → streaming → multiturn），任一失败即可定位到具体环节。
- `results/TEMPLATE.md` —— M1 的产出物之一是"决策记录"，证明我们确实验证过、不是猜的。

---

## 前置假设

执行此计划前必须成立的前提（不成立则计划无法启动）：

1. **用户已申请到 Moonshot Kimi API key**（在 https://platform.moonshot.cn 或 https://platform.kimi.ai 注册并创建）。计划中用 `$env:MOONSHOT_API_KEY` 引用，不写死。
2. **执行机器是 Windows**（与 `~/.zcode/v2/setting.json` 的 `closeToTrayOnWindows` 一致，目标平台就是 Windows）。
3. **用户能用 PowerShell 执行命令**（zcode 自己也用 bash-startup，用户具备基础命令行能力）。

---

## 任务 1：建立 M1 目录骨架

**文件：**
- 创建：`kimi-code/m1/README.md`
- 创建：`kimi-code/m1/results/TEMPLATE.md`

- [ ] **步骤 1：创建目录结构**

在 PowerShell（仓库根 `F:\Cache\AI`）执行：

```powershell
New-Item -ItemType Directory -Force -Path kimi-code\m1\scripts | Out-Null
New-Item -ItemType Directory -Force -Path kimi-code\m1\results | Out-Null
```

预期：无报错，目录创建（已存在则 `-Force` 安全跳过）。

- [ ] **步骤 2：写 `kimi-code/m1/README.md`**

```markdown
# Kimi Code · M1 可行性验证

验证目标：官方 grok.exe 能否在 Windows 上调通 Moonshot Kimi。

## 前置
1. 已安装 grok（`irm https://x.ai/cli/install.ps1 | iex`），`grok --version` 可用
2. 已设置 `$env:MOONSHOT_API_KEY`（在 https://platform.moonshot.cn 申请）

## 执行顺序
依次运行 `scripts/` 下的脚本，每步通过再进下一步：

```powershell
$env:GROK_HOME = "$PWD\kimi-code\m1"   # 让 grok 读本目录的 config.toml
./kimi-code/m1/scripts/00-check-prereq.ps1
./kimi-code/m1/scripts/10-basic.ps1
./kimi-code/m1/scripts/20-streaming.ps1
./kimi-code/m1/scripts/30-multiturn.ps1
```

## 结果记录
每轮验证后，复制 `results/TEMPLATE.md` 为 `results/YYYY-MM-DD.md` 填写。
```

- [ ] **步骤 3：写 `kimi-code/m1/results/TEMPLATE.md`**

```markdown
# M1 验证结果 · [填日期]

## 环境
- OS: Windows [填版本]
- grok 版本: [填 `grok --version` 输出]
- Kimi 模型: kimi-k2
- MOONSHOT_API_KEY: [已设置 / 未设置]

## 脚本 10-basic.ps1
- exit code: [填]
- 收到非空中文回复: [是/否]
- 回复内容是否含 "Grok"/"xAI": [是/否]
- 结论: [通过/失败]

## 脚本 20-streaming.ps1
- 收到 type=text 事件: [数量]
- 收到 type=end 事件: [是/否]
- exit code: [填]
- 结论: [通过/失败]

## 脚本 30-multiturn.ps1
- 第一轮 sessionId: [填]
- 第二轮是否记住秘密数字 42: [是/否]
- 结论: [通过/失败]

## 总判定
- [ ] M1 通过 → 解锁 M2
- [ ] M1 失败 → 触发备选评估（见 spec 第 5 节 P0 对策）

## 备注
[任何异常、日志摘录、观察]
```

- [ ] **步骤 4：Commit**

```bash
git add kimi-code/m1/README.md kimi-code/m1/results/TEMPLATE.md
git commit -m "feat(kimi-code): M1 目录骨架与结果记录模板"
```

---

## 任务 2：写 grok 的 Kimi provider 配置

**文件：**
- 创建：`kimi-code/m1/config.toml`

**事实依据：** `grok-build-analysis/crates/codegen/xai-grok-pager/docs/user-guide/11-custom-models.md:74-92`、Moonshot API 是 OpenAI 兼容（Chat Completions）、模型 ID `kimi-k2`、context 128K。

- [ ] **步骤 1：写 config.toml**

```toml
# Kimi Code · M1 验证用 grok 配置
# 通过 GROK_HOME=$PWD\kimi-code\m1 让 grok 读这份配置
# 凭证走 env_key（grok 凭证解析顺序第 2 优先级，见 11-custom-models.md:96-101）

[cli]
auto_update = false                # M1 不需要更新检查

[models]
default = "kimi-k2"                # 不传 -m 时用此模型

[model.kimi-k2]
model = "kimi-k2"                                       # Moonshot 实际模型 ID
base_url = "https://api.moonshot.cn/v1"                 # OpenAI 兼容端点
name = "Kimi K2"
api_backend = "chat_completions"                        # Kimi 走标准 Chat Completions
env_key = "MOONSHOT_API_KEY"                            # 从环境变量读 key
context_window = 131072                                 # Kimi K2 = 128K
temperature = 0.6
max_completion_tokens = 8192
```

- [ ] **步骤 2：手动 sanity check 配置能被 grok 解析**

```powershell
$env:GROK_HOME = "$PWD\kimi-code\m1"
$env:MOONSHOT_API_KEY = "<你的 key>"
grok models
```

预期：列表里出现 `kimi-k2`。若报 `failed to parse` 或类似，对照 `11-custom-models.md` 检查字段名拼写。

- [ ] **步骤 3：Commit**

```bash
git add kimi-code/m1/config.toml
git commit -m "feat(kimi-code): grok Kimi provider 配置（M1 验证用）"
```

---

## 任务 3：前置检查脚本

**文件：**
- 创建：`kimi-code/m1/scripts/00-check-prereq.ps1`

**职责：** fail-fast。在跑真正验证前，确认 grok 已装、key 已设、config 解析正确。避免后续脚本失败时定位浪费。

- [ ] **步骤 1：写脚本**

```powershell
# kimi-code/m1/scripts/00-check-prereq.ps1
# 前置检查：grok 已装、key 已设、config 解析正确
$ErrorActionPreference = "Stop"

Write-Host "== 1. 检查 grok.exe =="
$grokCmd = Get-Command grok -ErrorAction SilentlyContinue
if (-not $grokCmd) {
    Write-Host "FAIL: grok 未安装或不在 PATH" -ForegroundColor Red
    Write-Host "  安装：irm https://x.ai/cli/install.ps1 | iex"
    exit 1
}
$grokVersion = (& grok --version) 2>&1
Write-Host "OK: $grokVersion" -ForegroundColor Green

Write-Host "`n== 2. 检查 MOONSHOT_API_KEY =="
if ([string]::IsNullOrEmpty($env:MOONSHOT_API_KEY)) {
    Write-Host "FAIL: 环境变量 MOONSHOT_API_KEY 未设置" -ForegroundColor Red
    Write-Host "  申请：https://platform.moonshot.cn"
    exit 1
}
Write-Host "OK: MOONSHOT_API_KEY 已设置（长度 $($env:MOONSHOT_API_KEY.Length)）" -ForegroundColor Green

Write-Host "`n== 3. 检查 GROK_HOME =="
if ([string]::IsNullOrEmpty($env:GROK_HOME)) {
    Write-Host "FAIL: GROK_HOME 未设置（应指向 kimi-code/m1 目录）" -ForegroundColor Red
    exit 1
}
$configPath = Join-Path $env:GROK_HOME "config.toml"
if (-not (Test-Path $configPath)) {
    Write-Host "FAIL: $configPath 不存在" -ForegroundColor Red
    exit 1
}
Write-Host "OK: config at $configPath" -ForegroundColor Green

Write-Host "`n== 4. 检查 grok 能列出 kimi-k2 =="
$modelsOutput = (& grok models) 2>&1 | Out-String
if ($modelsOutput -notmatch "kimi-k2") {
    Write-Host "FAIL: grok models 输出未包含 kimi-k2" -ForegroundColor Red
    Write-Host "输出："
    Write-Host $modelsOutput
    exit 1
}
Write-Host "OK: grok 已识别 kimi-k2 模型" -ForegroundColor Green

Write-Host "`n全部前置检查通过。" -ForegroundColor Cyan
```

- [ ] **步骤 2：执行验证**

```powershell
$env:GROK_HOME = "$PWD\kimi-code\m1"
$env:MOONSHOT_API_KEY = "<你的 key>"
./kimi-code/m1/scripts/00-check-prereq.ps1
```

预期：4 项全 OK，最后打印"全部前置检查通过"。任一 FAIL 即按提示修复后重跑。

- [ ] **步骤 3：Commit**

```bash
git add kimi-code/m1/scripts/00-check-prereq.ps1
git commit -m "feat(kimi-code): M1 前置检查脚本（grok/key/config 校验）"
```

---

## 任务 4：基础连通验证脚本

**文件：**
- 创建：`kimi-code/m1/scripts/10-basic.ps1`

**职责：** 单轮、plain 文本输出，验证最基础的"prompt → Kimi 回答"链路通。

- [ ] **步骤 1：写脚本**

```powershell
# kimi-code/m1/scripts/10-basic.ps1
# 基础连通验证：单轮 plain 文本
$ErrorActionPreference = "Stop"

$prompt = '你好，请用一句中文回复，并告诉我你是什么模型。'
Write-Host "Prompt: $prompt`n"

$out = & grok -p $prompt -m kimi-k2 --output-format plain 2>&1
$exitCode = $LASTEXITCODE

Write-Host "---- grok 输出 ----"
Write-Host $out
Write-Host "---- exit code: $exitCode ----"

if ($exitCode -ne 0) {
    Write-Host "`nFAIL: exit code $exitCode" -ForegroundColor Red
    exit $exitCode
}
if ([string]::IsNullOrWhiteSpace($out)) {
    Write-Host "`nFAIL: 输出为空" -ForegroundColor Red
    exit 1
}
if ($out -match 'Grok|xAI') {
    Write-Host "`nWARN: 输出含 Grok/xAI 字样（品牌残留，按 spec 不算 M1 失败）" -ForegroundColor Yellow
}
Write-Host "`nPASS: 基础连通正常" -ForegroundColor Green
```

- [ ] **步骤 2：执行验证**

```powershell
./kimi-code/m1/scripts/10-basic.ps1
```

预期：看到 Kimi 的中文自我介绍回复，最后打印 `PASS`。若输出含 `Grok`/`xAI` 是 WARN 不阻断（spec P2 已说明）。

- [ ] **步骤 3：Commit**

```bash
git add kimi-code/m1/scripts/10-basic.ps1
git commit -m "feat(kimi-code): M1 基础连通验证脚本"
```

---

## 任务 5：流式输出验证脚本

**文件：**
- 创建：`kimi-code/m1/scripts/20-streaming.ps1`

**职责：** 验证 `--output-format streaming-json` 的 NDJSON 事件流，这是 M2 Electron 嵌入 grok 时**唯一可用的接口**。这一步通过是 M2 可行性的真正前提。

**事实依据：** `grok-build-analysis/crates/codegen/xai-grok-pager/docs/user-guide/14-headless-mode.md:209-232` 定义了事件类型 `text`/`thought`/`end`/`error`。

- [ ] **步骤 1：写脚本**

```powershell
# kimi-code/m1/scripts/20-streaming.ps1
# 流式输出验证：streaming-json NDJSON 事件
$ErrorActionPreference = "Stop"

$prompt = '请用三句中文介绍你自己，每句单独一行。'
Write-Host "Prompt: $prompt`n"

# 重定向到文件便于事后分析（PowerShell 5.1 用 Start-Process 流式重定向最稳）
$resultsDir = Join-Path $env:GROK_HOME "results"
New-Item -ItemType Directory -Force -Path $resultsDir | Out-Null
$outFile     = Join-Path $resultsDir "streaming-raw.txt"
$stderrFile  = Join-Path $resultsDir "streaming-stderr.txt"

$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName               = "grok"
$psi.Arguments              = '-p "' + $prompt + '" -m kimi-k2 --output-format streaming-json'
$psi.UseShellExecute        = $false
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError  = $true
$psi.StandardOutputEncoding = [System.Text.Encoding]::UTF8
$psi.StandardErrorEncoding  = [System.Text.Encoding]::UTF8

$proc = New-Object System.Diagnostics.Process
$proc.StartInfo = $psi

# 用 StringBuilder 收 stderr，用 StreamWriter 落盘 stdout
$stderrBuilder = New-Object System.Text.StringBuilder
$outWriter     = [System.IO.File]::CreateText($outFile)
$errWriter     = [System.IO.File]::CreateText($stderrFile)

$null = Register-ObjectEvent -InputObject $proc -EventName "ErrorDataReceived" `
    -Action { $null = $stderrBuilder.AppendLine($EventArgs.Data); $errWriter.WriteLine($EventArgs.Data) }
$null = Register-ObjectEvent -InputObject $proc -EventName "OutputDataReceived" `
    -Action { $outWriter.WriteLine($EventArgs.Data) }

$null = $proc.Start()
$proc.BeginErrorReadLine()
$proc.BeginOutputReadLine()
$proc.WaitForExit()
$exitCode = $proc.ExitCode
$outWriter.Close()
$errWriter.Close()

Write-Host "---- 原始 NDJSON 流（前 20 行）----"
Get-Content $outFile -TotalCount 20 | ForEach-Object { Write-Host $_ }

Write-Host "`n---- 事件统计 ----"
$textCount = 0; $thoughtCount = 0; $endSeen = $false; $errorSeen = $false
foreach ($line in Get-Content $outFile) {
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    try {
        $evt = $line | ConvertFrom-Json
    } catch {
        Write-Host "WARN: 无法解析为 JSON: $line" -ForegroundColor Yellow
        continue
    }
    switch ($evt.type) {
        "text"    { $textCount++ }
        "thought" { $thoughtCount++ }
        "end"     { $endSeen = $true }
        "error"   { $errorSeen = $true; Write-Host "ERROR event: $($evt.message)" -ForegroundColor Red }
    }
}
Write-Host "text 事件: $textCount"
Write-Host "thought 事件: $thoughtCount"
Write-Host "end 事件: $endSeen"
Write-Host "error 事件: $errorSeen"
Write-Host "exit code: $exitCode"

$pass = $true
if ($textCount -eq 0) { Write-Host "FAIL: 没有 text 事件" -ForegroundColor Red; $pass = $false }
if (-not $endSeen)    { Write-Host "FAIL: 没有 end 事件（流未正常结束）" -ForegroundColor Red; $pass = $false }
if ($errorSeen)       { Write-Host "FAIL: 出现 error 事件" -ForegroundColor Red; $pass = $false }
if ($exitCode -ne 0)  { Write-Host "FAIL: exit code $exitCode" -ForegroundColor Red; $pass = $false }

if ($pass) {
    Write-Host "`nPASS: 流式接口工作正常（M2 可用性已验证）" -ForegroundColor Green
} else {
    exit 1
}
```

- [ ] **步骤 2：执行验证**

```powershell
./kimi-code/m1/scripts/20-streaming.ps1
```

预期：看到 NDJSON 行，统计出 `text ≥ 1`、`end = true`、`error = false`、exit 0，打印 `PASS`。

**如果失败**：这是 M1 最关键的一步。失败大概率说明 grok 的 xAI 专有 header 被 Kimi 拒绝（spec 第 5 节 P0 风险）。记录失败现象到 `results/` 后进入备选评估。

- [ ] **步骤 3：Commit**

```bash
git add kimi-code/m1/scripts/20-streaming.ps1
git commit -m "feat(kimi-code): M1 流式接口验证脚本（M2 关键前提）"
```

---

## 任务 6：多轮会话验证脚本

**文件：**
- 创建：`kimi-code/m1/scripts/30-multiturn.ps1`

**职责：** 验证 `--resume <sessionId>` 能维持上下文。这是 M2 聊天界面"多轮对话"功能的前提。

**事实依据：** `grok-build-analysis/crates/codegen/xai-grok-pager/docs/user-guide/14-headless-mode.md:255-268, 280-284`。

- [ ] **步骤 1：写脚本**

```powershell
# kimi-code/m1/scripts/30-multiturn.ps1
# 多轮会话验证：--resume 维持上下文
$ErrorActionPreference = "Stop"

# 第一轮：告诉它一个秘密数字
Write-Host "== 第一轮 =="
$round1 = & grok -p '请记住秘密数字 42。只需回复"已记住"。' `
    -m kimi-k2 --output-format json 2>&1
$exit1 = $LASTEXITCODE
Write-Host $round1

if ($exit1 -ne 0) {
    Write-Host "FAIL: 第一轮 exit $exit1" -ForegroundColor Red
    exit $exit1
}

# 提取 sessionId（grok json 输出含此字段）
$round1Obj = $round1 | ConvertFrom-Json
$sessionId = $round1Obj.sessionId
Write-Host "`n第一轮 sessionId: $sessionId"

if ([string]::IsNullOrEmpty($sessionId)) {
    Write-Host "FAIL: 第一轮未返回 sessionId" -ForegroundColor Red
    exit 1
}

# 第二轮：换进程，用 --resume 续接
Write-Host "`n== 第二轮（新进程，--resume）=="
$round2 = & grok -p '秘密数字是多少？只回复数字本身。' `
    -m kimi-k2 --output-format json --resume $sessionId 2>&1
$exit2 = $LASTEXITCODE
Write-Host $round2

if ($exit2 -ne 0) {
    Write-Host "FAIL: 第二轮 exit $exit2" -ForegroundColor Red
    exit $exit2
}

$round2Obj = $round2 | ConvertFrom-Json
$answerText = $round2Obj.text
Write-Host "`n第二轮回复: $answerText"

if ($answerText -match '42') {
    Write-Host "`nPASS: 多轮会话上下文保持正常" -ForegroundColor Green
} else {
    Write-Host "`nFAIL: 回复未包含 42，多轮上下文可能未生效" -ForegroundColor Red
    Write-Host "（注：也可能是模型未严格遵循指令，可换 prompt 重试一次）"
    exit 1
}
```

- [ ] **步骤 2：执行验证**

```powershell
./kimi-code/m1/scripts/30-multiturn.ps1
```

预期：第二轮回复含 `42`，打印 `PASS`。若不含 42，按脚本提示可改 prompt 重试一次（Kimi 可能不严格遵循"只回复数字"）。

- [ ] **步骤 3：Commit**

```bash
git add kimi-code/m1/scripts/30-multiturn.ps1
git commit -m "feat(kimi-code): M1 多轮会话验证脚本"
```

---

## 任务 7：执行完整 M1 验证并填写结果记录

**文件：**
- 创建：`kimi-code/m1/results/2026-07-26.md`（或执行当日日期）

此任务无代码变更，只产出**决策证据**——M1 的核心产出物。

- [ ] **步骤 1：依次执行四个脚本**

```powershell
cd F:\Cache\AI
$env:GROK_HOME = "$PWD\kimi-code\m1"
$env:MOONSHOT_API_KEY = "<你的 key>"

./kimi-code/m1/scripts/00-check-prereq.ps1
./kimi-code/m1/scripts/10-basic.ps1
./kimi-code/m1/scripts/20-streaming.ps1
./kimi-code/m1/scripts/30-multiturn.ps1
```

- [ ] **步骤 2：填写 results 记录**

复制 `results/TEMPLATE.md` 为当日日期文件，按模板填写实际数据（exit code、事件统计、回复内容等）。

- [ ] **步骤 3：基于结果做决策**

- 若全部 PASS：在记录末尾写"M1 通过，进入 M2"，通知用户。
- 若任一 FAIL：在记录里粘贴失败现场（stderr、原始输出），按 spec 第 5 节 P0 备选方案（试 `--system-prompt-override` / `--rules`，或评估换内核）。

- [ ] **步骤 4：Commit**

```bash
git add kimi-code/m1/results/
git commit -m "docs(kimi-code): M1 验证结果记录 [通过/失败]"
```

---

## M1 完成标准（Definition of Done）

以下**全部**满足才算 M1 完成：

- [ ] 任务 1-6 的脚本和配置都已 commit
- [ ] 任务 7 的结果记录已填写并 commit
- [ ] 三个验证脚本至少跑过一次，记录中数据真实（不是凭空填的）
- [ ] 总判定明确：通过（→ M2）或失败（→ 备选评估），有依据

**不满足的常见反模式**（按 atlas-contract Core Rule 禁止）：
- ❌ 脚本没真跑，记录凭印象填
- ❌ 流式脚本失败但跳过、只记基础连通通过
- ❌ 把"M1 部分通过"写成"M1 通过"（spec 第 5 节失败判定是硬标准）
