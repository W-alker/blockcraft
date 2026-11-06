import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

/** 检查发布产物的直接依赖；运行时与声明依赖分别授权，避免类型关系悄悄变成运行时加载。 */
export async function checkEntrypointDependencies(packageRoot, manifest, boundaries) {
  const knownFiles = new Map();
  for (const [name, entry] of Object.entries(manifest.exports)) {
    for (const target of [entry.types, entry.default].filter(Boolean)) {
      knownFiles.set(path.resolve(packageRoot, target), name === '.' ? '@ccc/blockcraft' : '@ccc/blockcraft/' + name.slice(2));
    }
  }
  for (const [name, boundary] of Object.entries(boundaries)) {
    const entry = manifest.exports['./' + name];
    assert.ok(entry, `缺少 ${name} 入口`);
    for (const [kind, target] of [['runtime', entry.default], ['types', entry.types]]) {
      const filename = path.resolve(packageRoot, target);
      const source = ts.createSourceFile(filename, await readFile(filename, 'utf8'), ts.ScriptTarget.Latest, true);
      const allowed = new Set((boundary[kind] ?? []).map(name => '@ccc/blockcraft/' + name));
      const validate = specifier => {
        const dependency = specifier.startsWith('.')
          ? knownFiles.get(path.resolve(path.dirname(filename), specifier)) ?? specifier
          : specifier;
        assert.ok(allowed.has(dependency), `${name} 的 ${kind} 越界依赖: ${dependency}`);
      };
      const visit = node => {
        if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
          assert.ok(ts.isStringLiteral(node.moduleSpecifier));
          validate(node.moduleSpecifier.text);
        } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) {
          validate(node.argument.literal.text);
        } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
          assert.ok(node.arguments[0] && ts.isStringLiteral(node.arguments[0]), `${name} 不允许无法静态检查的动态导入`);
          validate(node.arguments[0].text);
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
      for (const directive of source.typeReferenceDirectives) validate(directive.fileName);
    }
  }
}
