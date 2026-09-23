#!/usr/bin/env node
import assert from 'node:assert/strict';
import {copyFile, mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
import {checkEntrypointDependencies} from './lib/check-editor-entrypoint-dependencies.mjs';

const workspaceRoot = fileURLToPath(new URL('../', import.meta.url));
const packageRoot = path.resolve(workspaceRoot, process.argv[2] ?? 'dist/editor');
const manifest = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'));
// 固定公共契约，不能从当次构建结果生成，否则无法发现导出遗漏。
const contract = JSON.parse(await readFile(new URL('./fixtures/editor-pure-entrypoints.json', import.meta.url), 'utf8'));
await checkEntrypointDependencies(packageRoot, manifest, {
  'framework/model': {types: ['global/types']},
  'framework/ports': {},
  'framework/block-std/types/block-base': {runtime: ['framework/model'], types: ['framework/model']},
  'framework/block-std/typography': {runtime: ['framework/model'], types: ['framework/model']},
  'framework/block-std/block/object-format': {types: ['framework/model']},
  'framework/modules/pagination/engine': {
    runtime: ['framework/model'],
    types: ['framework/model'],
  },
});
// 排版计算层在不加载 DOM lib 的条件下也必须成立；DOM 实现只能向它单向依赖。
const coreProgram = ts.createProgram(['core.ts', 'paragraph-alignment.ts'].map(file => path.join(workspaceRoot, 'packages/editor/framework/block-std/typography', file)), {
  noEmit: true, strict: true, types: [], target: ts.ScriptTarget.ES2022, lib: ['lib.es2022.d.ts'],
  moduleResolution: ts.ModuleResolutionKind.Node10, baseUrl: workspaceRoot,
  paths: {
    '@ccc/blockcraft/framework/model': ['packages/editor/framework/model/index.ts'],
    '@ccc/blockcraft/global/types': ['packages/editor/global/types/index.ts'],
  },
});
const coreDiagnostics = ts.getPreEmitDiagnostics(coreProgram);
assert.equal(coreDiagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(coreDiagnostics, {
  getCanonicalFileName: file => file, getCurrentDirectory: () => workspaceRoot, getNewLine: () => '\n',
}));
// Shared Kernel 的源码依赖也要受限：类型被打包内联后，单查产物会漏掉反向引用。
const modelRoot = path.join(workspaceRoot, 'packages/editor/framework/model') + path.sep;
for (const source of coreProgram.getSourceFiles().filter(source => source.fileName.startsWith(modelRoot))) {
  const visit = node => {
    if (ts.isImportTypeNode(node)) {
      assert.ok(ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal),
        `共享模型类型导入必须可静态检查: ${source.fileName}`);
      const specifier = node.argument.literal.text;
      assert.ok(specifier === '@ccc/blockcraft/global/types' ||
        (specifier.startsWith('.') && path.resolve(path.dirname(source.fileName), specifier).startsWith(modelRoot)),
        `共享模型类型导入越界: ${source.fileName} -> ${specifier}`);
    }
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      const specifier = node.moduleSpecifier.text;
      if (specifier.startsWith('.')) {
        assert.ok(path.resolve(path.dirname(source.fileName), specifier).startsWith(modelRoot),
          `共享模型不能相对引用其他领域: ${source.fileName} -> ${specifier}`);
      } else {
        const typeOnly = ts.isImportDeclaration(node) ? node.importClause?.isTypeOnly : node.isTypeOnly;
        assert.ok(specifier === '@ccc/blockcraft/global/types' && typeOnly,
          `共享模型只允许类型依赖 global/types: ${source.fileName} -> ${specifier}`);
      }
    }
    assert.ok(!(ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword),
      `共享模型不允许动态加载实现: ${source.fileName}`);
    ts.forEachChild(node, visit);
  };
  visit(source);
}
const entries = Object.fromEntries([...Object.keys(contract), 'global/types'].map(name => {
  const entry = manifest.exports?.['./' + name];
  assert.ok(entry?.types && entry?.default, `缺少 ${name} 的运行时或类型导出`);
  return [name, entry];
}));
const mainFile = path.join(packageRoot, manifest.exports['.'].default);
const mainSource = ts.createSourceFile(mainFile, await readFile(mainFile, 'utf8'), ts.ScriptTarget.Latest, true);
const forwarded = new Map();
for (const node of mainSource.statements) {
  if (!ts.isExportDeclaration(node) || !node.moduleSpecifier || !ts.isStringLiteral(node.moduleSpecifier)) continue;
  if (!node.exportClause || !ts.isNamedExports(node.exportClause)) continue;
  for (const element of node.exportClause.elements) forwarded.set(element.name.text, node.moduleSpecifier.text);
}
for (const [name, {runtime}] of Object.entries(contract)) {
  for (const symbol of runtime) {
    // 兼容路径共享模型符号；主入口仍允许经 typography 转导出紧凑排版键。
    const origin = ['BlockNodeType', 'InlineNodeType'].includes(symbol) ? 'framework/model'
      : symbol === 'INLINE_TYPOGRAPHY_ATTRS' ? 'framework/block-std/typography' : name;
    const specifier = forwarded.get(symbol);
    assert.ok(specifier, `主入口缺少 ${symbol}`);
    assert.ok(specifier === '@ccc/blockcraft/' + origin ||
      path.resolve(path.dirname(mainFile), specifier) === path.resolve(packageRoot, entries[origin].default),
      `${symbol} 没有转导出独立入口的同一实现`);
  }
}

