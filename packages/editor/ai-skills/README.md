# BlockCraft AI Skill Pack

A progressive-disclosure documentation pack for AI agents (Claude Code, Codex, Cursor, Windsurf, Aider, …) and human developers who want to **build with**, **extend**, or **embed** the BlockCraft editor.

> Source of truth: this folder, shipped inside `@ccc/blockcraft/ai-skills/` on npm and tracked in the BlockCraft repository at `packages/editor/ai-skills/`.

## What's In The Box

20 files organized in three documentation layers + tooling + migration log:

```
ai-skills/
├── SKILL.md                # AI discovery entry (Claude/Codex frontmatter)
├── README.md               # this file — human installation & usage guide
├── MIGRATIONS.md           # version-by-version breaking changes & migration recipes
├── install.mjs             # one-command installer for AI skill directories
├── blockcraft.md           # L0 — overview, routing table, conventions
├── blockcraft-app.md       # L1 — embed BlockCraft in a host Angular app
├── blockcraft-plugin.md    # L1 — create a plugin
├── blockcraft-block.md     # L1 — create a block (void/editable/container)
├── blockcraft-embed.md     # L1 — create an inline embed
├── blockcraft-adapter.md   # L1 — HTML/Markdown matchers
├── blockcraft-toolbar.md   # L1 — overlay/toolbar UI
├── blockcraft-theme.md     # L1 — theming
├── blockcraft-debug.md     # L1 — debugging strategies
├── blockcraft-perf.md      # L1 — performance checklist
├── blockcraft-test.md      # L1 — testing strategies
├── blockcraft-selection.md # L2 — anchor/head selection model
├── blockcraft-input.md     # L2 — input / IME pipeline
├── blockcraft-inline.md    # L2 — inline blot tree & runtime
├── blockcraft-event.md     # L2 — event dispatcher & decorators
└── blockcraft-data.md      # L2 — Yjs data model & CRUD
```

L0 → L1 → L2 means: read the L0 router first, jump to one L1 task guide, only read L2 if you're touching framework internals.

## Who This Is For

| Audience | What you get |
|----------|--------------|
| **AI coding agents** working in a project that consumes `@ccc/blockcraft` | A consistent, self-contained set of patterns and templates so the agent can scaffold blocks/plugins/embeds without having to read the framework source first |
| **Angular developers** integrating the editor | A copy-paste-ready integration guide (`blockcraft-app.md`) plus deep references for the parts you customise |
| **Plugin/block authors** building extensions | Step-by-step templates with ready-to-fill structures and checklists |
| **Framework contributors** | L2 deep-dives that explain *why* the system is shaped the way it is |

## Installation

The skill pack ships with the npm package, so as long as you've installed `@ccc/blockcraft` you already have it. Pick the integration that matches your tooling:

### Option 1 — One-command installer (recommended for Claude Code / Codex)

The pack ships with a small Node script that handles symlinking, fallback to copy, and uninstall:

```bash
# Install for Claude Code (default → ~/.claude/skills/blockcraft-editor)
node node_modules/@ccc/blockcraft/ai-skills/install.mjs

# Install for Codex (→ ~/.agents/skills/blockcraft-editor)
node node_modules/@ccc/blockcraft/ai-skills/install.mjs --target codex

# Install to a custom path
node node_modules/@ccc/blockcraft/ai-skills/install.mjs --dest ./.claude/skills/blockcraft-editor

# Force a copy instead of a symlink (useful on Windows without symlink permissions)
node node_modules/@ccc/blockcraft/ai-skills/install.mjs --copy

# Uninstall
node node_modules/@ccc/blockcraft/ai-skills/install.mjs --uninstall

# Show all options
node node_modules/@ccc/blockcraft/ai-skills/install.mjs --help
```

The default behaviour is a symlink, so the skill auto-updates whenever you `pnpm install` / `npm install` a new BlockCraft version. The script is idempotent — running it again on the same target is safe.

### Option 2 — Read directly from `node_modules` (any tool)

```bash
ls node_modules/@ccc/blockcraft/ai-skills/
cat node_modules/@ccc/blockcraft/ai-skills/blockcraft.md
```

