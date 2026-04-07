# Blockcraft Monorepo

该仓库是新的正式工作区，所有后续重构都在这里完成。

## 结构

- `packages/editor`：编辑器源码与正式 npm 发版包
- `packages/editor/ai-skills`：**AI 技能包** —— 渐进式披露文档，用于 AI agent 与外部应用快速上手 BlockCraft（创建 plugin/block/embed/集成等），随 npm 包发布
- `apps/playground`：Angular 20 playground
- `apps/docs`：文档站

## AI 技能包

`packages/editor/ai-skills/` 是一份按 L0/L1/L2 渐进式披露组织的技能包，覆盖：
- 在宿主 Angular 应用中集成 BlockCraft（`blockcraft-app.md`）
- 创建 Plugin / Block / Inline Embed / Adapter / Toolbar
- Selection / Input / Inline / Event / Yjs 数据模型的深潜文档
- **版本适配**：`MIGRATIONS.md` 记录每个版本的破坏性变更与 before/after 迁移代码

外部消费者通过 `node_modules/@ccc/blockcraft/ai-skills/` 访问，或运行：
```bash
node node_modules/@ccc/blockcraft/ai-skills/install.mjs           # 安装到 ~/.claude/skills/
node node_modules/@ccc/blockcraft/ai-skills/install.mjs --target codex  # 安装到 ~/.agents/skills/
```
详情见 `packages/editor/ai-skills/README.md`。

> ⚠️ **贡献者注意**：任何对 `packages/editor/framework/`、`blocks/`、`plugins/` 等的架构性修改都**必须**在同一个 PR 中同步更新 ai-skills 文档并追加 `MIGRATIONS.md` 条目，同时按 severity 调整 `packages/editor/package.json` 的版本号。完整规则见 `CLAUDE.md` "文档同步规则" 章节。

## 启动

```bash
pnpm install
pnpm playground
```

## 构建

```bash
pnpm build:editor
pnpm build:playground
pnpm build:docs
```

## 编辑器发版

```bash
pnpm publish:editor
pnpm publish:editor:minor
pnpm publish:editor:major
pnpm cancel-publish:editor
pnpm unpublish:editor
```

- `pnpm publish:editor` 会先显示当前版本号，再在控制台里让你选择大版本 / 中版本 / 小版本，或直接输入精确版本号
- 编辑器 npm 包名固定为 `@ccc/blockcraft`
- 脚本会先构建 `dist/editor`，再固定发布到 `http://npm.runtongqiuben.com`
- `pnpm cancel-publish:editor` 和 `pnpm unpublish:editor` 等价
- `pnpm unpublish:editor` 默认撤销当前 `packages/editor/package.json` 对应版本的发版
- 指定版本可用 `pnpm unpublish:editor -- 0.1.31`
- 需要附加 npm 参数时可用 `pnpm publish:editor -- --tag beta`
- 撤销发版演练可用 `pnpm unpublish:editor -- --dry-run`
- 验证流程可用 `pnpm publish:editor -- --dry-run`，脚本会在结束后恢复版本文件
