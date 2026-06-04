# clipboard-save.ps1
# 将剪贴板中的截图自动保存到 screenshots/ 目录
# 使用方法: 截图后右键运行此脚本，或在 PowerShell 中执行 .\scripts\clipboard-save.ps1

$screenshotDir = "$PSScriptRoot\..\screenshots"

# 确保目录存在
if (-not (Test-Path $screenshotDir)) {
    New-Item -ItemType Directory -Path $screenshotDir -Force | Out-Null
}

# 尝试从剪贴板获取图片
try {
    Add-Type -AssemblyName System.Windows.Forms
    $clipboardImage = [System.Windows.Forms.Clipboard]::GetImage()

    if ($null -eq $clipboardImage) {
        Write-Host "❌ 剪贴板中没有图片！请先截图（Win+Shift+S 或 Alt+PrintScreen）" -ForegroundColor Red
        Write-Host ""
        Write-Host "📸 截图快捷键:"
        Write-Host "   Win+Shift+S  → 区域截图（推荐）"
        Write-Host "   Alt+PrintScreen → 当前窗口截图"
        Write-Host "   PrintScreen → 全屏截图"
        exit 1
    }

    # 生成文件名（时间戳）
    $timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
    $filename = "screenshot_$timestamp.png"
    $filepath = Join-Path $screenshotDir $filename

    # 保存图片
    $clipboardImage.Save($filepath, [System.Drawing.Imaging.ImageFormat]::Png)

    Write-Host "✅ 截图已保存: $filepath" -ForegroundColor Green
    Write-Host ""
    Write-Host "📸 在 Claude Code 中分析此截图:"
    Write-Host "   /analyze-screenshot $filename" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "或者直接读取:"
    Write-Host "   帮我看下 screenshots/$filename" -ForegroundColor Cyan
} catch {
    Write-Host "❌ 保存失败: $_" -ForegroundColor Red
    exit 1
}
