#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const workspaceRoot = fileURLToPath(new URL('../', import.meta.url));
const packageRoot = path.resolve(workspaceRoot, process.argv[2] ?? 'dist/editor');
const manifest = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'));
const declared = new Set([
  ...Object.keys(manifest.dependencies ?? {}),
  ...Object.keys(manifest.peerDependencies ?? {}),
  ...Object.keys(manifest.optionalDependencies ?? {}),
]);
const used = new Set();
const errors = new Set();
const packageName = specifier => specifier.startsWith('@')
  ? specifier.split('/').slice(0, 2).join('/')
  : specifier.split('/')[0];

function checkImport(specifier, typesOnly, file) {
  if (specifier.startsWith('.') || specifier.startsWith('node:')) return;
  const name = packageName(specifier);
  if (name === manifest.name) return;
  // hast/mdast 等类型模块由 @types 提供；空壳同名包不能满足类型契约。
  const typesName = '@types/' + name.replace(/^@/, '').replace('/', '__');
  const dependency = typesOnly && declared.has(typesName) ? typesName : name;
  if (declared.has(dependency)) used.add(dependency);
  else errors.add(`${file}: 未声明的${typesOnly ? '类型' : '运行时'}依赖 ${specifier}`);
}

async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      // 文档、资源不是 JS 入口；检查所有 FESM 分块和声明文件。
      if (!['ai-skills', 'assets', 'themes', 'node_modules'].includes(entry.name)) await scan(file);
      continue;
    }
    if (!/\.(?:mjs|cjs|js|d\.ts)$/.test(entry.name)) continue;
    const typesOnly = entry.name.endsWith('.d.ts');
    const source = ts.createSourceFile(file, await readFile(file, 'utf8'), ts.ScriptTarget.Latest, true);
    const relative = path.relative(packageRoot, file);
    function visit(node) {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
          node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        checkImport(node.moduleSpecifier.text, typesOnly, relative);
      }
      if (ts.isCallExpression(node) &&
          (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
            (ts.isIdentifier(node.expression) && node.expression.text === 'require')) &&
          node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
        checkImport(node.arguments[0].text, typesOnly, relative);
      }
      if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) &&
          ts.isStringLiteral(node.argument.literal)) {
        checkImport(node.argument.literal.text, true, relative);
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
    for (const reference of source.typeReferenceDirectives) {
      checkImport(reference.fileName, true, relative);
    }
  }
}

await scan(packageRoot);
assert.ok(used.size > 0, '未找到 editor 发布产物中的依赖引用，请先构建 editor');

// Router 虽未由 editor 直接导入，仍是所用 @cses/ui 的必需 peer。
const indirectPeers = new Map([['@angular/router', '@cses/ui']]);
for (const [dependency, owner] of indirectPeers) {
  if (!used.has(owner) || !declared.has(dependency)) continue;
  const ownerManifest = JSON.parse(await readFile(
    path.join(workspaceRoot, 'node_modules', owner, 'package.json'), 'utf8',
  ));
  if (ownerManifest.peerDependencies?.[dependency] &&
      !ownerManifest.peerDependenciesMeta?.[dependency]?.optional) used.add(dependency);
}

for (const dependency of Object.keys(manifest.peerDependencies ?? {})) {
  if (!used.has(dependency)) errors.add(`未使用的 peerDependency: ${dependency}`);
}
assert.equal(errors.size, 0, [...errors].join('\n'));
console.log(`PASS: editor 发布产物 ${used.size} 个依赖均有声明，peerDependencies 无冗余`);
