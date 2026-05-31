$startup = [Environment]::GetFolderPath('Startup')
$shortcut = Join-Path $startup 'StockDashboard.lnk'
$WshShell = New-Object -ComObject WScript.Shell
$link = $WshShell.CreateShortcut($shortcut)
$link.TargetPath = 'cmd.exe'
$link.Arguments = '/c "f:\Claude code test\start-server.bat"'
$link.WindowStyle = 7
$link.WorkingDirectory = 'f:\Claude code test'
$link.Save()
Write-Host "✅ 开机自启设置成功"
Write-Host "   下次开机自动启动仪表盘"
Write-Host "   快捷方式: $shortcut"
