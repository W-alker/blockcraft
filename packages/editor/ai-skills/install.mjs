#!/usr/bin/env node
/**
 * BlockCraft AI Skill Pack — installer
 *
 * Installs (symlinks or copies) this folder into a Claude Code / Codex / custom
 * skill directory so AI agents can discover the BlockCraft skill via SKILL.md.
 *
 * Usage:
 *   node install.mjs                           # install to ~/.claude/skills/blockcraft-editor
 *   node install.mjs --target codex            # install to ~/.agents/skills/blockcraft-editor
 *   node install.mjs --dest /custom/path       # install to a custom directory
 *   node install.mjs --copy                    # force copy instead of symlink
 *   node install.mjs --uninstall               # remove an existing installation
 *
 * The installer is idempotent — running it twice on the same target is safe.
 */

import { existsSync, lstatSync, mkdirSync, rmSync, symlinkSync, cpSync, realpathSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { homedir, platform } from 'node:os'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const SKILL_NAME = 'blockcraft-editor'

const TARGETS = {
  claude: join(homedir(), '.claude', 'skills', SKILL_NAME),
  codex: join(homedir(), '.agents', 'skills', SKILL_NAME),
}

function parseArgs(argv) {
  const opts = { target: 'claude', dest: null, copy: false, uninstall: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--target') opts.target = argv[++i]
    else if (a === '--dest') opts.dest = argv[++i]
    else if (a === '--copy') opts.copy = true
    else if (a === '--uninstall') opts.uninstall = true
    else if (a === '--help' || a === '-h') opts.help = true
  }
  return opts
}

function printHelp() {
  console.log(`BlockCraft AI Skill Pack installer

Usage:
  node install.mjs [options]

Options:
  --target <name>   Preset target: claude (default) | codex
  --dest <path>     Custom destination directory (overrides --target)
  --copy            Copy files instead of creating a symlink
  --uninstall       Remove an existing installation at the target/dest
  -h, --help        Show this message

Examples:
  node install.mjs
  node install.mjs --target codex
  node install.mjs --dest ./.claude/skills/blockcraft-editor
  node install.mjs --uninstall
`)
}

function resolveDest(opts) {
  if (opts.dest) return resolve(opts.dest)
  const preset = TARGETS[opts.target]
  if (!preset) {
    console.error(`✗ Unknown --target "${opts.target}". Use one of: ${Object.keys(TARGETS).join(', ')}`)
    process.exit(1)
  }
  return preset
}

function uninstall(dest) {
  if (!existsSync(dest)) {
    console.log(`✓ Nothing to remove at ${dest}`)
    return
  }
  rmSync(dest, { recursive: true, force: true })
  console.log(`✓ Removed ${dest}`)
}

function alreadyPointsHere(dest) {
  try {
    const stat = lstatSync(dest)
    if (!stat.isSymbolicLink()) return false
    return realpathSync(dest) === realpathSync(SCRIPT_DIR)
  } catch {
    return false
  }
}

function install(dest, useCopy) {
  // Idempotency: if a symlink already points to our skill folder, we're done.
  if (alreadyPointsHere(dest)) {
    console.log(`✓ Skill already installed at ${dest}`)
    return
  }

  // If something else exists at dest, remove it first (caller has been warned via stderr).
  if (existsSync(dest)) {
    console.log(`! Removing existing entry at ${dest}`)
    rmSync(dest, { recursive: true, force: true })
  }

  mkdirSync(dirname(dest), { recursive: true })

  if (!useCopy) {
    try {
      // 'junction' on Windows is more permissive than a real symlink (no admin needed).
      const type = platform() === 'win32' ? 'junction' : 'dir'
      symlinkSync(SCRIPT_DIR, dest, type)
      console.log(`✓ Symlinked skill pack:`)
      console.log(`    ${dest}`)
      console.log(`  → ${SCRIPT_DIR}`)
      return
    } catch (err) {
      console.warn(`! Symlink failed (${err.code || err.message}); falling back to copy.`)
    }
  }

  cpSync(SCRIPT_DIR, dest, { recursive: true, force: true, dereference: true })
  console.log(`✓ Copied skill pack to ${dest}`)
  console.log(`  (copy snapshot — re-run installer after upgrading @ccc/blockcraft)`)
}

function main() {
  const opts = parseArgs(process.argv.slice(2))
  if (opts.help) return printHelp()

  const dest = resolveDest(opts)

  if (opts.uninstall) return uninstall(dest)

  install(dest, opts.copy)
  console.log(`\nNext steps:`)
  console.log(`  • Restart your AI agent so it picks up the new skill.`)
  console.log(`  • Ask it to "use the blockcraft-editor skill" or just talk about BlockCraft.`)
  console.log(`  • The skill's L0 router lives at SKILL.md / blockcraft.md inside the installed folder.`)
}

main()
