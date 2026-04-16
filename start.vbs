' The Forge — Silent Launcher
' Double-click this to start the app with no external windows
Set shell = CreateObject("WScript.Shell")
shell.CurrentDirectory = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
shell.Run "cmd /c npm run dev", 0, False
