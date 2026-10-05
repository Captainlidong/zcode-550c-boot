#!/usr/bin/env node
/**
 * 550c-boot — 终端 ANSI 磷光版开机动画(ZCode 移植,v3 剧情增强版)。
 *
 * 用法: node boot-ansi.mjs [simple|full] [amber|green|cyan|white]
 *   simple  约 5 秒:块艺术「550C」逐行点亮 + 状态行 + 快速覆写 + 收尾
 *   full    约 19 秒完整剧情:开机大 logo → 面板展开 → 授权窗 → 链路监视(实时波形)
 *           → 信号污染警告 → 旁路注入进度 → 47 节点无人机矩阵覆写(异常弹窗)
 *           → 覆写总结 → 紧急停机确认 → 满屏 REWRITTEN 收尾
 *
 * 任意按键跳过;零依赖;需要 TTY(由 launcher/boot.mjs 在终端窗口中运行)。
 * 视觉母本:Voidpoket 的 550C 片头(经 yannicksong0106/dsh-550c-boot 移植,MIT)。
 */
import readline from "node:readline";
import fs from "node:fs";
import path from "node:path";

/* ── 输出与 TTY 门卫 ────────────────────────────────────────────────────── */
const out = process.stdout;
const colorDepth = typeof out.getColorDepth === "function" ? out.getColorDepth() : 4;

if (!out.isTTY && !process.argv.some(a => a.startsWith("--snapshot="))) {
  // stdout 不是终端(被管道捕获)时绝不动手——hook 场景的 stdout 是严格 JSON 通道。
  process.stderr.write("550c-boot: 需要 TTY。请通过 /550c-boot 或 boot.mjs 启动。\n");
  process.exit(0);
}

/* ── 配色(与 assets/550C.html 的 data-scheme 同源)────────────────────── */
const SCHEMES = {
  amber: { base: "#e8a020", lit: "#ffc043", dim: "#8a7248", faint: "#4a3f28", red: "#e05030", ok: "#b8c840", cyan: "#4fd1c5" },
  green: { base: "#4ad46a", lit: "#a6ffbb", dim: "#4e8a5e", faint: "#27452f", red: "#ff7043", ok: "#a6ffbb", cyan: "#7fe0d0" },
  cyan:  { base: "#3fc8dc", lit: "#a6f0ff", dim: "#4d8291", faint: "#26454e", red: "#ff5c7a", ok: "#7ff0d0", cyan: "#a6f0ff" },
  white: { base: "#c9c9c9", lit: "#ffffff", dim: "#7a7a7a", faint: "#3d3d3d", red: "#ff5a5a", ok: "#dcdcdc", cyan: "#d0d0d0" },
};

/* ── ANSI 工具 ──────────────────────────────────────────────────────────── */
const ESC = "\x1b[";
const RESET = `${ESC}0m`;
const HIDE = `${ESC}?25l`, SHOW = `${ESC}?25h`, CLEAR = `${ESC}2J`, HOME = `${ESC}H`, CLR_EOL = `${ESC}0J`;
const TITLE = `${ESC}]0;550C BOOT\x07`;

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function hexToAnsi256(hex) {
  const [r, g, b] = hexToRgb(hex);
  if (r === g && g === b) {
    if (r < 8) return 16;
    if (r > 248) return 231;
    return Math.round(((r - 8) / 247) * 24) + 232;
  }
  const c = v => (v < 48 ? 0 : v < 115 ? 1 : Math.round((v - 35) / 40));
  return 16 + 36 * c(r) + 6 * c(g) + c(b);
}
function fg(color) {
  if (colorDepth >= 24) { const [r, g, b] = hexToRgb(color); return `${ESC}38;2;${r};${g};${b}m`; }
  return `${ESC}38;5;${hexToAnsi256(color)}m`;
}

const argv = process.argv.slice(2).filter(a => !a.startsWith("-"));
const MODE = ["simple", "full"].includes(argv[0]) ? argv[0] : "simple";
const SCHEME = SCHEMES[argv[1]] ? argv[1] : "amber";
const C = SCHEMES[SCHEME];

/* ── 画布与宽度 ─────────────────────────────────────────────────────────── */
let COLS = Math.min(Math.max(out.columns || 80, 64), 200);
let ROWS = Math.min(Math.max(out.rows || 24, 20), 50);
const sizeArg = process.argv.find(a => a.startsWith("--size="));
if (sizeArg) {
  const [c, r] = sizeArg.slice(7).split("x").map(Number);
  if (c > 0 && r > 0) { COLS = c; ROWS = r; }
}
/* 块/框字符(█░▀▄▌▐ ▁▂▃… 等)宽度随终端字体而变:Windows Terminal 单宽,
 * 中文 conhost(GBK 字体)双宽——按环境探测,保证两边布局一致。 */
