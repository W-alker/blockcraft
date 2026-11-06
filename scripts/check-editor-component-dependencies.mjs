#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
import {checkAngularEagerDependencies} from './lib/check-angular-eager-dependencies.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const packageRoot = path.resolve(root, process.argv[2] ?? 'dist/editor');
const manifest = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'));
const entries = [...new Set(Object.values(manifest.exports).map(value => value.default).filter(value => value?.endsWith('.mjs')))];
let components = 0;
const errors = [];
for (const entry of entries) {
  const file = path.join(packageRoot, entry);
  const result = checkAngularEagerDependencies(await readFile(file, 'utf8'), path.relative(root, file));
  components += result.components;
  errors.push(...result.errors);
}
assert.ok(components > 0, 'No Angular component declarations inspected; check the package format and scanner');

// The all-components barrel includes snapshot-viewer -> the block registry.
// Native blocks must import leaf components instead of reopening that cycle.
async function checkBlockImports(directory) {
  for (const entry of await readdir(directory, {withFileTypes: true})) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await checkBlockImports(file);
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) {
      const source = ts.createSourceFile(file, await readFile(file, 'utf8'), ts.ScriptTarget.Latest, true);
      for (const statement of source.statements) {
        if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
        const clause = statement.importClause;
        if (clause?.isTypeOnly) continue;
        if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings) && !clause.name &&
            clause.namedBindings.elements.every(element => element.isTypeOnly)) continue;
        let target = path.resolve(path.dirname(file), statement.moduleSpecifier.text).replace(/\.[cm]?[jt]s$/, '');
        if (path.basename(target) === 'index') target = path.dirname(target);
        if (target === path.join(root, 'packages/editor/components')) {
          errors.push(`${path.relative(root, file)}: import the leaf component, not the components barrel`);
        }
      }
    }
  }
}
await checkBlockImports(path.join(root, 'packages/editor/blocks'));
assert.equal(errors.length, 0, errors.join('\n'));
console.log(`PASS: ${components} emitted Angular components across ${entries.length} entrypoints have no eager forward dependencies; native blocks avoid the components barrel`);
