' N2Store Attendance Sync - Chay an tren Windows
' Double-click file nay de khoi dong service (khong hien cua so CMD)
' Copy shortcut vao shell:startup de tu khoi dong cung Windows

Set WshShell = CreateObject("WScript.Shell")
strPath = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = strPath
WshShell.Run "cmd /c node sync-service.js >> logs\service.log 2>&1", 0, False
