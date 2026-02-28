' N2Store Attendance Sync - Run hidden
Set WshShell = CreateObject("WScript.Shell")
strPath = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = strPath
WshShell.Run "cmd /c node sync-service.js >> logs\service.log 2>&1", 0, False