const mainTypesFile = path.join(packageRoot, manifest.exports['.'].types);
const mainTypesSource = ts.createSourceFile(mainTypesFile, await readFile(mainTypesFile, 'utf8'), ts.ScriptTarget.Latest, true);
const mainTypeExports = new Set(mainTypesSource.statements.flatMap(node =>
  ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause)
    ? node.exportClause.elements.map(element => element.name.text) : []));
for (const symbol of [...contract['framework/model'].types, ...contract['framework/ports'].types]) {
  assert.ok(mainTypeExports.has(symbol), `主入口丢失模型或宿主契约类型 ${symbol}`);
}

// 宿主端口可使用 File/AbortSignal 等 DOM 类型，但只能定义类型，不能把 DI 或默认实现打包进来。
const portsRoot = path.join(workspaceRoot, 'packages/editor/framework/ports') + path.sep;
const portsProgram = ts.createProgram([path.join(portsRoot, 'index.ts')], {
  noEmit: true, strict: true, types: [], target: ts.ScriptTarget.ES2022,
});
for (const source of portsProgram.getSourceFiles().filter(source => source.fileName.startsWith(portsRoot))) {
  for (const node of source.statements) {
    assert.ok(ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) ||
      (ts.isImportDeclaration(node) && node.importClause?.isTypeOnly) ||
      (ts.isExportDeclaration(node) && node.isTypeOnly), `宿主端口只能定义类型: ${source.fileName}`);
  }
  const validate = specifier => assert.ok(specifier.startsWith('.') &&
    path.resolve(path.dirname(source.fileName), specifier).startsWith(portsRoot),
    `宿主端口不能依赖外部实现: ${source.fileName} -> ${specifier}`);
  const visit = node => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      validate(node.moduleSpecifier.text);
    } else if (ts.isImportTypeNode(node)) {
      assert.ok(ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal));
      validate(node.argument.literal.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  assert.equal(source.typeReferenceDirectives.length, 0, '宿主端口不能加载外部 ambient 类型');
}

