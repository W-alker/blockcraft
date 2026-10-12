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

## 文本内容自适应压测

```sh
node scripts/perf/text-fit-benchmark.mjs --prepare-only
node scripts/perf/text-fit-benchmark.mjs --prepared=/准备输出目录 --rounds=3 --browsers=chromium --chromium-executable="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --output=/绝对路径/text-fit.json
```

准备阶段冻结当前源码并构建一份关闭 source map 的开发版 Playground；测量阶段使用静态 HTTP，不启动构建 watcher。同一份构建仅切换 `textAutoFit`，比较固定尺寸与内容自适应；两种模式先校准相同的初始宽高。这不是修改前后版本对比，也不代表优化后的生产包性能。

- `mixed-1000` / `mixed-5000`：1,000 / 5,000 个根块，80% 普通段落、10% 文本框、10% 艺术字。
- `nested-100`：单个 `render-unit` 内包含 100 个文本对象，另有 200 个根段落。根虚拟化以整个容器为挂载单位，因此这个场景特意覆盖容器内部对象全部挂载的压力。
- 阶段：初始化、120 帧连续滚动及 40 次全文跳转、离屏改字、80 个真实键盘字符、全部对象批量改字、已挂载对象 12 次交替改宽度、1 秒静置。
- 初始化阶段仅计 `initBySnapshot` 与其后渲染，不含页面下载、Doc 构造和快照工厂；快照工厂耗时另存。批量改字/改宽通过正式 DocCRUD 事务派发，不模拟鼠标拖动。初始几何相同，内容变化后的自适应高度及可见块数量允许自然变化。
- 每轮创建独立 Doc / Y.Doc / 页面，显式启用根虚拟化、关闭预取，固定/自适应交替执行；默认每组一轮预热、三轮有效样本，串行运行浏览器。可用 `--browsers=firefox,webkit`、`--cases=mixed-5000,nested-100` 定向检查。
- 记录 RAF 间隔、长任务、自适应调用/写入/同步耗时、模型估高次数/耗时、挂载数量；Chromium 另外用 CDP 记录布局/样式耗时和次数。Firefox/WebKit 不支持的长任务指标为 `null`，不能当作零。键入延迟为 `beforeinput` 到第二帧，不是 INP。
- 原始 JSON 保留逐帧、逐次测量数据、环境、浏览器版本、源码/构建/脚本 hash 和所有失败。阶段帧间隔的 P95 只描述本次负载，不是线上 P95；少量重复样本不能推断总体分布。

测量使用真实 BlockCraft Doc、组件、Yjs 和输入路径；为隔离编辑器核心开销，宿主插件为空，Demo 正文不初始化。它不覆盖 CSES、Tauri、协作网络或业务插件。`--url=http://127.0.0.1:8087 --no-warmup --rounds=1` 仅供夹具预跑，正式比较应使用冻结的静态构建。
