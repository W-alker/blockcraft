import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';

const root = fileURLToPath(new URL('../packages/editor/', import.meta.url));
const framework = path.join(root, 'framework');
const compatibility = JSON.parse(await readFile(new URL('./fixtures/editor-domain-compatibility.json', import.meta.url), 'utf8'));
const barrels = new Set(['framework/index.ts', 'framework/doc/index.ts', 'framework/modules/index.ts',
  'framework/modules/clipboard/index.ts', 'framework/modules/pagination/index.ts',
  'framework/services/index.ts', 'framework/chain/index.ts', 'framework/chain/doc-builder.ts',
  'framework/services/link-previewer.service.ts', 'framework/services/weather.service.ts']);
const forbidden = ['editor', 'adapters', 'blocks', 'embeds', 'plugins', 'tools', 'snapshot-viewer', 'components'];

async function* files(dir) {
  for (const entry of await readdir(dir, {withFileTypes: true})) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* files(file);
    else if (file.endsWith('.ts') && !file.endsWith('.spec.ts')) yield file;
  }
}
function target(file, value) {
  if (value === '@ccc/blockcraft') return root.slice(0, -1);
  if (value.startsWith('@ccc/blockcraft/')) return path.join(root, value.slice('@ccc/blockcraft/'.length));
  return value.startsWith('.') ? path.resolve(path.dirname(file), value) : null;
}
function isCompatibility(value) {
  return [value + '.ts', value + '/index.ts', value].some(name => barrels.has(name) || name in compatibility);
}
let implementations = 0;
for await (const file of files(framework)) {
  const relative = path.relative(root, file);
  const source = ts.createSourceFile(file, await readFile(file, 'utf8'), ts.ScriptTarget.Latest, true);
  if (relative in compatibility) {
    assert.equal(source.statements.length, 1, `${relative} 必须仅有一条转导出`);
    const node = source.statements[0];
    assert.ok(ts.isExportDeclaration(node) && node.moduleSpecifier, relative);
    assert.equal(target(file, node.moduleSpecifier.text), path.join(root, compatibility[relative]), relative);
    continue;
  }
  if (barrels.has(relative)) {
    assert.ok(source.statements.every(ts.isExportDeclaration), `${relative} 不能包含实现或初始化副作用`);
    continue;
  }
  assert.ok(!relative.startsWith('framework/services/'), `services 不得新增实现: ${relative}`);
  assert.ok(!relative.startsWith('framework/modules/pagination/export/'), `导出实现应位于 tools/export: ${relative}`);
  const check = (literal, node) => {
    assert.ok(ts.isStringLiteral(literal), `${relative} 不能以不透明动态导入绕过边界`);
    const resolved = target(file, literal.text);
    if (!resolved) return;
    const dependency = path.relative(root, resolved);
    // 保持既有 Token 泛型的名义类型；这两条必须始终为 type-only。
    if (relative === 'framework/angular/host-service-tokens.ts' &&
        ['editor/services/doc-link-previewer.service', 'editor/services/doc-weather.service'].includes(dependency)) {
      assert.ok(ts.isImportDeclaration(node) && node.importClause.isTypeOnly);
      return;
    }
    assert.ok(dependency && !forbidden.some(dir => dependency === dir || dependency.startsWith(dir + '/')),
      `领域实现反向依赖产品层: ${relative} -> ${literal.text}`);
    assert.ok(!isCompatibility(dependency), `领域实现经兼容入口回流: ${relative} -> ${literal.text}`);
  };
  const visit = node => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) check(node.moduleSpecifier, node);
    else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) check(node.argument.literal, node);
    else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) check(node.arguments[0], node);
    ts.forEachChild(node, visit);
  };
  visit(source);
  implementations++;
}
console.log(`PASS: ${implementations} 个领域文件的依赖方向；${Object.keys(compatibility).length} 个旧路径仅转导出；聚合入口无装配副作用`);
