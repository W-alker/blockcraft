---
name: blockcraft-editor
description: Use when building, extending, or embedding the BlockCraft block-based rich-text editor — creating Angular plugins, custom blocks (void/editable/container), inline embeds, HTML/Markdown adapters, toolbars, themes, or integrating BlockCraft into a host Angular app. Covers the framework's anchor/head selection model, IME pipeline, Yjs CRDT data layer, and DocPlugin/Schema/DocChain APIs.
---

# BlockCraft Editor — AI Skill Pack

> **AI discovery entry point.** This file exists so AI tools that scan for `SKILL.md` (Claude Code, Codex, etc.) can find this skill pack. Read this file first, then jump into the L0 router.
>
> Last updated: 2026-04-07

## What is BlockCraft?

A block-based rich-text editor built on **Angular 20 (standalone components) + Yjs (CRDT)**. Each document is a tree of typed blocks (paragraph, image, table, callout, …). It supports real-time collaboration, plugin extensibility, custom inline embeds, and HTML/Markdown round-trip via AST adapters.

Source repository: this package, `@ccc/blockcraft`. The skill pack ships inside `node_modules/@ccc/blockcraft/ai-skills/` when consumed via npm.

## How to Use This Skill Pack

The pack is organised as **three-level progressive disclosure**:

| Level | When to read | Files |
|-------|--------------|-------|
| **L0** | **Always read first** — overview + routing table | `blockcraft.md` |
| **L1** | After L0, pick one task guide for your specific work | `blockcraft-app.md`, `blockcraft-plugin.md`, `blockcraft-block.md`, `blockcraft-embed.md`, `blockcraft-adapter.md`, `blockcraft-toolbar.md`, `blockcraft-theme.md`, `blockcraft-debug.md`, `blockcraft-perf.md`, `blockcraft-test.md` |
| **L2** | Only when L1 isn't enough or you're touching framework internals | `blockcraft-selection.md`, `blockcraft-input.md`, `blockcraft-inline.md`, `blockcraft-event.md`, `blockcraft-data.md` |
| **Migration** | Whenever upgrading `@ccc/blockcraft` or before bumping its version | `MIGRATIONS.md` |

**Typical flow**:
1. Read **`blockcraft.md`** (L0) to get the mental model and find the right L1 file for your task.
2. Read the **L1 file** for your task — copy templates, follow the checklist.
3. Drop into an **L2 deep-dive** only if you need to understand or change the underlying mechanism.

> **Don't read every file.** A typical task only needs L0 + one L1. Loading the whole pack burns context for no gain.

## Task → File Cheat Sheet

| I want to… | Read this |
|------------|-----------|
| **Embed BlockCraft in my Angular app** | `blockcraft-app.md` |
| **Create a new editor plugin** | `blockcraft-plugin.md` |
| **Create a new block type (void/editable/container)** | `blockcraft-block.md` |
| **Create an inline embed (mention, link, latex, …)** | `blockcraft-embed.md` |
| **Add HTML or Markdown import/export for a block** | `blockcraft-adapter.md` |
| **Build a floating toolbar or popover** | `blockcraft-toolbar.md` |
| **Customise theme colors / typography** | `blockcraft-theme.md` |
| **Debug a data-flow / event / sync issue** | `blockcraft-debug.md` |
| **Optimise performance** | `blockcraft-perf.md` |
| **Write tests** | `blockcraft-test.md` |
| **Understand the selection model** | `blockcraft-selection.md` (L2) |
| **Understand IME / input handling** | `blockcraft-input.md` (L2) |
| **Understand the inline blot tree** | `blockcraft-inline.md` (L2) |
| **Understand event dispatch** | `blockcraft-event.md` (L2) |
| **Understand the Yjs data layer** | `blockcraft-data.md` (L2) |
| **Upgrade `@ccc/blockcraft` and find what changed** | `MIGRATIONS.md` |
| **Add a new framework feature and document it** | `MIGRATIONS.md` (you MUST add an entry — see project `CLAUDE.md` rule) |

## Critical Conventions (read before coding)

- **Selection model uses `anchor`/`head`** with discriminated `ISelectionPoint` (`type: 'text' | 'selected'`). The legacy `from`/`to`/`index` shape is `@deprecated`. See `blockcraft-selection.md`.
- **All mutations go through Yjs transactions** — `DocChain` (high-level fluent) or `DocCRUD.transact()` (low-level). Never write to props or DOM directly.
- **Plugins extend `DocPlugin`** with `init()`/`destroy()` lifecycle. Hotkeys use `shortKey: true` (auto-mapped to Cmd on macOS, Ctrl on Win/Linux). Never hardcode `metaKey`/`ctrlKey`.
- **Block components are standalone Angular** with `ChangeDetectionStrategy.OnPush`. Selectors follow `tag.flavour-name-block`.
- **Icons are font-icons** (`<i class="bc_icon bc_xxx"></i>`). No PNGs, no inline SVGs except for multi-color.
- **`heading` is a prop on paragraph blocks**, not a separate flavour. There is no `heading-block`.

## Now Read the L0 Router

Open `blockcraft.md` in this same folder for the full overview, file structure, plugin/block inventory, and Quick Reference snippets.

---

## For Tooling Authors

- **Skill metadata**: `name = blockcraft-editor`. Versioning follows the host npm package `@ccc/blockcraft`.
- **File index**: see `README.md` for installation paths and how to wire this into Claude Code, Codex, or any other agent harness.
- **Sync rules**: when the framework changes, the corresponding L1/L2 file is updated in lock-step. See `CLAUDE.md` (project root) "文档同步规则" table.
