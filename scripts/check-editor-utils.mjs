#!/usr/bin/env node

import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const workspaceRoot = fileURLToPath(new URL('../', import.meta.url));
const packageRoot = path.resolve(workspaceRoot, process.argv[2] ?? 'dist/editor');
const manifest = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'));
const entry = manifest.exports?.['./global/utils'];
assert.ok(entry?.types && entry?.default, '发布包缺少 utils 的运行时或类型导出');
const exportedNames = [
  'FetchUtils', 'characterAtDelta', 'compareSimpleValue', 'debounce',
  'deltaStrLength', 'deltaToString', 'downloadFile', 'extMimeMap', 'figmaUrlRegex',
  'getCommonAttributesFromDeltas', 'getFilenameFromContentDisposition', 'getImageExt',
  'getLinesByRange', 'getRandomDarkColor', 'getSafeFileName', 'getSameAttributeRange',
  'getScrollContainer', 'isFigmaUrl', 'isJueJinUrl', 'isObjectInclude', 'isScrollable',
  'isSimpleTypeEqual', 'isUrl', 'jueJinUrlRegex', 'mimeExtMap', 'nextTick', 'noop',
  'randomColor', 'readImageIntrinsicSize', 'sleep', 'sliceDelta', 'splitDeltaByLineBreak',
  'throttle', 'toCamelCase', 'urlRegex',
];

// 主入口必须直接转导出同一模块，避免 Map/函数在两个入口各自实例化。
const mainFile = path.join(packageRoot, manifest.exports['.'].default);
const mainSource = ts.createSourceFile(mainFile, await readFile(mainFile, 'utf8'), ts.ScriptTarget.Latest, true);
const forwardedNames = new Set();
for (const node of mainSource.statements) {
  if (!ts.isExportDeclaration(node) || !node.moduleSpecifier || !ts.isStringLiteral(node.moduleSpecifier)) continue;
  const specifier = node.moduleSpecifier.text;
  if (specifier !== '@ccc/blockcraft/global/utils' &&
      path.resolve(path.dirname(mainFile), specifier) !== path.resolve(packageRoot, entry.default)) continue;
  if (!node.exportClause) {
    for (const name of exportedNames) forwardedNames.add(name);
  } else if (ts.isNamedExports(node.exportClause)) {
    for (const element of node.exportClause.elements) forwardedNames.add(element.name.text);
  }
}
for (const name of exportedNames) assert.ok(forwardedNames.has(name), `主入口没有转导出 utils.${name}`);

// 隔离包只包含此入口；任何对主入口或第三方包的意外依赖都会导致导入/类型检查失败。
const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'blockcraft-utils-'));
try {
  const isolatedPackage = path.join(temporaryRoot, 'node_modules/@ccc/blockcraft');
  await mkdir(isolatedPackage, { recursive: true });
  await writeFile(path.join(isolatedPackage, 'package.json'), JSON.stringify(manifest));
  for (const target of [entry.default, entry.types]) {
    const destination = path.join(isolatedPackage, target);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(path.join(packageRoot, target), destination);
  }

  const fixture = `
import assert from 'node:assert/strict';
import * as files from '@ccc/blockcraft/global/utils';
assert.equal(typeof window, 'undefined');
assert.equal(typeof document, 'undefined');
assert.deepEqual(Object.keys(files).sort(), ${JSON.stringify(exportedNames)}.sort());
assert.equal(files.extMimeMap.get('pdf'), 'application/pdf');
assert.equal(files.mimeExtMap.get('image/jpeg'), 'jpeg');
assert.equal(files.extMimeMap.get('xml'), 'text/xml');
assert.equal(files.extMimeMap.get('3gp'), 'video/3gpp');
assert.equal(files.extMimeMap.get('3g2'), 'video/3gpp2');
for (const key of ['PDF', '.pdf', 'unknown-extension']) {
  assert.equal(files.extMimeMap.get(key), undefined);
}
assert.equal(files.getSafeFileName('a:b.pdf'), 'a b.pdf');
assert.equal(files.getFilenameFromContentDisposition('attachment; filename="report.pdf"'), 'report.pdf');
assert.equal(files.getFilenameFromContentDisposition('attachment'), undefined);
assert.equal(files.getImageExt('https://example.com/photo.PNG?download=1'), 'png');
assert.equal(files.getImageExt('invalid'), '');
const deltas = [{insert: 'ab', attributes: {'a:bold': true}}, {insert: {image: 'img'}}, {insert: 'cd'}];
assert.deepEqual(files.sliceDelta(deltas, 1, 4), [
  {insert: 'b', attributes: {'a:bold': true}}, {insert: {image: 'img'}}, {insert: 'c'},
]);
assert.equal(files.deltaToString(deltas, '[image]'), 'ab[image]cd');
assert.equal(files.deltaStrLength(deltas), 5);
assert.deepEqual(files.getLinesByRange('one\\ntwo\\nthree', 4, 7), {
  before: ['one\\n'], current: ['two\\n'], after: ['three\\n'],
});
assert.equal(files.toCamelCase('font-size'), 'fontSize');
assert.equal(files.isUrl('https://example.com'), true);
assert.equal(files.compareSimpleValue('2', 1), 1);
assert.equal(files.isObjectInclude({a: 1, b: 2}, {a: 1}), true);
assert.equal(await files.readImageIntrinsicSize('https://example.com/unfetched.png'), null);
`;
  await writeFile(path.join(temporaryRoot, 'check.mjs'), fixture);
  const result = spawnSync(process.execPath, ['check.mjs'], { cwd: temporaryRoot, encoding: 'utf8' });
  assert.equal(result.status, 0, result.error?.message ?? result.stderr);

  const typeFixture = path.join(temporaryRoot, 'check.mts');
  await writeFile(typeFixture, `
import { ${exportedNames.join(', ')}, type IPoint, type ImageIntrinsicSize } from '@ccc/blockcraft/global/utils';
const mime: string | undefined = extMimeMap.get('pdf');
const ext: string | undefined = mimeExtMap.get('application/pdf');
const safe: string = getSafeFileName('report.pdf');
const filename: string | undefined = getFilenameFromContentDisposition('attachment');
const image: string = getImageExt('https://example.com/image.png');
const download: (url: string | Blob, filename?: string) => Promise<void> = downloadFile;
const point: IPoint = {x: 1, y: 2};
const size: ImageIntrinsicSize = {width: 2, height: 1, ar: 2};
const delta = sliceDelta([{insert: 'a', attributes: {'s:color': 'red', 't:fs': 1.25}}]);
const style: string | null | undefined = delta[0].attributes?.['s:custom'];
// @ts-expect-error 样式索引不能接受数字，声明打包不得丢失约束。
sliceDelta([{insert: 'a', attributes: {'s:custom': 1}}]);
// @ts-expect-error 语义字号仍是数字。
sliceDelta([{insert: 'a', attributes: {'t:fs': 'large'}}]);
const lines: string[] = getLinesByRange('a', 0, 1).current;
`);
  const program = ts.createProgram([typeFixture], {
    noEmit: true, strict: true, types: [], target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext,
  });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: file => file,
    getCurrentDirectory: () => temporaryRoot,
    getNewLine: () => '\n',
  }));
  console.log('PASS: utils 全部导出、主入口共享实现、独立 Node 运行及严格类型检查');
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