const WT_SESSION = !!process.env.WT_SESSION || !!process.env.WT_PROFILE_ID;
/* CSI 序列以字母结尾(含 SGR-m / 光标-J/K/H),统一按转义处理,不计可见宽度 */
const CSI_RE = /\x1b\[[0-9;]*[A-Za-z]/g;
const glyphW = ch => {
  const cp = ch.codePointAt(0);
  if (cp >= 0x2500 && cp <= 0x259F) return WT_SESSION ? 1 : 2;
  return cp > 0xFF ? 2 : 1;
};
const bare = s => s.replace(CSI_RE, "");
const vw = s => [...bare(s)].reduce((w, ch) => w + glyphW(ch), 0);
const clip = (s, n = COLS) => {
  let w = 0, o = "", inEsc = false;
  for (const ch of String(s)) {
    if (inEsc) { o += ch; if (/[A-Za-z]/.test(ch)) inEsc = false; continue; }
    if (ch === "\x1b") { inEsc = true; o += ch; continue; }
    const cw = glyphW(ch);
    if (w + cw > n) break;
    w += cw; o += ch;
  }
  return o;
};
const pad = (s, n) => s + " ".repeat(Math.max(0, n - vw(s)));
const padL = (s, n) => " ".repeat(Math.max(0, n - vw(s))) + s;
const padC = (s, n) => { const l = Math.max(0, n - vw(s)); return " ".repeat(Math.floor(l / 2)) + s + " ".repeat(Math.ceil(l / 2)); };
const border = (cornerL, cornerR, label, width, color) => {
  const col = color || C.base;
  const inner = width - 2 - (label ? vw(label) + 2 : 0);
  return fg(col) + cornerL + (label ? " " + label + " " : "") + "-".repeat(Math.max(0, inner)) + cornerR + RESET;
};

/* ── 块艺术字库(on=█ 亮纹 / off=░ 暗纹)───────────────────────────────── */
const GLYPHS = {
  "5": ["███████", "█░░░░░░", "███████", "░░░░░░█", "█░░░░░█", "░█████░"],
  "0": ["░█████░", "██░░░██", "██░░░██", "██░░░██", "██░░░██", "░█████░"],
  "C": ["░██████", "█░░░░░░", "█░░░░░░", "█░░░░░░", "█░░░░░░", "░██████"],
  "S": ["███████", "█░░░░░░", "███████", "░░░░░░█", "░░░░░░█", "███████"],
  "Y": ["█░░░░░█", "█░░░░░█", "░█████░", "░░░█░░░", "░░░█░░░", "░░░█░░░"],
  "T": ["███████", "░░░█░░░", "░░░█░░░", "░░░█░░░", "░░░█░░░", "░░░█░░░"],
  "E": ["███████", "█░░░░░░", "██████░", "█░░░░░░", "█░░░░░░", "███████"],
  "M": ["█░░░░░█", "██░░░██", "███░███", "█░█░█░█", "█░░░░░█", "█░░░░░█"],
  "I": ["█████", "░░█░░", "░░█░░", "░░█░░", "░░█░░", "█████"],
  "R": ["██████░", "█░░░███", "█░░░░░█", "██████░", "█░░░█░░", "█░░░░█░"],
  "W": ["█░░░░░█", "█░░░░░█", "█░░░░░█", "█░█░█░█", "███░███", "█░░░░░█"],
  "N": ["█░░░░░█", "██░░░░█", "███░░░█", "█░██░░█", "█░░██░█", "█░░░███"],
};
const BANNER_ROWS = 6;
const bannerRow = r => ["5", "5", "0", "C"]
  .map(g => WT_SESSION ? [...GLYPHS[g][r]].map(c => c === " " ? "  " : c.repeat(2)).join("") : GLYPHS[g][r])
  .join(WT_SESSION ? "    " : "  ");
function colorizeRow(row) {
  let s = "", run = row[0], i = 1;
  const flush = () => { s += fg(run[0] === "█" ? C.lit : C.faint) + run; };
  while (i <= row.length) {
    const ch = row[i];
    if (ch && (ch === "█") === (run[0] === "█")) run += ch;
    else { flush(); run = ch ?? ""; }
    i++;
  }
  return s + RESET;
}
const blockWord = text => {
  const rows = [];
  for (let r = 0; r < BANNER_ROWS; r++) {
    rows.push([...text.toUpperCase()].map(g => {
      const cell = GLYPHS[g] ? GLYPHS[g][r] : "   ";
      return WT_SESSION ? [...cell].map(c => c === " " ? "  " : c.repeat(2)).join("") : cell;
    }).join(WT_SESSION ? "    " : "  "));
  }
  return rows;
};

/* ── 素材 ───────────────────────────────────────────────────────────────── */
const LOGO = "◢ 550C // UAV-BS-07";
const BOOT_TEXT = "550C SYSTEM BOOT";
const NODE_COUNT = 47;
const LOG_SCHEDULE = [
  [2600, "[550C] 核心在线。", "base"],
  [2900, "[550C] 量子单元温度 4.2K,经典控制单元就绪。", "base"],
  [3200, "[550C] 检测到无人机集群失控。", "base"],
  [3500, "[550C] 链路污染:是。非法根证书:存在。", "base"],
  [3800, "[550C] 任务队列:异常。安全围栏:被绕过。", "base"],
  [4100, "[550C] 等待技术人员授权。", "lit"],
  [4300, "> 550C,授权接入 UAV-BS-07 基站。", "ok"],
  [4700, "[550C] 授权确认。目标锁定:UAV-BS-07。", "base"],
  [5000, "[550C-INFER] 信号捕获:n78 / n79 双频段。", "dim"],
  [5300, "[550C-INFER] PCI 207 · TAC 4172 · Cell 0x5A3F。", "dim"],
  [5600, "[550C-INFER] 链路加密 AES-256-GCM,密钥轮换 200ms。", "dim"],
  [5900, "[550C-INFER] 任务队列同步异常,检测到:", "dim"],
  [6100, "    MAV_CMD_DO_FLIGHTTERMINATION (185) 注入", "faint"],
  [6300, "    NAV_LAND 篡改 · 根证书覆盖 · 集群锁死", "faint"],
  [6500, "[550C-INFER] 判断:基站调度层已被部分接管。", "dim"],
  [6800, "[550C-INFER] 时间窗口:T-00:03:41。", "dim"],
  [7000, "[550C] 建立备用核心网隧道 → BBU 维护口。", "base"],
  [7300, "[550C] 隧道建立成功。进入基带处理层。", "base"],
  [7600, "[FAIL] 鉴权失败 (Authentication Reject)。", "red"],
  [7900, "[550C] 切换旁路注入,写入 550C 临时根证书。", "lit"],
  [8500, "[550C] 鉴权旁路成功。获得调度核心写权限。", "base"],
  [9000, "[550C] 关闭上行网关,切断外部非法指令通道。", "base"],
  [9300, "[550C] 基站进入 550C 接管模式。", "base"],
  [9400, "[550C] 广播临时根证书 · 开始逐节点覆写。", "lit"],
  [10300, "[WARN] 节点 07 反抗,检测到恶意喂狗。", "red"],
  [10500, "[550C] 强制回滚至 SLOT_A,重新覆写。", "base"],
  [11600, "[WARN] 节点 23 证书校验失败 (NIA2)。", "red"],
  [11800, "[550C] 回滚出厂固件至 SLOT_B,重新注入。", "base"],
  [12400, "[550C] 已完成 24 / 47 节点覆写。", "ok"],
  [13600, "[550C] 全部节点覆写完成。", "ok"],
  [13850, "[550C] 逐节点 SHA-256 校验…… 47/47 ✔", "ok"],
  [14500, "[550C] 集群状态稳定。", "base"],
  [15100, "[550C] ! 执行紧急动力关闭程序。", "lit"],
  [15450, "[550C] ARM_DISARM (400) → 全部节点 ACK。", "base"],
  [15750, "[550C] 所有电机已 disarm,集群安全锁定。", "ok"],
  [16050, "[550C] 基站日志写入完成。结果:成功。", "base"],
];

/* ── 弹窗时间表(对照原版网页窗口)────────────────────────────────────── */
const POPUPS = [
  { id: "auth", kind: "normal", pos: "tr", w: 50, born: 2600, dies: 5000, title: "ACCESS AUTHORIZATION", icon: "▲",
    rows: [["OPERATOR", "TECHNICIAN-01", "ok"], ["CLEARANCE", "LEVEL-5 / ROOT", "ok"], ["TARGET", "UAV-BS-07", "red"], ["MODE", "OVERRIDE · FORCE", "lit"], ["SESSION", null, "base"]],
    note: "授权将授予 550C 对 UAV-BS-07 基站及所属无人机集群的完全控制权限。",
    buttons: ["DENY", "GRANT"], status: "AWAITING CONFIRM" },
  { id: "link", kind: "info", pos: "tl", w: 50, born: 4800, dies: 7200, title: "LINK MONITOR", icon: "◇",
    rows: [["CELL", "PCI 207 / 0x5A3F", "ok"], ["RRC", "CONNECTED", "ok"], ["CIPHER", "NEA2 · AES-256-GCM", "ok"], ["RTT", "2.4 ms", "base"]],
    extra: "wave", status: "TRACKING" },
  { id: "poll", kind: "danger", pos: "l", w: 54, born: 5800, dies: 7800, title: "SIGNAL POLLUTION", icon: "!",
    rows: [["FT-TERM", "185 · INJECTED", "red"], ["NAV_LAND", "TAMPERED", "red"], ["ROOT CA", "EXTERNAL OVERRIDE", "red"], ["CLUSTER", "LOCK PRESET", "red"]],
    note: "基站调度层已被失控方部分接管。建议立即执行覆写。",
    buttons: ["ACK"], status: "THREAT DETECTED" },
  { id: "bypass", kind: "danger", pos: "br", w: 50, born: 7000, dies: 9200, title: "AUTH BYPASS INJECTION", icon: "▶",
    rows: [["AKA", "REJECTED", "red"], ["BYPASS", "ENABLED", "lit"], ["ROOT CA", "550C-ROOT · STAGED", "lit"]],
    extra: "bypass", status: "BYPASS · ACTIVE" },
  { id: "ctrl", kind: "normal", pos: "l", y: 5, w: 44, born: 9400, dies: 13600, title: "OVERRIDE CONTROLLER", icon: "◆",
    rows: [["TARGET", "UAV-BS-07", "base"], ["NODES", "47", "lit"], ["STRATEGY", "FULL ERASE+WRITE", "base"], ["AUTH", "550C-ROOT", "ok"]],
    extra: "counter", status: "REWRITING · 47 NODES" },
  { id: "a07", kind: "danger", pos: "tr", w: 48, born: 10300, dies: 12500, title: "ANOMALY · UAV-07", icon: "!",
    rows: [["NODE", "UAV-07", "red"], ["FAULT", "WATCHDOG SPOOF", "red"], ["ACTION", "ROLLBACK · SLOT_A", "lit"]],
    log: ["wdg: illegal feed detected", "inject: force reset", "rollback -> SLOT_A"], status: "HANDLER ACTIVE" },
  { id: "a23", kind: "danger", pos: "bl", w: 48, born: 11600, dies: 13700, title: "ANOMALY · UAV-23", icon: "!",
    rows: [["NODE", "UAV-23", "red"], ["FAULT", "CERT VERIFY FAIL", "red"], ["ACTION", "ROLLBACK · SLOT_B", "lit"]],
    log: ["cert: verify sign fail", "rollback -> SLOT_B"], status: "HANDLER ACTIVE" },
  { id: "summary", kind: "normal", pos: "c", w: 46, born: 13700, dies: 15050, title: "OVERRIDE SUMMARY", icon: "√",
    big: ["47", " / 47 NODES SUCCESS"],
    rows: [["TOTAL", "47", "ok"], ["SUCCESS", "47", "ok"], ["ROLLBACK", "2", "lit"], ["ELAPSED", "T-00:01:28", "base"]],
    note: "所有节点固件覆写完成,已切换至 550C 安全飞控。",
    buttons: ["LOG", "PROCEED"], status: "COMPLETE" },
  { id: "disarm", kind: "danger", pos: "c", w: 50, born: 15100, dies: 16400, title: "EMERGENCY DISARM", icon: "!",
    big: ["47", " MOTORS WILL BE DISARMED"],
    rows: [["COMMAND", "ARM_DISARM (400)", "red"], ["PARAM1", "0 · DISARM", "red"], ["TARGET", "ALL NODES · 47", "lit"]],
    note: "紧急关车将切断所有无人机电机动力。此操作不可逆。",
    buttons: ["ABORT", "CONFIRM"], status: "CONFIRMATION REQUIRED" },
];

/* ── 时间轴(ms)─────────────────────────────────────────────────────── */
const SIMPLE = { logo: 1330, lines: 1500, prog: 1000, end: 1200 };
const FULL = {
  logo: 2000,                    // 开机大 logo(黑屏)
  panels: 2000,                  // 面板展开
  rwStart: 9400, rwEnd: 13600,   // 47 节点覆写
  finale: 16400,                 // 满屏 REWRITTEN
};
const TL = MODE === "simple" ? SIMPLE : FULL;
TL.total = MODE === "simple"
  ? TL.logo + TL.lines + TL.prog + TL.end
  : TL.finale + 3000;
const DUR = TL.total;
const STAGES = [[2600, "BOOT"], [4800, "AUTH"], [7000, "LINK"], [9200, "TUNNEL"], [9400, "ISOLATE"], [13600, "REWRITE"], [15100, "VERIFY"], [16400, "DISARM"], [TL.finale, "COMPLETE"]];

/* ── 状态 ───────────────────────────────────────────────────────────────── */
let skipped = false;
const logLines = [];                 // { t, k }
const flags = { w07: false, w23: false, n12: 0 };
const nodeState = [];                // L=LOST W=WRITE O=ONLINE R=异常
for (let i = 0; i < NODE_COUNT; i++) nodeState.push("L");
let progress = 0, nodeLabel = "00 / 47", stage = MODE === "simple" ? "BOOT" : "BOOT", net = "OFFLINE";
const session = "0x" + Math.floor(Math.random() * 0xffffffff).toString(16).toUpperCase().padStart(8, "0");
let logCursor = 0;

function stageAt(t) { let s = "BOOT"; for (const [tm, name] of STAGES) if (t >= tm) s = name; return s; }
function activePopups(t) { return POPUPS.filter(p => t >= p.born && t < p.dies); }

function tick(elapsed) {
  const t = elapsed;
  stage = stageAt(t);
  /* 日志推进 */
  while (logCursor < LOG_SCHEDULE.length && t >= LOG_SCHEDULE[logCursor][0]) {
    logLines.push({ t: LOG_SCHEDULE[logCursor][1], k: LOG_SCHEDULE[logCursor][2] });
    logCursor++;
  }
  if (MODE === "simple") {
    if (t > TL.logo + TL.lines) {
      progress = Math.min(100, ((t - TL.logo - TL.lines) / TL.prog) * 100);
      if (progress >= 100) stage = "COMPLETE";
    }
    return;
  }
  /* full:节点覆写 */
  if (t >= TL.rwStart && t < TL.rwEnd) {
    const n = Math.min(NODE_COUNT, Math.floor(((t - TL.rwStart) / (TL.rwEnd - TL.rwStart)) * NODE_COUNT));
    for (let i = 0; i < n; i++) {
      if ((i === 6 && n < 13) || (i === 22 && n < 29)) continue;
      nodeState[i] = "O";
    }
    for (let i = n; i < Math.min(n + 2, NODE_COUNT); i++) nodeState[i] = "W";
    if (n > 7 && !flags.w07) { flags.w07 = true; nodeState[6] = "R"; }
    if (n > 23 && !flags.w23) { flags.w23 = true; nodeState[22] = "R"; }
    if (n >= 12 && n % 12 === 0 && flags.n12 < n) flags.n12 = n;
    progress = (n / NODE_COUNT) * 100;
    nodeLabel = String(n).padStart(2, "0") + " / " + NODE_COUNT;
    net = "ISOLATED";
  } else if (t >= TL.rwEnd) {
    for (let i = 0; i < NODE_COUNT; i++) nodeState[i] = "O";
    progress = 100;
    nodeLabel = "47 / 47";
    net = "550C";
  }
}

/* ── 渲染小件 ───────────────────────────────────────────────────────────── */
function bar(p, width) {
  const filled = Math.round((p / 100) * width);
  return fg(C.dim) + "[" + fg(C.lit) + "█".repeat(filled) + fg(C.faint) + "░".repeat(width - filled) + fg(C.dim) + "]" + RESET;
}
const WAVE = "▁▂▃▄▅▆▇█";
function waveBars(width, t) {
  const step = Math.floor(t / 130);
  let s = "";
  for (let i = 0; i < width; i++) {
    const h = Math.abs(Math.sin(i * 12.9898 + step * 78.233) * 43758.5453) % 1;
    s += WAVE[Math.floor(h * 7.99)];
  }
  return fg(C.cyan) + s + RESET;
}
function nodeCell(i) {
  const s = nodeState[i];
  const blink = Math.floor(performance.now() / 200) % 2 === 0;
  const color = s === "O" ? C.ok : s === "W" ? (blink ? C.lit : C.base) : s === "R" ? C.red : C.faint;
  const mark = s === "O" ? "+" : s === "W" ? ">" : s === "R" ? "X" : ".";
  return fg(color) + "U" + String(i + 1).padStart(2, "0") + mark + RESET;
}
const DRONE = ["o-o", "-X-", "o-o"];
function droneCell(i, t) {
  const s = nodeState[i];
  const blink = Math.floor(t / 200) % 2 === 0;
  const color = s === "O" ? C.ok : s === "W" ? (blink ? C.lit : C.base) : s === "R" ? C.red : C.faint;
  return DRONE.map(l => fg(color) + l + RESET);
}

/* ── 弹窗渲染 ───────────────────────────────────────────────────────────── */
const kindColor = k => (k === "danger" ? C.red : k === "info" ? C.cyan : C.base);
function popupBox(p, t) {
  const col = kindColor(p.kind);
  const w = Math.min(p.w, COLS - 8);
  const inner = w - 2;
  const lines = [];
  lines.push(border("+", "+", p.icon + " " + p.title, w, col));
  if (p.kind === "danger") lines.push("| " + fg(C.red) + Array(Math.ceil((inner - 2) / 2)).fill("! ").join("").trimEnd() + RESET + " |");
  if (p.big) lines.push("| " + fg(col === C.red ? C.red : C.lit) + padL(p.big[0], 2) + fg(C.dim) + p.big[1] + RESET + " |");
  for (const [k, v, ck] of p.rows) {
    const val = v === null ? session : v;
    lines.push("| " + fg(C.faint) + pad(k, 11) + fg(C[ck]) + padL(clip(val, inner - 14), inner - 13) + " " + RESET + "|");
  }
  if (p.extra === "wave") {
    lines.push("| " + fg(C.faint) + "RSRP TRACE" + RESET + " |");
    lines.push("| " + waveBars(inner - 2, t) + " |");
  }
  if (p.extra === "bypass") {
    const bp = Math.min(100, ((t - p.born) / (p.dies - p.born)) * 115);
    lines.push("| " + fg(C.faint) + "INJECTION " + bar(bp, inner - 22) + fg(C.lit) + padL(Math.round(bp) + "%", 5) + RESET + " |");
  }
  if (p.extra === "counter") {
    const n = Math.min(NODE_COUNT, Math.floor(((t - TL.rwStart) / (TL.rwEnd - TL.rwStart)) * NODE_COUNT));
    lines.push("| " + fg(C.lit) + padL(String(n), 3) + fg(C.dim) + " / " + NODE_COUNT + " NODES  " + bar((n / NODE_COUNT) * 100, inner - 20) + RESET + " |");
  }
  if (p.log) for (const l of p.log) lines.push("| " + fg(C.dim) + clip(l, inner - 2) + RESET + " |");
  if (p.note) lines.push("| " + fg(C.dim) + clip(p.note, inner - 2) + RESET + " |");
  if (p.buttons) {
    const btns = p.buttons.map((b, i) => i === p.buttons.length - 1
      ? RESET + ESC + "7m" + fg("#000000") + ` ${b} ` + RESET + fg(col)
      : fg(col) + `[ ${b} ]`).join("   ");
    lines.push("| " + padL(btns, inner) + " |");
  }
  const clock = new Date().toTimeString().slice(0, 8);
  lines.push("| " + fg(C.faint) + pad(clip(p.status, inner - 10), inner - 9) + padL(clock, 8) + " " + RESET + "|");
  lines.push(border("+", "+", "", w, col));
  return lines.map(l => pad(l, w));
}
function popupPos(p, h) {
  const w = Math.min(p.w, COLS - 8);
  switch (p.pos) {
    case "tr": return { x: COLS - w - 2, y: 1 };
    case "tl": return { x: 2, y: 1 };
    case "l": return { x: 2, y: p.y ?? Math.floor(ROWS / 4) };
    case "bl": return { x: 2, y: Math.max(2, ROWS - 4 - h) };
    case "br": return { x: COLS - w - 2, y: Math.max(2, ROWS - 4 - h) };
    default: return { x: Math.floor((COLS - w) / 2), y: Math.max(2, Math.floor((ROWS - h) / 2) - 2) };
  }
}
/* 视觉列切片:保留 ANSI 序列,按可见宽度取 [start,end) */
function sliceVisual(s, start, end = Infinity) {
  let outStr = "", w = 0, esc = "", inEsc = false, started = false;
  for (const ch of s) {
    if (inEsc) { esc += ch; if (/[A-Za-z]/.test(ch)) { outStr += esc; esc = ""; inEsc = false; } continue; }
    if (ch === "\x1b") { inEsc = true; esc = ch; continue; }
    const cw = glyphW(ch);
    if (!started && w + cw <= start) { w += cw; continue; }
    started = true;
    if (w + cw > end) break;
    outStr += ch; w += cw;
  }
  return outStr;
}
function overlay(rows, x, y, box) {
  while (rows.length < y + box.length) rows.push("");
  for (let i = 0; i < box.length; i++) {
    const target = rows[y + i] ?? "";
    rows[y + i] = sliceVisual(target, 0, x) + box[i] + sliceVisual(target, x + vw(box[i])) + RESET;
  }
}

/* ── 帧渲染 ─────────────────────────────────────────────────────────────── */
function frame(elapsed) {
  const lines = [];
  const blink = Math.floor(elapsed / 500) % 2 === 0;
  const clock = new Date().toTimeString().slice(0, 8);

  /* 开机大 logo(黑屏,无 HUD)── 图三 */
  if (MODE === "full" && elapsed < TL.panels) {
    const perRow = TL.logo / (BANNER_ROWS + 1);
    const shownRows = Math.min(BANNER_ROWS, Math.floor(elapsed / perRow) + 1);
    const mid = Math.max(1, Math.floor((ROWS - 10) / 2));
    for (let i = 0; i < mid; i++) lines.push("");
    for (let r = 0; r < shownRows; r++) {
      let row = bannerRow(r);
      if (r === shownRows - 1 && shownRows < BANNER_ROWS) row += "  █";
      lines.push(padC(colorizeRow(row), COLS) + CLR_EOL);
    }
    if (shownRows >= BANNER_ROWS) {
      lines.push("");
      lines.push(fg(C.dim) + padC([...BOOT_TEXT].join(" "), COLS) + (blink ? "" : "") + RESET + CLR_EOL);
    }
    return lines.join("\n") + RESET;
  }

  /* 满屏收尾 ── SYSTEM IS REWRITTEN */
  if (MODE === "full" && elapsed >= TL.finale) {
    const t2 = elapsed - TL.finale;
    lines.push("");
    lines.push(fg(C.dim) + padC([...("SYSTEM IS")].join(" "), COLS) + RESET + CLR_EOL);
    lines.push("");
    const art = blockWord("REWRITTEN");
    const litNow = Math.floor(t2 / 320) % 2 === 0;
    for (const row of art) lines.push(padC(litNow ? colorizeRow(row) : colorizeRow(row).split(fg(C.lit)).join(fg(C.base)), COLS) + CLR_EOL);
    lines.push("");
    lines.push(fg(C.faint) + padC("UAV-BS-07 · SWARM SECURE · CH 07", COLS) + RESET + CLR_EOL);
    return lines.join("\n") + RESET;
  }

  /* 顶部 HUD */
  const rec = blink ? fg(C.red) + "● REC" + RESET : fg(C.faint) + "○ REC" + RESET;
  lines.push(" " + fg(C.base) + LOGO + "  " + fg(C.faint) + "│ " + fg(C.dim) + "MODE " + fg(C.base) + "OVERRIDE"
    + "  " + fg(C.dim) + "SESSION " + fg(C.base) + session
    + "  " + fg(C.dim) + "TIME " + fg(C.base) + clock + "  " + rec + RESET + CLR_EOL);

  if (MODE === "simple") {
    const perRow = TL.logo / BANNER_ROWS;
    const shownRows = Math.min(BANNER_ROWS, Math.floor(elapsed / perRow) + 1);
    const mid = Math.max(1, Math.floor((ROWS - 13) / 2));
    for (let i = 0; i < mid; i++) lines.push("");
    for (let r = 0; r < shownRows; r++) {
      let row = bannerRow(r);
      if (r === shownRows - 1 && shownRows < BANNER_ROWS) row += "  █";
      lines.push(padC(colorizeRow(row), COLS) + CLR_EOL);
    }
    if (shownRows >= BANNER_ROWS) {
      lines.push("");
      lines.push(fg(C.base) + padC("// UAV-BS-07", COLS) + RESET + CLR_EOL);
      lines.push(fg(C.dim) + padC("MODE OVERRIDE · JURISDICTION CN-BJ-07 · " + BOOT_TEXT, COLS) + RESET + CLR_EOL);
    }
    if (elapsed > TL.logo + TL.lines) {
      lines.push(fg(C.dim) + padC("OVERRIDE " + bare(bar(progress, 14)) + " " + String(Math.round(progress)).padStart(3) + "%", COLS)
        .replace(bare(bar(progress, 14)), bar(progress, 14)) + RESET + CLR_EOL);
    }
    if (progress >= 100) {
      lines.push("");
      lines.push(fg(C.lit) + padC("═══ SYSTEM IS REWRITTEN ═══", COLS) + RESET + CLR_EOL);
    }
    lines.push(fg(C.faint) + padC("— 550C BOOT · 按任意键跳过 —", COLS) + RESET + CLR_EOL);
  } else {
    /* 完整模式:左(遥测+无人机矩阵)右(核心终端)双面板 + 弹窗层 + 底部状态条 */
    const bodyRows = ROWS - 4;
    const droneMode = bodyRows >= 34;
    const LW = droneMode ? 37 : 27;
    const RW = COLS - LW;

    const left = [border("+", "+", "TELEMETRY / C-RAN", LW)];
    const tele = [
      ["BAND", "n78 / n79", "base"], ["BW", "100 MHz", "base"], ["MIMO", "4x4 DL", "base"],
      ["RRC", "CONNECTED", "ok"], ["CIPHER", "AES-256-GCM", "base"],
      ["RSRP", "-88 dBm", "base"], ["SINR", "22.4 dB", "base"],
      ["UPLINK", net === "550C" ? "550C-CTRL" : "SEVERED", net === "550C" ? "ok" : "red"],
      ["ROOT CA", net === "550C" ? "550C-ROOT" : "REPLACING", net === "550C" ? "ok" : "red"],
      ["NODES", nodeLabel, "base"],
    ];
    tele.slice(0, Math.max(3, bodyRows - 14)).forEach(([k, v, k2]) =>
      left.push(pad("| " + fg(C.faint) + pad(k, 8) + fg(C[k2]) + clip(v, LW - 12), LW) + fg(C.base) + "|" + RESET + CLR_EOL));

    if (droneMode) {
      /* 无人机矩阵:每行 6 架 × 3 行的 ASCII 四轴 */
      left.push(border("+", "+", "SWARM NODE MATRIX", LW));
      const per = Math.floor((LW - 4) / 5), rowsN = Math.ceil(NODE_COUNT / per);
      for (let r = 0; r < rowsN; r++) {
        const cells = [];
        for (let c = 0; c < per; c++) {
          const i = r * per + c;
          cells.push(i < NODE_COUNT ? droneCell(i, elapsed) : DRONE.map(() => ""));
        }
        for (let dl = 0; dl < 3; dl++) {
          let row = "| ";
          for (const cell of cells) row += cell[dl] + "  ";
          left.push(pad(clip(row, LW - 1), LW - 1) + fg(C.base) + "|" + RESET + CLR_EOL);
        }
      }
    } else {
      left.push(border("+", "+", "SWARM NODE MATRIX", LW));
      const NCOLS = 6, NROWS = Math.ceil(NODE_COUNT / NCOLS);
      for (let r = 0; r < NROWS; r++) {
        let row = "| ";
        for (let c = 0; c < NCOLS; c++) {
          const i = r * NCOLS + c;
          row += i < NODE_COUNT ? pad(nodeCell(i), 4) : " ".repeat(4);
        }
        left.push(pad(row, LW) + fg(C.base) + "|" + RESET + CLR_EOL);
      }
    }
    left.push(border("+", "+", "", LW));
    const teleShown = Math.min(tele.length, Math.max(3, bodyRows - 14));
    while (left.length < bodyRows) left.splice(1 + teleShown, 0, "|" + " ".repeat(LW - 2) + "|" + CLR_EOL);
    left.length = bodyRows;

    const right = [border("+", "+", "550C CORE TERMINAL · " + stage, RW)];
    const visible = logLines.slice(-Math.max(1, bodyRows - 3));
    visible.forEach(l => right.push(pad("| " + fg(C[l.k]) + clip(l.t, RW - 4), RW) + fg(C.base) + "|" + RESET + CLR_EOL));
    while (right.length < bodyRows - 1) right.push("|" + " ".repeat(RW - 2) + "|" + CLR_EOL);
    right.push(border("+", "+", "", RW));

    const merged = [];
    for (let i = 0; i < bodyRows; i++) merged.push((left[i] ?? "") + (right[i] ?? "") + CLR_EOL);

    /* 弹窗层(后画在上) */
    for (const p of activePopups(elapsed)) {
      const box = popupBox(p, elapsed);
      const { x, y } = popupPos(p, box.length);
      overlay(merged, x, y, box);
    }
    lines.push(...merged);

    lines.push("");
    lines.push(" " + fg(C.dim) + "OVERRIDE " + bar(progress, 12)
      + " " + fg(C.base) + padL(Math.round(progress) + "%", 4)
      + fg(C.dim) + "  NODE " + fg(C.base) + nodeLabel
      + fg(C.dim) + "  NET " + fg(net === "550C" ? C.ok : C.red) + net + RESET + CLR_EOL);
    lines.push(fg(C.faint) + padC("— 550C BOOT · 按任意键跳过 —", COLS) + RESET + CLR_EOL);
  }
  return lines.join("\n") + RESET;
}

/* ── 淡出、快照出口与主循环 ─────────────────────────────────────────────── */
function dimmed(body, k) {
  if (k > 0.66) return body;
  if (k > 0.33) return body.split(fg(C.lit)).join(fg(C.base)).split(fg(C.base)).join(fg(C.dim));
  return CLEAR;
}
function cleanup(code) {
  out.write(SHOW + RESET + CLEAR + HOME);
  try { if (process.stdin.isTTY) { process.stdin.setRawMode(false); process.stdin.pause(); } } catch (e) { /* 无 stdin */ }
  process.exit(code);
}

out.write(TITLE + HIDE + CLEAR + HOME);

/* --snapshot=<dir>:无 TTY 调试出口,把各时间点的帧渲染成纯文本后退出 */
const snapArg = process.argv.find(a => a.startsWith("--snapshot="));
if (snapArg) {
  const dir = path.resolve(snapArg.slice(11));
  fs.mkdirSync(dir, { recursive: true });
  const marks = MODE === "simple"
    ? [600, 1600, 2600, 3400, 4300, 5050]
    : [900, 1800, 3200, 4200, 5800, 7600, 8600, 11000, 12800, 14100, 15600, 17000, 19000];
  for (const t of marks) {
    tick(t);
    const text = bare(frame(t));
    fs.writeFileSync(path.join(dir, `frame-${String(Math.round(t)).padStart(5, "0")}.txt`), text);
  }
  cleanup(0);
}

const start = performance.now();
const timer = setInterval(() => {
  const elapsed = performance.now() - start;
  tick(elapsed);
  const body = frame(elapsed);
  out.write(HOME + (elapsed > DUR - 800 ? dimmed(body, (DUR - elapsed) / 800) : body));
  if (elapsed >= DUR || (skipped && elapsed > 400)) { clearInterval(timer); cleanup(0); }
}, 33);

if (process.stdin.isTTY) {
  try {
    process.stdin.setRawMode(true);
    readline.emitKeypressEvents(process.stdin);
    process.stdin.on("keypress", () => { skipped = true; });
    process.stdin.resume();
  } catch (e) { /* 无交互环境:自然播完 */ }
}
process.on("SIGINT", () => cleanup(0));
process.on("exit", () => { try { out.write(SHOW + RESET); } catch (e) { /* 退出路径尽力而为 */ } });
