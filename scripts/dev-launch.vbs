' M.AI0.1 — dev launcher
' Runs the PowerShell launch script hidden (no console window flash)
Dim root : root = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\") - 1)
root = Left(root, InStrRev(root, "\") - 1)  ' up one level from scripts\

Dim ps1 : ps1 = root & "\scripts\dev-launch.ps1"

Dim cmd : cmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & ps1 & """"

CreateObject("WScript.Shell").Run cmd, 0, False
