Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "C:\Users\sacal\Downloads\Klara Gestão"
WshShell.Run """C:\Program Files\nodejs\node.exe"" backend\\server.js", 0, False
