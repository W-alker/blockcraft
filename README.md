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
```

- `pnpm publish:editor` 默认自动升级 `packages/editor/package.json` 的补丁版本
- 脚本会先构建 `dist/editor`，再发布该目录里的 npm 包
- 需要附加 npm 参数时可用 `pnpm publish:editor -- --tag beta`
- 验证流程可用 `pnpm publish:editor -- --dry-run`，脚本会在结束后恢复版本文件
