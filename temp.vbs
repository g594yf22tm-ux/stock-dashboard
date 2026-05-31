
Set WshShell = WScript.CreateObject("WScript.Shell")
Set link = WshShell.CreateShortcut("C:\Users\AdministratorAppDataRoamingMicrosoftWindowsStart MenuProgramsStartupStockDashboard.lnk")
link.TargetPath = "cmd.exe"
link.Arguments = "/c "f:Claude code teststart-server.bat""
link.WindowStyle = 7
link.WorkingDirectory = "f:Claude code test"
link.Save()
