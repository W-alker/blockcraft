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

const entryExports = {
  'global/utils': exportedNames,
  'global/env': ['IS_ANDROID', 'IS_ELECTRON', 'IS_FIREFOX', 'IS_IOS', 'IS_IPAD', 'IS_MAC', 'IS_MOBILE', 'IS_SAFARI', 'IS_WEB', 'IS_WINDOWS'],
  'global/logger': ['ConsoleLogger', 'NoopLogger'],
  'global/exceptions': ['BlockCraftError', 'ErrorCode', 'handleError'],
  'global/decorators': ['performanceTest'],
  'global/types': [],
  'global/resource-placeholder': ['ResourcePlaceholderController', 'destroyResourcePlaceholder', 'iframeResourcePlaceholderAdapter', 'imageResourcePlaceholderAdapter', 'videoResourcePlaceholderAdapter'],
};
entryExports.global = [...new Set(Object.values(entryExports).flat())];
const entries = Object.fromEntries(Object.keys(entryExports).map(name => {
  const entry = manifest.exports?.['./' + name];
  assert.ok(entry?.types && entry?.default, `发布包缺少 ${name} 的运行时或类型导出`);
  return [name, entry];
}));

// 主入口 -> global 聚合入口 -> 子入口，始终转导出同一份实现。
const mainFile = path.join(packageRoot, manifest.exports['.'].default);
const mainSource = ts.createSourceFile(mainFile, await readFile(mainFile, 'utf8'), ts.ScriptTarget.Latest, true);
const globalFile = path.join(packageRoot, entries.global.default);
const globalSource = ts.createSourceFile(globalFile, await readFile(globalFile, 'utf8'), ts.ScriptTarget.Latest, true);
for (const [name, entry] of Object.entries(entries)) {
  const source = name === 'global' ? mainSource : globalSource;
  const sourceFile = name === 'global' ? mainFile : globalFile;
  const forwardedNames = new Set();
  for (const node of source.statements) {
    if (!ts.isExportDeclaration(node) || !node.moduleSpecifier || !ts.isStringLiteral(node.moduleSpecifier)) continue;
    const specifier = node.moduleSpecifier.text;
    if (specifier !== '@ccc/blockcraft/' + name &&
        path.resolve(path.dirname(sourceFile), specifier) !== path.resolve(packageRoot, entry.default)) continue;
    if (!node.exportClause) {
      for (const symbol of entryExports[name]) forwardedNames.add(symbol);
    } else if (ts.isNamedExports(node.exportClause)) {
      for (const element of node.exportClause.elements) forwardedNames.add(element.name.text);
    }
  }
  for (const symbol of forwardedNames) {
    assert.ok(entryExports[name].includes(symbol), `主入口错误地从 ${name} 转导出 ${symbol}`);
  }
  const legacyExports = entryExports[name];
  for (const symbol of legacyExports) assert.ok(forwardedNames.has(symbol), `主入口没有转导出 ${name}.${symbol}`);
}

// 隔离包仅复制轻量入口；主入口及全部第三方依赖都不可用。
const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'blockcraft-global-entrypoints-'));
try {
  const isolatedPackage = path.join(temporaryRoot, 'node_modules/@ccc/blockcraft');
  await mkdir(isolatedPackage, { recursive: true });
  await writeFile(path.join(isolatedPackage, 'package.json'), JSON.stringify(manifest));
  for (const target of Object.values(entries).flatMap(entry => [entry.default, entry.types])) {
    const destination = path.join(isolatedPackage, target);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(path.join(packageRoot, target), destination);
  }

  const fixture = `
import assert from 'node:assert/strict';
import * as files from '@ccc/blockcraft/global/utils';
const globalModules = {};
for (const [name, expected] of Object.entries(${JSON.stringify(entryExports)})) {
  globalModules[name] = await import('@ccc/blockcraft/' + name);
  assert.deepEqual(Object.keys(globalModules[name]).sort(), expected.sort(), name);
}
for (const [name, symbols] of Object.entries(${JSON.stringify(entryExports)})) {
  for (const symbol of symbols) assert.equal(globalModules.global[symbol], globalModules[name][symbol], name + '.' + symbol);
}
assert.ok(new globalModules.global.BlockCraftError(globalModules.global.ErrorCode.UserAbortError, 'cancelled') instanceof globalModules['global/exceptions'].BlockCraftError);
const env = globalModules['global/env'];
assert.equal(env.IS_WEB, false);
for (const value of Object.values(env)) assert.equal(typeof value, 'boolean');
const {BlockCraftError, ErrorCode, handleError} = globalModules['global/exceptions'];
const runtimeError = new BlockCraftError(ErrorCode.UserAbortError, 'cancelled');
assert.equal(runtimeError.isFatal, false);
const fatalError = new BlockCraftError(ErrorCode.NoRootError, 'no root');
assert.equal(fatalError.isFatal, true);
assert.throws(() => handleError(fatalError), error => error.cause === fatalError);
const ordinaryError = new Error('original');
assert.throws(() => handleError(ordinaryError), error => error === ordinaryError);
const {NoopLogger, ConsoleLogger} = globalModules['global/logger'];
new NoopLogger().error('ignored');
const originalWarn = console.warn;
let logged;
try {
  console.warn = (...args) => {logged = args};
  new ConsoleLogger().warn('message', 42);
} finally {console.warn = originalWarn}
assert.deepEqual(logged, ['message', 42]);

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
import type {Logger} from '@ccc/blockcraft/global/logger';
import {NoopLogger} from '@ccc/blockcraft/global/logger';
import type {SimpleValue, SimpleRecord, UnknownArray} from '@ccc/blockcraft/global/types';
import {BlockCraftError, ErrorCode} from '@ccc/blockcraft/global/exceptions';
import {IS_WEB} from '@ccc/blockcraft/global/env';
import {performanceTest} from '@ccc/blockcraft/global/decorators';
import {ResourcePlaceholderController, imageResourcePlaceholderAdapter, type ResourcePlaceholderState, type ResourcePlaceholderAdapter} from '@ccc/blockcraft/global/resource-placeholder';
import {extMimeMap as aggregateMime, ResourcePlaceholderController as AggregateController, BlockCraftError as AggregateError, type SimpleValue as AggregateValue, type Logger as AggregateLogger} from '@ccc/blockcraft/global';
const aggregateValue: AggregateValue = aggregateMime.get('pdf');
const aggregateLogger: AggregateLogger = new NoopLogger();
const aggregateError: BlockCraftError = new AggregateError(ErrorCode.UserAbortError, 'cancelled');
const aggregateController: typeof ResourcePlaceholderController = AggregateController;
const logger: Logger = new NoopLogger();
const value: SimpleValue = ['a', 1];
const record: SimpleRecord = {data: value};
const unknowns: UnknownArray = [record];
const error: Error = new BlockCraftError(ErrorCode.UserAbortError, 'cancelled');
const web: boolean = IS_WEB;
performanceTest()({}, 'read', {value: () => 1});
const adapter: ResourcePlaceholderAdapter<HTMLImageElement> = imageResourcePlaceholderAdapter;
const controller = new ResourcePlaceholderController(document.createElement('div'), {
  onStateChange: (state: ResourcePlaceholderState) => logger.debug(state),
});

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
  console.log('PASS: global 聚合入口及 7 个子入口的导出、身份一致性、主入口兼容、隔离 Node 运行及严格类型检查');
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
