#!/usr/bin/env node
/**
 * 550c-boot 应用启动动画:由 splash.cmd 在开机引导时调用。
 * 读取 ~/.zcode/550c-boot.json 的 mode/scheme,mode=off 时直接放行(不播动画)。
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SETTINGS = path.join(os.homedir(), ".zcode", "550c-boot.json");

let mode = "simple", scheme = "amber";
try {
  const s = JSON.parse(fs.readFileSync(SETTINGS, "utf8"));
  if (["off", "simple", "full"].includes(s.mode)) mode = s.mode;
  if (["amber", "green", "cyan", "white"].includes(s.scheme)) scheme = s.scheme;
} catch { /* 用默认值 */ }

if (mode === "off") process.exit(0);

const r = spawnSync(process.execPath, [path.join(HERE, "boot-ansi.mjs"), mode, scheme], { stdio: "inherit" });
process.exit(r.status ?? 0);
