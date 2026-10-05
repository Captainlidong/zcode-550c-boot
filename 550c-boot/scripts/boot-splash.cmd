@echo off
rem 550c-boot terminal splash launcher, called by boot.mjs via "start" in a new console.
rem Batch files must stay ASCII-only: cmd parses them in the ANSI codepage (GBK here).
chcp 65001 >nul
title 550C BOOT
node "%~dp0boot-ansi.mjs" %*
