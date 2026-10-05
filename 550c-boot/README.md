# 550C 开机动画 for ZCode

**打开 ZCode 时,先播放琥珀磷光 CRT 风格的 550C 开机动画,动画结束后再进入 ZCode 界面。**想看完整剧情时用 `/550c-boot` 在浏览器里播放 1:1 原版网页动画。

本插件是 [yannicksong0106/dsh-550c-boot](https://github.com/yannicksong0106/dsh-550c-boot)(DeepSeek Harness 版,MIT)向 ZCode 的移植。

## 工作原理

ZCode 的插件系统没有向客户端界面注入内容的能力,hooks 也只覆盖会话级事件,所以"应用启动瞬间"的效果由**操作系统级启动器**实现(v0.2.0 起不再使用会话 hook):

```
双击 ZCode 图标
  → 快捷方式指向 %USERPROFILE%\.zcode\550c-boot\launcher.vbs
  → 弹出最大化的终端窗口播放 ANSI 磷光动画
      simple ≈5 秒:块艺术「550C」逐行点亮 + 状态行 + 进度 + 收尾
      full   ≈19 秒:开机大 logo → 双面板 → 授权窗 → 链路监视(实时波形)
              → 信号污染警告 → 旁路注入进度 → 47 节点无人机矩阵覆写(异常弹窗)
              → 覆写总结 → 紧急停机确认 → 满屏块艺术 REWRITTEN 收尾
  → 动画结束、窗口自动关闭
  → 启动真正的 ZCode.exe
```

动画引擎读取 `~/.zcode/550c-boot.json` 的 `mode`(off/simple/full)与 `scheme`(amber/green/cyan/white),用 `/550c-boot` 修改后**下次启动生效**;`off` 时引导器直接启动 ZCode 不播动画(一键关闭)。

## /550c-boot 命令

| 用法 | 效果 |
|---|---|
| `/550c-boot` | 浏览器 app 窗口播放完整网页版(约 16 秒接管剧情) |
| `/550c-boot off` / `simple` / `full` | 切换开机动画模式(下次启动生效) |
| `/550c-boot green` / `cyan` / `white` / `amber` | 切换配色(开机动画与网页版共用) |
| `/550c-boot test` | 在当前终端直接播放 ANSI 动画(小窗口会自动退化为紧凑布局) |

## 撤销 / 修复

- **还原快捷方式**:把 `%USERPROFILE%\.zcode\550c-boot\backup\` 里的原始 `ZCode.lnk` 复制回桌面和开始菜单即可。
- **ZCode 升级后动画失效**:安装器可能重写开始菜单快捷方式,把 `backup` 之外再跑一次重定向即可(或让我重做)。
- 删除 `%USERPROFILE%\.zcode\550c-boot\` 目录 + 还原快捷方式 = 完全卸载开机动画。

## 文件结构

```
plugins/550c-boot/            本插件(命令 + 网页版动画资源)
~/.zcode/550c-boot/           应用启动器(launcher.vbs + splash.cmd + 动画引擎 + 原始快捷方式备份)
~/.zcode/550c-boot.json       设置(mode / scheme / pluginRoot)
```

## 已知限制

- 开机动画是弹出的终端窗口(ANSI 重写版),不是 ZCode 界面内的覆盖层——ZCode 插件系统做不到后者;完整视觉请用 `/550c-boot` 看网页 1:1 版。
- 若 ZCode 设置了开机自启(随 Windows 登录启动),走的是系统自启项而非快捷方式,不经过启动器,动画不会播。
- 终端动画需要支持 VT 序列的 conhost(Windows 10+ 默认满足),窗口过窄(<64 列)会截断布局;`node` 必须在 PATH 中,缺失时引导器会跳过动画直接启动 ZCode(不会卡住开机)。

## 致谢与许可

- 550C 片头动画与 HTML 原稿:**Voidpoket**([@Voidpoket](https://github.com/Voidpoket))
- DSH 插件工程(注入策略、enhance 配色方案、时间线):**Ziyang Song**([@yannicksong0106](https://github.com/yannicksong0106)),MIT
- ZCode 移植(ANSI 终端引擎、应用启动器、打包 shim):CaptainDong,MIT