const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'blockcraft-pure-entrypoints-'));
try {
  const isolatedPackage = path.join(temporaryRoot, 'node_modules/@ccc/blockcraft');
  await mkdir(isolatedPackage, {recursive: true});
  await writeFile(path.join(isolatedPackage, 'package.json'), JSON.stringify(manifest));
  // 仅提供这些轻量入口与基础类型，不复制主入口，也不安装 Angular/Yjs 等依赖。
  for (const target of Object.values(entries).flatMap(entry => [entry.default, entry.types])) {
    const destination = path.join(isolatedPackage, target);
    await mkdir(path.dirname(destination), {recursive: true});
    await copyFile(path.join(packageRoot, target), destination);
  }
  await writeFile(path.join(temporaryRoot, 'check.mjs'), `
import assert from 'node:assert/strict';
const modules = {};
for (const [name, {runtime}] of Object.entries(${JSON.stringify(contract)})) {
  modules[name] = await import('@ccc/blockcraft/' + name);
  assert.deepEqual(Object.keys(modules[name]).sort(), runtime.sort(), name);
}
assert.equal(typeof document, 'undefined');
const base = modules['framework/block-std/types/block-base'];
const typography = modules['framework/block-std/typography'];
const format = modules['framework/block-std/block/object-format'];
const engine = modules['framework/modules/pagination/engine'];
const model = modules['framework/model'];
assert.equal(engine.BlockNodeType, base.BlockNodeType);
assert.equal(base.BlockNodeType, model.BlockNodeType);
assert.equal(typography.INLINE_TYPOGRAPHY_ATTRS, model.INLINE_TYPOGRAPHY_ATTRS);
assert.equal(typography.normalizeInlineFontScale(1.23456), 1.235);
assert.equal(typography.resolveTypographyFontFamily('url(javascript:bad)'), null);
assert.equal(typography.paragraphPointsToPixels(12), 16);
assert.deepEqual(typography.paragraphAlignmentStyles('distributed'), {textAlign: 'justify', textAlignLast: 'justify', textJustify: 'inter-character'});
assert.equal(format.storeObjectPaint({type: 'none'}), 'none');
assert.equal(format.normalizeObjectPaint('none').type, 'none');
assert.deepEqual(engine.resolveBlockPolicy({flavour: 'paragraph', nodeType: base.BlockNodeType.editable}),
  {breakable: true, keepWithNext: false, capHeight: false});
const items = ['a', 'b', 'c'].map(id => ({id, height: 100, breakable: false, keepWithNext: false}));
assert.deepEqual(engine.paginate(items, {contentHeight: 250}).pages.map(page => page.slots.map(slot => slot.id)),
  [['a', 'b'], ['c']]);
`);
  const result = spawnSync(process.execPath, ['check.mjs'], {cwd: temporaryRoot, encoding: 'utf8'});
  assert.equal(result.status, 0, result.error?.message ?? result.stderr);

  // 模型可用于无 DOM 类型库的 Node 消费方，且不需要 BlockCraft 注册表的全局声明。
  const modelFixture = path.join(temporaryRoot, 'model.mts');
  await writeFile(modelFixture, `
import {BlockNodeType, InlineNodeType, INLINE_TYPOGRAPHY_ATTRS,
  type IBlockProps, type IEditableBlockProps, type InlineModel, type DeltaOperation,
  type IInlineNodeAttrs, type TypographyFontFamilyId, type BlockSnapshot,
  type BlockDescriptor, type IMetadata} from '@ccc/blockcraft/framework/model';
const block: IBlockProps = {position: '1 2', placementLayer: 'under', custom: ['a', 1]};
const editable: IEditableBlockProps = {...block, depth: 0, pfs: null};
const family: TypographyFontFamilyId = 'kai';
const attrs: IInlineNodeAttrs = {[INLINE_TYPOGRAPHY_ATTRS.fontFamily]: family, 's:color': null, 'a:bold': null};
const inline: InlineModel = [{insert: 'a', attributes: attrs}, {insert: {image: 'url'}}];
const ops: DeltaOperation[] = [{retain: 1, attributes: {'t:fs': 1.25}}, {delete: 1}, ...inline];
const nodeTypes = [BlockNodeType.editable, InlineNodeType.text];
// @ts-expect-error 模型层保持样式值约束。
const invalidStyle: IInlineNodeAttrs = {'s:custom': 1};
// @ts-expect-error 不扩大持久化字体 ID 集合。
const invalidFont: TypographyFontFamilyId = 'new-font';
// @ts-expect-error embed 数据值仍不接受任意对象。
const invalidEmbed: InlineModel = [{insert: {image: {url: 'x'}}}];

const leaf: BlockSnapshot = {id: 'leaf', flavour: 'outside-registry', nodeType: BlockNodeType.void, props: {}, meta: {}, children: []};
const text: BlockSnapshot = {id: 'text', flavour: 'paragraph', nodeType: BlockNodeType.editable, props: {}, meta: {}, children: inline};
const tree: BlockSnapshot<{title: string}, {owner: string}> = {
  id: 'root', flavour: 'custom-root', nodeType: BlockNodeType.root,
  props: {title: 'root only'}, meta: {owner: 'user'}, children: [leaf, text],
};
const descriptor: BlockDescriptor = tree;
const metadata: IMetadata = {lock: 'user', lockKind: 'template', plhMode: 'always'};
type ScopedSnapshot = BlockSnapshot<{}, {}, 'root' | 'paragraph'>;
const scopedLeaf: ScopedSnapshot = {id: 'child', flavour: 'paragraph', nodeType: BlockNodeType.editable, props: {}, meta: {}, children: []};
const scopedRoot: ScopedSnapshot = {id: 'root', flavour: 'root', nodeType: BlockNodeType.root, props: {}, meta: {}, children: [scopedLeaf]};
// @ts-expect-error flavour 集合约束递归传播，不能插入未知类型子块。
const badFlavour: ScopedSnapshot = {...scopedRoot, children: [leaf]};
// @ts-expect-error void 节点必须为空 children。
const badVoid: BlockSnapshot = {...leaf, nodeType: BlockNodeType.void, children: [text]};
// @ts-expect-error editable children 必须是 Delta，而不是快照。
const badEditable: BlockSnapshot = {...text, nodeType: BlockNodeType.editable, children: [leaf]};
// @ts-expect-error 容器 children 必须是快照，而不是 Delta。
const badContainer: BlockSnapshot = {...tree, nodeType: BlockNodeType.root, children: inline};
// @ts-expect-error 元数据仍然限制 placeholder 模式。
const badMeta: IMetadata = {plhMode: 'sometimes'};
`);
  const modelProgram = ts.createProgram([modelFixture], {
    noEmit: true, strict: true, types: [], target: ts.ScriptTarget.ES2022, lib: ['lib.es2022.d.ts'],
    module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext,
  });
  const modelDiagnostics = ts.getPreEmitDiagnostics(modelProgram);
  assert.equal(modelDiagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(modelDiagnostics, {
    getCanonicalFileName: file => file, getCurrentDirectory: () => temporaryRoot, getNewLine: () => '\n',
  }));

  // 保留编辑器的 registry specialization 与源码 interface 增强语义。
  await copyFile(path.join(workspaceRoot, 'packages/editor/framework/block-std/types/block.type.ts'),
    path.join(temporaryRoot, 'registered-block.type.ts'));
  const compatibilityFixture = path.join(temporaryRoot, 'snapshot-model-compatibility.mts');
  await copyFile(new URL('./fixtures/snapshot-model-compatibility.mts', import.meta.url), compatibilityFixture);
  const compatibilityProgram = ts.createProgram([compatibilityFixture], {
    noEmit: true, strict: true, types: [], target: ts.ScriptTarget.ES2022, lib: ['lib.es2022.d.ts'],
    module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext,
  });
  const compatibilityDiagnostics = ts.getPreEmitDiagnostics(compatibilityProgram);
  assert.equal(compatibilityDiagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(compatibilityDiagnostics, {
    getCanonicalFileName: file => file, getCurrentDirectory: () => temporaryRoot, getNewLine: () => '\n',
  }));

  const imports = Object.entries(contract).map(([name, {runtime, types}], index) =>
    `import {${[...runtime.map(symbol => `${symbol} as R${index}_${symbol}`),
      ...types.map(symbol => `type ${symbol} as T${index}_${symbol}`)].join(', ')}} from '@ccc/blockcraft/${name}';`);
  const typeFixture = path.join(temporaryRoot, 'check.mts');
  await writeFile(typeFixture, imports.join('\n') + `
import {BlockNodeType, type IBlockProps} from '@ccc/blockcraft/framework/block-std/types/block-base';
import {createInlineTypographyPatch, type TypographyFontFamilyId} from '@ccc/blockcraft/framework/block-std/typography';
import {normalizeObjectPaint, type BlockObjectFormatProps, type ObjectPaint} from '@ccc/blockcraft/framework/block-std/block/object-format';
import {BlockNodeType as EngineNodeType, resolveBlockPolicy, paginate, type PaginationItem} from '@ccc/blockcraft/framework/modules/pagination/engine';
const sameEnum: typeof BlockNodeType = EngineNodeType;
const props: IBlockProps = {position: '1 2', placementLayer: 'under', custom: ['value', 1]};
const format: BlockObjectFormatProps = {...props, width: 100, height: 80, rotation: 0};
const paint: ObjectPaint = normalizeObjectPaint('none');
const family: TypographyFontFamilyId = 'kai';
createInlineTypographyPatch('ff', family);
const policy = resolveBlockPolicy({flavour: 'paragraph', nodeType: sameEnum.editable});
const items: PaginationItem[] = [{id: 'a', height: 100, ...policy}];
const page: number = paginate(items, {contentHeight: 250}).pages.length;
// @ts-expect-error 不扩大原有 placementLayer 契约。
const invalidProps: IBlockProps = {placementLayer: 'over'};
// @ts-expect-error 不接受任意字体 id。
const invalidFamily: TypographyFontFamilyId = 'unknown-font';
// @ts-expect-error 分页策略仍接收原 BlockNodeType 枚举。
resolveBlockPolicy({flavour: 'paragraph', nodeType: 'editable'});
`);
  const hostPortsFixture = path.join(temporaryRoot, 'host-ports.mts');
  await copyFile(new URL('./fixtures/host-ports.mts', import.meta.url), hostPortsFixture);
  const program = ts.createProgram([typeFixture, hostPortsFixture], {
    noEmit: true, strict: true, types: [], target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext,
  });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: file => file, getCurrentDirectory: () => temporaryRoot, getNewLine: () => '\n',
  }));
  console.log('PASS: 共享模型、宿主端口及轻量入口的导出、主入口兼容、共享符号身份、隔离 Node 运行及严格类型检查');
} finally {
  await rm(temporaryRoot, {recursive: true, force: true});
}
