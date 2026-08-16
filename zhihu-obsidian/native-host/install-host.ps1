# 安装/注册本机桥接程序（Native Messaging host）
# 用法（PowerShell）：
#   .\install-host.ps1 -ExtensionId "你的扩展ID"
#
# 它会：
#   1. 找 node 和 ffmpeg
#   2. 生成 bridge.bat（写死 node 绝对路径）
#   3. 生成 com.zhihu_obsidian.ffmpeg.json（写死 bat 路径 + 扩展 ID）
#   4. 写注册表 HKCU，注册到 Chrome 和 Edge

param(
  [Parameter(Mandatory = $true)]
  [string]$ExtensionId
)

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "== 检查 node ==" -ForegroundColor Cyan
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  $nodeCandidates = @(
    "$env:ProgramFiles\nodejs\node.exe",
    "${env:ProgramFiles(x86)}\nodejs\node.exe",
    "$env:LOCALAPPDATA\Programs\nodejs\node.exe",
    "D:\Softwave\Nodejs\node.exe"
  )
  $node = $nodeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
}
if (-not $node) {
  Write-Error "未找到 node.exe，请先安装 Node.js 并加入 PATH。"
}
$nodePath = if ($node -is [System.Management.Automation.CommandInfo]) { $node.Source } else { $node }
Write-Host "node: $nodePath" -ForegroundColor Green

Write-Host "== 检查 ffmpeg ==" -ForegroundColor Cyan
$ffmpeg = Get-Command ffmpeg -ErrorAction SilentlyContinue
if (-not $ffmpeg) {
  Write-Warning "未在 PATH 中找到 ffmpeg。"
  Write-Host "  请先安装 ffmpeg（winget install Gyan.FFmpeg 或从 ffmpeg.org 下载），"
  Write-Host "  并将其 bin 目录加入系统 PATH，然后重新运行本脚本。"
} else {
  Write-Host "ffmpeg: $($ffmpeg.Source)" -ForegroundColor Green
}

Write-Host "== 生成 bridge.bat ==" -ForegroundColor Cyan
$batContent = '@echo off' + "`r`n" + 'rem 由 install-host.ps1 生成，写死 node 的绝对路径。' + "`r`n" + "`"$nodePath`" `"%~dp0bridge.mjs`"" + "`r`n"
$batPath = Join-Path $scriptDir "bridge.bat"
Set-Content -Path $batPath -Value $batContent -Encoding ASCII
Write-Host "已写入: $batPath" -ForegroundColor Green

Write-Host "== 生成 host manifest ==" -ForegroundColor Cyan
$manifestPath = Join-Path $scriptDir "com.zhihu_obsidian.ffmpeg.json"
$manifest = @{
  name            = "com.zhihu_obsidian.ffmpeg"
  description     = "知乎到 Obsidian 扩展的 ffmpeg 桥接程序（m3u8 转 mp4）"
  path            = $batPath
  type            = "stdio"
  allowed_origins = @("chrome-extension://$ExtensionId/")
}
$manifest | ConvertTo-Json -Depth 5 | Set-Content -Path $manifestPath -Encoding UTF8
Write-Host "已写入: $manifestPath" -ForegroundColor Green

Write-Host "== 写注册表（HKCU）==" -ForegroundColor Cyan
$chromeKey = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.zhihu_obsidian.ffmpeg"
$edgeKey   = "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\com.zhihu_obsidian.ffmpeg"

New-Item -Path "HKCU:\Software\Google\Chrome\NativeMessagingHosts" -Force | Out-Null
New-Item -Path "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts" -Force | Out-Null
Set-ItemProperty -Path $chromeKey -Name "(default)" -Value $manifestPath -ErrorAction SilentlyContinue
if (-not (Test-Path $chromeKey)) {
  New-Item -Path $chromeKey -Force | Out-Null
  Set-ItemProperty -Path $chromeKey -Name "(default)" -Value $manifestPath
}
Set-ItemProperty -Path $edgeKey -Name "(default)" -Value $manifestPath -ErrorAction SilentlyContinue
if (-not (Test-Path $edgeKey)) {
  New-Item -Path $edgeKey -Force | Out-Null
  Set-ItemProperty -Path $edgeKey -Name "(default)" -Value $manifestPath
}
Write-Host "已注册到 Chrome 和 Edge。" -ForegroundColor Green

Write-Host ""
Write-Host "完成！请重新加载扩展（chrome://extensions 里点刷新）。" -ForegroundColor Yellow
Write-Host "提示：若扩展 ID 变了，需重新运行本脚本。" -ForegroundColor Yellow
