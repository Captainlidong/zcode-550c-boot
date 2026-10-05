---
description: 播放 550C 开机动画(网页完整版),或切换开机动画模式与配色
argument-hint: "[off|simple|full] [amber|green|cyan|white] | test"
---

# 550C 开机动画

用户参数:`$ARGUMENTS`(可为空)。

## 准备:定位控制器

读取设置文件 `~/.zcode/550c-boot.json`(Windows 即 `%USERPROFILE%\.zcode\550c-boot.json`),取 `pluginRoot` 字段。若该文件不存在或没有 `pluginRoot`,用 Glob 在 `%USERPROFILE%\.zcode\cli\plugins\cache` 下搜索 `**/550c-boot/scripts/boot.mjs` 定位安装目录。

下文把 `<pluginRoot>/scripts/boot.mjs` 简称为 **boot**。所有命令用 `node "<boot>" …` 运行(路径含空格,必须加引号)。

## 按参数执行

1. **无参数** → `node "<boot>" play`:用 Edge/Chrome app 窗口播放 1:1 完整网页版动画(约 16 秒剧情,播完淡出,窗口需手动关闭)。
2. `off` / `simple` / `full` → `node "<boot>" set mode <值>`:设置**打开 ZCode 时**的开机动画——off = 直接进界面不播;simple ≈ 5 秒(默认);full ≈ 13 秒。设置写入后**下次启动 ZCode 生效**(启动器在 `%USERPROFILE%\.zcode\550c-boot\`)。
3. `amber` / `green` / `cyan` / `white` → `node "<boot>" set scheme <值>`:配色,开机动画与网页版共用。
4. `test` → `node "<boot>" play --ansi`:在当前终端直接播放 ANSI 动画(任意键跳过)。

参数是组合时按出现顺序依次执行(例如 `full green` 先 `set mode full` 再 `set scheme green`)。

## 汇报

全部执行完后运行 `node "<boot>" status`,用一两句话汇报变更结果和当前设置,不要输出大段说明。