This works for any AI assistant or developer. Your agent can be told to read the router file first — see "Option 5" below for the recommended rule snippet.

### Option 3 — Manual symlink/copy (no Node)

```bash
# Symlink (recommended — auto-updates with npm install)
ln -s "$(pwd)/node_modules/@ccc/blockcraft/ai-skills" \
      "$HOME/.claude/skills/blockcraft-editor"

# OR copy (snapshots the version you have today)
cp -r node_modules/@ccc/blockcraft/ai-skills \
      "$HOME/.claude/skills/blockcraft-editor"

# Uninstall
rm "$HOME/.claude/skills/blockcraft-editor"
```

### Option 4 — Project-scoped Claude Code skill

If you want the skill available only inside one project's workspace:

```bash
node node_modules/@ccc/blockcraft/ai-skills/install.mjs \
  --dest .claude/skills/blockcraft-editor
```

### Option 5 — Custom project rules (Cursor, Windsurf, Aider, …)

If your agent doesn't use `SKILL.md` discovery, just point it at the L0 file in `node_modules`. Add this to your `CLAUDE.md` / `AGENTS.md` / `.cursorrules` / `.windsurfrules`:

```markdown
When working with @ccc/blockcraft, ALWAYS read
node_modules/@ccc/blockcraft/ai-skills/blockcraft.md FIRST.
That file is the router — it tells you which other ai-skills/*.md
to read for the specific task at hand. Do NOT skip the router and
read individual files at random.
```

## How AI Agents Should Use This Pack

1. **Discover** — find `SKILL.md` (its frontmatter `description` says when this skill applies).
2. **Route** — read `blockcraft.md` (the L0 file) to get the mental model and routing table.
3. **Pick one L1 file** — based on the user's task. The routing table maps tasks to filenames.
4. **Drop into L2 only when needed** — L2 files document framework internals; you usually don't need them.
5. **Don't load everything** — the whole pack is ~120 KB. Loading every file wastes context. The router exists so you only load what's relevant.

## How Human Developers Should Use This Pack

- **First time integrating?** Start at `blockcraft-app.md` — it walks through DI tokens, `DocConfig`, `initBySnapshot`, theming, persistence, and readonly mode end-to-end.
- **Adding a custom block?** `blockcraft-block.md` has paste-ready templates for the three node types (void, editable, container).
- **Writing a plugin?** `blockcraft-plugin.md` shows the lifecycle, decorator patterns, and overlay management with a real CDK Overlay example.
- **Stuck?** `blockcraft-debug.md` lists common failure modes and tracing steps.

## Versioning & Migrations

The skill pack is versioned in lock-step with `@ccc/blockcraft`. Three things stay aligned in every framework PR:

1. The **source code** in `packages/editor/`
2. The **L0/L1/L2 markdowns** in this folder
3. A new entry at the top of **`MIGRATIONS.md`**

`MIGRATIONS.md` is the **single source of truth for upgrading**. Each entry documents:
- What changed and why
- Severity (patch / minor / major) and the corresponding `package.json` version bump
- Affected ai-skills files
- Concrete before/after migration recipes
- Deprecations and their planned removal version
- Behavior changes that don't show up in type signatures

**When upgrading `@ccc/blockcraft` in your project**, open `MIGRATIONS.md` and read every entry between your current version and the new one. Apply the migration recipes top-down. Recipes are designed to be mechanical — most can be done with a single find-and-replace per file.

**When contributing to BlockCraft**, the project root `CLAUDE.md` "文档同步规则" makes this mandatory: any architectural change (new export, modified signature, deprecation, removal, behavior reversal) MUST add a `MIGRATIONS.md` entry and bump the version in the same PR. PRs that change framework code without updating MIGRATIONS will be rejected.

Each individual L1/L2 markdown also carries its own `Last updated: YYYY-MM-DD` line at the top so you can spot-check freshness.

## Reporting Issues

If you find a doc that's out of sync with the actual framework (wrong API signature, missing method, broken example), please open an issue in the BlockCraft repository with:

- The file path (e.g. `ai-skills/blockcraft-selection.md`)
- The line range
- What the doc says vs. what the code does

## License

Same as `@ccc/blockcraft` — see the package's main `package.json`.
