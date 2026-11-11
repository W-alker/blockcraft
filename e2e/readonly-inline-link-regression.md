# 只读正文链接单击回归

## 行为范围

整篇文档 `doc.isReadonly` 为 true 时，行内文字链接单击调用已有 `openLink` 回调。编辑模式仍单击显示工具栏、双击打开。仅块锁定不改变原行为。拖选、右键和双击后续事件不触发额外导航。链接格式和文档快照不变。

## 自动化资产

- `e2e/readonly-inline-link.spec.ts`：真实编辑器 DOM 的单击、右键、双击去重、拖选、只读动态切换、快照导出重建与正文不变。
- `packages/editor/plugins/inline-link-extension/index.spec.ts`：原链接编辑/工具栏逻辑，加上只读导航、失效块、选区保护与监听清理。
- CSES App 的 `src/pages/docs/editor/__tests__/open-link-in-docs-window.test.ts`：原宿主文档/历史版本/附件/段落定位和外链协议。

## Tauri 手工验收（待执行）

前置：发布包含本修复的 BlockCraft 版本并更新 CSES 依赖，打开真实 Tauri 客户端。当前 CSES 安装的 0.11.22 尚不包含源码改动。

1. 在可编辑文档放入外部网址、另一篇文档链接、同文档段落链接和历史版本链接，保存并重新打开。
2. 切换到只读，分别单击上述链接：外链走系统打开、内部文档走现有预览/窗口、同文档段落原地定位、历史版本走原有页面。每次只触发一次。
3. 双击只触发一次；右键不跳转；从链接内部拖选文字可复制且不跳转。
4. 切回编辑模式：单击显示工具栏、双击跳转，编辑/复制/解绑仍可用。仅锁定一个块时保留原交互。
5. 打开历史版本阅读器和文档预览侧栏，确认只读单击一致生效。
6. 关闭重开文档后重复单击，确认没有重复打开或监听残留；macOS 与 Windows 各验收一次。

浏览器 fixture 的快照重建不等价于真实服务保存重开，浏览器测试不替代 Tauri 验收。此任务不发布、不升级依赖、不修改版本号。

## 本轮结果（2026-10-19）

- Chrome、Firefox、WebKit 各 4 项浏览器用例通过，共 12 项。Chrome 使用 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`；首次默认 Chromium 启动因缺少 1228 浏览器包失败，随后本机 Chrome 补测通过。
- `pnpm exec ng test editor --watch=false --browsers=ChromeHeadless --include=packages/editor/plugins/inline-link-extension/index.spec.ts`：10 项通过，含 Angular 测试编译。
- CSES `yarn test --runInBand --runTestsByPath src/pages/docs/editor/__tests__/open-link-in-docs-window.test.ts`：13 项通过。
- `git diff --check` 通过。真实 Tauri、真实服务保存重开、Windows 桌面尚未验收；未发布及更新 CSES 依赖。
