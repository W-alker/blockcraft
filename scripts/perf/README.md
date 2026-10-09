# 粘贴异常组合符号性能基准

此基准对应未发布的 `pasteTextPolicy: remove-stacked-marks`。只对本次粘贴正文转化；Inline 方案及其旧基准已单独 stash。

```sh
node scripts/perf/paste-text-benchmark.mjs --prepare-only
node scripts/perf/paste-text-benchmark.mjs --prepared=/准备输出目录 --rounds=8 --chromium-executable="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --output=/绝对路径/report.json
```

准备阶段把当前源码冻结到临时目录，构建两份静态 Playground，依赖锁及其他源码相同；baseline 只把 `paste-text-safety.ts` 改为 identity/no-op，guarded 使用实际转化器。它衡量转化器的增量成本与转化后正文的排版成本，不代表已发布产品版本的对比。测量阶段不启动构建 watcher，顺序运行浏览器、交替运行两种版本。允许使用 `--browsers=chromium,firefox,webkit`、`--cases=normal-4k,normal-40k` 做定向复查。

每个样本新建独立 Doc，启用粘贴策略；源 Demo 保持未初始化，不加载演示正文与插件。普通正文为 4k、40k、40k / 256 格式，异常正文为用户样本片段重复后的 39,500 UTF-16 单位及对应 256 格式。记录粘贴同步派发、两帧后布局、真实键盘 `beforeinput` 到下一帧；严格检查存储正文、DOM、最终光标及键入结果。

每组一次预热、八次有效样本。P50/P95 为最近秩观察分位数；八次样本的 P95 等于最大值，不能当作线上 P95。预先设置普通正文粘贴／键入 P50 > baseline × 1.20 + 2ms 为复核提醒，保留所有异常结果，不调整阈值来消除提醒。

原始 JSON 保存所有样本、源码与脚本 hash、环境、浏览器版本、共同 bundle hash、失败和提醒。重用准备目录时检查 helper、ClipboardManager、DocConfig 源码 hash，防止用旧构建测新实现。

这是实际 Chromium / Firefox / WebKit 的局部编辑器证据。粘贴事件使用合成 ClipboardEvent，键盘事件由 Playwright 真实派发；不证明系统剪贴板、CSES 路由、协作后端、Tauri WebView 或线上性能。
