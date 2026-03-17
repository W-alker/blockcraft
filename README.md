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
