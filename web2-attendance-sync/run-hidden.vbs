' #Note: WEB2.0 - Chay chay-nen.bat AN cua so (khong hien console den).
' Duoc Task Scheduler goi khi dang nhap Windows. Tu resolve thu muc cua chinh no.
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
CreateObject("WScript.Shell").Run "cmd /c """ & dir & "\chay-nen.bat""", 0, False
