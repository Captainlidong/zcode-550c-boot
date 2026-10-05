# 致谢 / Credits

## 550C 片头动画与 HTML 源码 —— Voidpoket

`assets/550C.html` 的动画主体是 **Voidpoket**（GitHub:
[@Voidpoket](https://github.com/Voidpoket)）创作的 550C 片头页面。本插件以
[yannicksong0106/dsh-550c-boot](https://github.com/yannicksong0106/dsh-550c-boot)
仓库归档的 `assets/550C-source.html` 为基准逐字保留，仅做定点改写并明确标注
`[zcode-shim]`：

- 追加 `<style data-zcode="schemes">`：把结构色提升为 CSS 变量并提供
  green / cyan / white 三个 opt-in 配色块（改写自原插件的 `src/enhance.js`，
  `:host` 作用域改为 `:root` / `html[data-scheme]`，略去 DSH 桌面标题栏令牌）；
- `bootUp()` 内一行：`simple` 模式跳过 `run()` 剧情只播 logo；
- 追加 `<script data-zcode="shim">`：解析 `?mode=` / `?scheme=`，simple 模式
  停留提示与关闭尝试，full 模式收尾后尝试自动关窗。

样式表、DOM 结构与动画时间线未做其他改动。

## DSH 插件工程 —— Ziyang Song

[yannicksong0106/dsh-550c-boot](https://github.com/yannicksong0106/dsh-550c-boot)
的插件工程（首帧注入、遮罩层挂载、enhance 配色方案、设置行）由
**Ziyang Song**（[@yannicksong0106](https://github.com/yannicksong0106)）编写，
MIT 许可。本插件的配色方案数据与「原稿逐字移植 + 定点改写」的移植纪律沿自该项目。

## ZCode 移植层 —— CaptainDong

- `scripts/boot-ansi.mjs`：终端 ANSI 磷光版动画引擎（琥珀/绿/青/白，与网页
  配色同源），视觉节点（logo、状态行、47 节点 SWARM、OVERRIDE 进度、
  SYSTEM IS REWRITTEN）取自上述原稿；
- `scripts/boot.mjs` / `boot-splash.cmd` / `hooks/hooks.json` /
  `commands/550c-boot.md`：ZCode 的 SessionStart hook 与斜杠命令接线。

## 依本文档之外的第三方

无运行时依赖；`node` 仅作为运行环境。
