#!/usr/bin/env node
/**
 * 550c-boot 控制器(ZCode 移植)。
 *
 *   auto                     兼容入口(v0.2.0 起不再注册 SessionStart hook):静默;
 *                            mode=off 不播,否则经 start 弹终端窗口播 ANSI 动画。
 *   play [--web|--ansi] [mode] [scheme]
 *                            立即播放。--web(默认)用 Edge/Chrome app 窗口播放 1:1
 *                            网页完整版;--ansi 在当前终端直接播放动画。
 *   set mode <off|simple|full>
 *                            off/simple/full 同时控制应用启动器(~/.zcode/550c-boot)
 *                            的开机动画,下次启动 ZCode 生效。
 *   set scheme <amber|green|cyan|white>
 *   status                   输出当前设置(JSON)。
 *
 * 设置存放于 ~/.zcode/550c-boot.json;auto 只在值变化时回写 pluginRoot,供 /550c-boot 定位脚本。
 */
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SETTINGS = path.join(os.homedir(), ".zcode", "550c-boot.json");
const MODES = ["off", "simple", "full"];
const SCHEMES = ["amber", "green", "cyan", "white"];

/* ── 设置 ───────────────────────────────────────────────────────────────── */
function readSettings() {
  try { return JSON.parse(fs.readFileSync(SETTINGS, "utf8")); } catch { return {}; }
}
function writeSettings(s) {
  fs.mkdirSync(path.dirname(SETTINGS), { recursive: true });
  fs.writeFileSync(SETTINGS, JSON.stringify(s, null, 2) + "\n");
}
function settings() {
  const s = readSettings();
  return {
    mode: MODES.includes(s.mode) ? s.mode : "simple",
    scheme: SCHEMES.includes(s.scheme) ? s.scheme : "amber",
    pluginRoot: typeof s.pluginRoot === "string" ? s.pluginRoot : PLUGIN_ROOT,
  };
}
function persist(next) {
  const cur = readSettings();
  if (cur.mode !== next.mode || cur.scheme !== next.scheme || cur.pluginRoot !== next.pluginRoot) writeSettings(next);
}

/* ── auto:SessionStart 入口(全程静默,stdout 是严格 JSON 通道)────────── */
function auto() {
  try {
    const { mode, scheme } = settings();
    persist({ mode, scheme, pluginRoot: PLUGIN_ROOT });
    if (mode === "off") return;
    if (process.platform !== "win32") {
      // 非 Windows 无 start 弹窗,有 TTY 就前台播一下(桌面端 hook 通常无 TTY,自然跳过)
      if (process.stdout.isTTY) {
        spawn(process.execPath, [path.join(PLUGIN_ROOT, "scripts", "boot-ansi.mjs"), mode, scheme], { stdio: "inherit" });
      }
      return;
    }
    const scripts = path.join(PLUGIN_ROOT, "scripts");
    const inner = `start "" /D "${scripts}" boot-splash.cmd ${mode} ${scheme}`;
    const child = spawn("cmd.exe", ["/d", "/s", "/c", inner], {
      detached: true, stdio: "ignore", windowsHide: true, windowsVerbatimArguments: true,
    });
    child.unref();
  } catch { /* hook 静默失败:绝不动 stdout/stderr */ }
}

/* ── play --web:浏览器 app 窗口播放网页版 ──────────────────────────────── */
function webUrl(mode, scheme) {
  const u = new URL(pathToFileURL(path.join(PLUGIN_ROOT, "assets", "550C.html")));
  u.searchParams.set("mode", mode === "off" ? "full" : mode);
  if (scheme && scheme !== "amber") u.searchParams.set("scheme", scheme);
  return u.toString();
}
function openWeb(mode, scheme) {
  const url = webUrl(mode, scheme);
  if (process.platform === "win32") {
    const pf = process.env["ProgramFiles"] || "C:\\Program Files";
    const pf86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
    const exe = [
      path.join(pf86, "Microsoft", "Edge", "Application", "msedge.exe"),
      path.join(pf, "Microsoft", "Edge", "Application", "msedge.exe"),
      path.join(pf, "Google", "Chrome", "Application", "chrome.exe"),
      path.join(pf86, "Google", "Chrome", "Application", "chrome.exe"),
    ].find(p => fs.existsSync(p));
    if (exe) {
      spawn(exe, [`--app=${url}`, "--window-size=1040,720"], { detached: true, stdio: "ignore" }).unref();
      console.log(`550C 开机动画(${mode}/${scheme})已在浏览器 app 窗口打开:`);
    } else {
      spawn("cmd.exe", ["/d", "/s", "/c", `start "" "${url}"`], { detached: true, stdio: "ignore", windowsVerbatimArguments: true }).unref();
      console.log("550C 开机动画已在默认浏览器打开:");
    }
  } else {
    const opener = process.platform === "darwin" ? "open" : "xdg-open";
    spawn(opener, [url], { detached: true, stdio: "ignore" }).unref();
    console.log("550C 开机动画已在默认浏览器打开:");
  }
  console.log(url);
}

/* ── play --ansi:当前终端直接播放 ──────────────────────────────────────── */
function playAnsi(mode, scheme) {
  if (!process.stdout.isTTY) {
    console.error("550c-boot: 当前输出不是终端,无法播放。请在真实终端中运行,或用 play --web。");
    process.exit(1);
  }
  const child = spawn(process.execPath, [path.join(PLUGIN_ROOT, "scripts", "boot-ansi.mjs"), mode, scheme], { stdio: "inherit" });
  child.on("exit", code => process.exit(code ?? 0));
}

/* ── 命令分发 ───────────────────────────────────────────────────────────── */
const [cmd, ...rest] = process.argv.slice(2);
const cur = settings();

if (!cmd || cmd === "status") {
  console.log(JSON.stringify(cur, null, 2));
  console.error(`\n设置文件: ${SETTINGS}`);
  console.error("用法: boot.mjs auto | play [--web|--ansi] [mode] [scheme] | set mode <off|simple|full> | set scheme <amber|green|cyan|white>");
  process.exit(0);
}
if (cmd === "auto") { auto(); process.exit(0); }

if (cmd === "set") {
  const [key, value] = rest;
  if (key === "mode" && MODES.includes(value)) { persist({ ...cur, mode: value }); console.log(`启动模式 → ${value}`); }
  else if (key === "scheme" && SCHEMES.includes(value)) { persist({ ...cur, scheme: value }); console.log(`配色方案 → ${value}`); }
  else { console.error(`用法: set mode <${MODES.join("|")}> 或 set scheme <${SCHEMES.join("|")}>`); process.exit(1); }
  console.log(JSON.stringify(settings(), null, 2));
  process.exit(0);
}

if (cmd === "play") {
  const web = !rest.includes("--ansi");
  const flags = rest.filter(a => a.startsWith("--"));
  const pos = rest.filter(a => !a.startsWith("--"));
  const mode = MODES.includes(pos[0]) ? pos[0] : "full";
  const scheme = SCHEMES.includes(pos[1]) ? pos[1] : cur.scheme;
  if (web) openWeb(mode, scheme);
  else playAnsi(mode === "off" ? "simple" : mode, scheme);
  process.exit(0);
}

console.error(`未知命令: ${cmd}\n用法: boot.mjs auto | play | set | status`);
process.exit(1);
