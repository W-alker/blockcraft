import assert from 'node:assert/strict';
import {readdir, readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';

const editorRoot = fileURLToPath(new URL('../packages/editor/', import.meta.url));
const clipboard = path.join(editorRoot, 'framework/modules/clipboard');
const adapters = path.join(editorRoot, 'adapters');
const sources = path.join(adapters, 'sources');
const compatibility = path.join(clipboard, 'adapters');
const inside = (file, directory) => file === directory || file.startsWith(directory + path.sep);

async function* files(directory) {
  for (const entry of await readdir(directory, {withFileTypes: true})) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) yield* files(file);
    else if (file.endsWith('.ts') && !file.endsWith('.spec.ts')) yield file;
  }
}

function dependency(file, specifier) {
  if (specifier === '@ccc/blockcraft') return editorRoot.slice(0, -1);
  if (specifier.startsWith('@ccc/blockcraft/')) return path.join(editorRoot, specifier.slice('@ccc/blockcraft/'.length));
  return specifier.startsWith('.') ? path.resolve(path.dirname(file), specifier) : null;
}

function checkImports(file, source, forbidden) {
  const check = specifier => {
    const target = dependency(file, specifier);
    assert.ok(!target || !(target === editorRoot.slice(0, -1) || forbidden.some(dir => inside(target, dir))),
      `领域边界越界: ${path.relative(editorRoot, file)} -> ${specifier}`);
    const compatibilityBarrels = ['framework', 'framework/doc', 'framework/modules', 'framework/services', 'framework/chain', 'framework/modules/clipboard'];
    assert.ok(!target || !compatibilityBarrels.some(dir => target === path.join(editorRoot, dir) || target === path.join(editorRoot, dir, 'index')),
      `领域实现不得经兼容聚合入口加载产品装配: ${path.relative(editorRoot, file)} -> ${specifier}`);
  };
  const visit = node => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      check(node.moduleSpecifier.text);
    } else if (ts.isImportTypeNode(node)) {
      assert.ok(ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal));
      check(node.argument.literal.text);
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      assert.ok(ts.isStringLiteral(node.arguments[0]), '来源实现不能经不透明动态导入绕开边界');
      check(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

for await (const file of files(clipboard)) {
  const source = ts.createSourceFile(file, await readFile(file, 'utf8'), ts.ScriptTarget.Latest, true);
  if (inside(file, compatibility)) {
    // 兼容目录只允许已知转导出，不能再次长出来源识别或转换逻辑。
    const relative = path.relative(compatibility, file);
    const oldYneFiles = ['index', 'types', 'inline-converter', 'block-converters', 'table-converter', 'bulb-converter', 'resource', 'youdao-html'];
    const expected = oldYneFiles.some(name => relative === `yne/${name}.ts`) ? path.join(sources, relative.slice(0, -3)) : null;
    assert.ok(expected, `兼容层不允许新增实现: ${relative}`);
    assert.equal(source.statements.length, 1, `兼容层只能转导出: ${relative}`);
    const declaration = source.statements[0];
    assert.ok(ts.isExportDeclaration(declaration) && declaration.moduleSpecifier);
    assert.equal(dependency(file, declaration.moduleSpecifier.text), expected, relative);
  } else if (file === path.join(clipboard, 'index.ts')) {
    assert.ok(source.statements.every(node => ts.isExportDeclaration(node)), '剪贴板兼容入口只能转导出');
    const assembly = source.statements.filter(node => dependency(file, node.moduleSpecifier.text) === path.join(editorRoot, 'editor/clipboard-manager'));
    assert.equal(assembly.length, 1, '旧公共构造器必须指向默认装配');
    assert.deepEqual(assembly[0].exportClause.elements.map(item => item.name.text), ['ClipboardManager']);
  } else {
    checkImports(file, source, [adapters, path.join(editorRoot, 'editor'), path.join(editorRoot, 'blocks'), path.join(editorRoot, 'embeds')]);
    for (const node of source.statements) {
      if (!ts.isImportDeclaration(node) || !node.moduleSpecifier) continue;
      const target = dependency(file, node.moduleSpecifier.text);
      if (target && inside(target, compatibility)) {
        assert.fail(`剪贴板实现不得依赖旧适配兼容入口: ${file}`);
      }
    }
  }
}

for await (const file of files(adapters)) {
  if (inside(file, sources)) continue;
  const source = ts.createSourceFile(file, await readFile(file, 'utf8'), ts.ScriptTarget.Latest, true);
  checkImports(file, source, [sources, path.join(editorRoot, 'blocks'), path.join(editorRoot, 'embeds'), path.join(editorRoot, 'editor')]);
}
console.log('PASS: 剪贴板核心、通用转换核心与来源集成边界；默认装配归属 editor，旧路径仅作转导出');
