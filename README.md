# Blockcraft Monorepo

该仓库是新的正式工作区，所有后续重构都在这里完成。

## 结构

- `packages/editor`：编辑器源码与正式 npm 发版包
- `apps/playground`：Angular 20 playground
- `apps/docs`：文档站

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
