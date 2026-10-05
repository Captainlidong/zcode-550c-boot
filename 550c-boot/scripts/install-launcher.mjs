#!/usr/bin/env node
/**
 * install-launcher.mjs — 一键安装"打开 ZCode 先播开机动画"的系统级启动器(仅 Windows)。
 *
 * 用法:
 *   node install-launcher.mjs "<ZCode.exe 的完整路径>" [--mode simple|full|off] [--scheme amber|green|cyan|white] [--retarget-shortcuts]
 *
 *   1. 把动画引擎与启动器文件复制到 %USERPROFILE%\.zcode\550c-boot\
 *   2. 按传入的 ZCode.exe 路径生成 launcher.vbs
 *   3. 写入 ~/.zcode/550c-boot.json(mode / scheme)
 *   4. --retarget-shortcuts:自动把桌面/开始菜单里指向该 exe 的快捷方式
 *      重定向到 launcher.vbs(原 .lnk 备份到 %USERPROFILE%\.zcode\550c-boot\backup\)
 *
 * 撤销:把 backup 里的 .lnk 复制回原位,删除 %USERPROFILE%\.zcode\550c-boot\ 即可。
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HOME = os.homedir();
const LAUNCH_DIR = path.join(HOME, ".zcode", "550c-boot");
const SETTINGS = path.join(HOME, ".zcode", "550c-boot.json");
const MODES = ["off", "simple", "full"];
const SCHEMES = ["amber", "green", "cyan", "white"];

const argv = process.argv.slice(2);
const flags = argv.filter(a => a.startsWith("--"));
const pos = argv.filter(a => !a.startsWith("--"));
const modeFlag = (flags.find(f => f.startsWith("--mode=")) || "").split("=")[1] || (MODES.includes(pos[1]) ? pos[1] : null);
const schemeFlag = (flags.find(f => f.startsWith("--scheme=")) || "").split("=")[1] || (SCHEMES.includes(pos[2]) ? pos[2] : null);
const retarget = flags.includes("--retarget-shortcuts");
const zcodeExe = pos[0];

if (process.platform !== "win32") {
  console.error("install-launcher 仅支持 Windows(开机动画依赖控制台窗口)。其他平台可直接使用 /550c-boot 的网页完整版。");
  process.exit(1);
}
if (!zcodeExe || !fs.existsSync(zcodeExe)) {
  console.error("用法: node install-launcher.mjs \"<ZCode.exe 完整路径>\" [--mode simple|full|off] [--scheme ...] [--retarget-shortcuts]");
  console.error("ZCode.exe 路径不存在。可在任务管理器 → 右键 ZCode → 打开文件所在位置 找到它。");
  process.exit(1);
}

/* 1. 目录与文件 */
fs.mkdirSync(LAUNCH_DIR, { recursive: true });
fs.mkdirSync(path.join(LAUNCH_DIR, "backup"), { recursive: true });
fs.copyFileSync(path.join(PLUGIN_ROOT, "scripts", "boot-ansi.mjs"), path.join(LAUNCH_DIR, "boot-ansi.mjs"));
for (const f of ["launch-splash.mjs", "splash.cmd", "launcher.vbs.template"]) {
  const src = path.join(PLUGIN_ROOT, "launcher", f);
  if (!fs.existsSync(src)) { console.error(`缺少 ${src}`); process.exit(1); }
  const dest = f === "launcher.vbs.template" ? "launcher.vbs" : f;
  fs.copyFileSync(src, path.join(LAUNCH_DIR, dest));
}
/* 生成 launcher.vbs:写入 ZCode.exe 真实路径 */
const vbsPath = path.join(LAUNCH_DIR, "launcher.vbs");
fs.writeFileSync(vbsPath, fs
  .readFileSync(vbsPath, "utf8")
  .replace(/__ZCODE_EXE__/g, zcodeExe.replace(/'/g, "''")));

/* 2. 设置 */
let settings = {};
try { settings = JSON.parse(fs.readFileSync(SETTINGS, "utf8")); } catch { /* 新文件 */ }
settings.mode = MODES.includes(modeFlag) ? modeFlag : (MODES.includes(settings.mode) ? settings.mode : "simple");
settings.scheme = SCHEMES.includes(schemeFlag) ? schemeFlag : (SCHEMES.includes(settings.scheme) ? settings.scheme : "amber");
settings.pluginRoot = PLUGIN_ROOT;
fs.mkdirSync(path.dirname(SETTINGS), { recursive: true });
fs.writeFileSync(SETTINGS, JSON.stringify(settings, null, 2) + "\n");

console.log(`✓ 启动器已安装到 ${LAUNCH_DIR}`);
console.log(`✓ 设置: mode=${settings.mode} scheme=${settings.scheme}`);

/* 3. 快捷方式重定向(可选) */
if (retarget) {
  const ps1 = path.join(LAUNCH_DIR, "retarget.ps1");
  fs.writeFileSync(ps1, `
$ErrorActionPreference = 'Stop'
$sh = New-Object -ComObject WScript.Shell
$exe = "${zcodeExe.replace(/'/g, "''")}"
$backup = "${LAUNCH_DIR.replace(/'/g, "''")}\\backup"
$dirs = @(
  [Environment]::GetFolderPath('Desktop'),
  [Environment]::GetFolderPath('CommonDesktopDirectory'),
  [Environment]::GetFolderPath('StartMenu'),
  [Environment]::GetFolderPath('CommonStartMenu')
)
foreach ($d in $dirs) {
  if (-not (Test-Path $d)) { continue }
  Get-ChildItem $d -Filter *.lnk -Recurse | ForEach-Object {
    $l = $sh.CreateShortcut($_.FullName)
    if ($l.TargetPath -ieq $exe) {
      Copy-Item $_.FullName (Join-Path $backup $_.Name) -Force
      $l.TargetPath = "${LAUNCH_DIR.replace(/'/g, "''")}\\launcher.vbs"
      $l.Arguments = ""
      $l.WorkingDirectory = Split-Path $exe
      $l.IconLocation = "$exe,0"
      $l.WindowStyle = 1
      $l.Description = "550C boot animation launcher"
      $l.Save()
      Write-Output ("RETARGETED " + $_.FullName)
    }
  }
}
Write-Output "DONE"
`);
  const r = spawnSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps1], { stdio: "inherit" });
  if (r.status !== 0) console.error("快捷方式重定向失败,可按 README 手动重定向。");
  fs.rmSync(ps1, { force: true });
} else {
  console.log("\n下一步:把桌面/开始菜单的 ZCode 快捷方式目标改为");
  console.log(`  ${vbsPath}`);
  console.log("(或重跑本脚本加 --retarget-shortcuts 自动完成;原始快捷方式会自动备份)");
}
console.log(`\n撤销:把 ${path.join(LAUNCH_DIR, "backup")} 里的 .lnk 复制回原位,删除 ${LAUNCH_DIR}。`);
