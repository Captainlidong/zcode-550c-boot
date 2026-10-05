@echo off
rem 550c-boot app launch splash: plays the animation, then launcher.vbs starts ZCode.
rem Batch files must stay ASCII-only: cmd parses them in the ANSI codepage (GBK here).
chcp 65001 >nul
title 550C BOOT
rem Self-maximize the hosting console window (no-op when Windows Terminal ignores it).
powershell -NoProfile -Command "Add-Type -MemberDefinition '[DllImport(\"kernel32.dll\")]public static extern IntPtr GetConsoleWindow();[DllImport(\"user32.dll\")]public static extern bool ShowWindow(IntPtr h,int n);' -Name U -Namespace W;[W.U]::ShowWindow([W.U]::GetConsoleWindow(),3)" >nul 2>&1
node "%~dp0launch-splash.mjs"
