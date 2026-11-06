import {chromium, firefox, webkit} from '@playwright/test';
import {writeFile} from 'node:fs/promises';

// 使用运行中的 Playground；每次运行创建独立浏览器上下文，不连接用户会话。
// node scripts/perf/code-block-benchmark.mjs /tmp/code-block.json
const output = process.argv[2];
const browserName = process.env.BENCH_BROWSER || 'chromium';
const sampleCount = Number(process.env.BENCH_SAMPLES || 5);
const warmupCount = Number(process.env.BENCH_WARMUP || 0);
const isolated = process.env.BENCH_ISOLATED === '1';
if (!Number.isInteger(sampleCount) || sampleCount < 1 || !Number.isInteger(warmupCount) || warmupCount < 0) {
  throw new Error('BENCH_SAMPLES must be a positive integer and BENCH_WARMUP a non-negative integer');
}
const browserType = {chromium, firefox, webkit}[browserName];
if (!browserType) throw new Error(`Unsupported browser: ${browserName}`);
const browser = await browserType.launch({
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH && browserName === 'chromium'
    ? {executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}
    : {}),
});
const samples = [];
try {
  for (const lines of (process.env.BENCH_LINES || '100,1000,5000').split(',').map(Number)) {
    const page = await browser.newPage({viewport: {width: 1440, height: 900}});
    // 防止开发服务器热更新在一次基准运行中替换产品代码。
    await page.routeWebSocket('**', socket => socket.close());
    await page.goto(process.env.BENCH_URL || 'http://127.0.0.1:8081', {waitUntil: 'domcontentloaded'});
    await page.getByRole('button', {name: '初始化', exact: true}).click();
    await page.waitForSelector('div.code-block pre.edit-container c-text');
    const sample = await page.evaluate(async ({lineCount, sampleCount, warmupCount, isolated}) => {
      const editor = document.querySelector('block-craft-editor');
      const doc = window.ng.getComponent(editor).doc;
      const source = Array.from({length: lineCount}, (_,i) =>
        `const value${i} = items.map(item => ({ id: item.id, label: "row${i}" }));`,
      ).join('\n');
      const existing = doc.getBlockById(editor.querySelector('div.code-block').dataset.blockId);
      // 先加载语言/主题，报告稳定编辑成本；模块下载不混入分词和 DOM 时间。
      existing.changeLanguage('TypeScript');
      await existing.runtime.renderCode();
      // changeLanguage schedules a canonical microtask which can supersede the
      // first explicit request; a second awaited request owns the warm result.
      await existing.runtime.renderCode();
      const prototype = Object.getPrototypeOf(existing.runtime);
      const events = [];
      const calls = [];
      for (const name of ['renderCode', 'diffHighLight', '_tokenize']) {
        const original = prototype[name];
        prototype[name] = async function(...args) {
          const start = performance.now();
          calls.push({name, id: this.container.closest('[data-block-id]')?.dataset.blockId, start});
          try { return await original.apply(this, args); }
          finally {
            events.push({name, id: this.container.closest('[data-block-id]')?.dataset.blockId,
              start, duration: performance.now() - start, end: performance.now()});
          }
        };
      }
      for (const [owner, name, textIndex, label] of [
        [existing.runtime._tokenizer, 'tokenize', 0, 'segmentedTokenize'],
        [existing.runtime._tokenProjection, 'project', 1, 'tokenProjection'],
      ]) {
        if (!owner) continue;
        const ownerPrototype = Object.getPrototypeOf(owner);
        const original = ownerPrototype[name];
        ownerPrototype[name] = function(...args) {
          const start = performance.now();
          try { return original.apply(this, args); }
          finally { events.push({name: label, characters: args[textIndex]?.length,
            start, duration: performance.now() - start, end: performance.now()}); }
        };
      }
      const waitFor = async predicate => {
        const deadline = performance.now() + 60000;
        while (!predicate()) {
          if (performance.now() > deadline) throw new Error('Highlighter did not finish');
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      };
      const snapshot = doc.schemas.createSnapshot('code', [source]);
      snapshot.props.lang = 'TypeScript';
      const start = performance.now();
      const [id] = doc.crud.insertBlockSnapshots(doc.rootId, 0, [snapshot]);
      const insertSyncMs = performance.now() - start;
      const cleanupStart = performance.now();
      if (isolated) {
        const otherCount = doc.model.getChildrenIds(doc.rootId).length - 1;
        if (otherCount > 0) doc.crud.deleteBlocks(doc.rootId, 1, otherCount);
      }
      const fixtureCleanupMs = isolated ? performance.now() - cleanupStart : 0;
      await doc.navigateToBlock(id);
      const block = doc.getBlockById(id);
      await waitFor(() => events.some(e => e.id === id && e.name === 'renderCode'));
      const first = events.find(e => e.id === id && e.name === 'renderCode');
      const firstTokenize = events.find(e => e.id === id && e.name === '_tokenize');
      const initialCalls = calls.filter(e => e.id === id);
      const initialPhases = events.filter(e => e.id === id || e.characters === source.length);
      const coldCheckpoints = block.runtime._tokenizer?._lines?.filter(line => line.state).length;
      const visibleText = () => [...block.containerElement.querySelectorAll('c-text')]
        .map(node => node.textContent).join('');
      if (visibleText() !== source || block.textContent() !== source) {
        throw new Error('Initial DOM/model text mismatch');
      }
      const initialNodes = block.containerElement.querySelectorAll('*').length;
      const lineContainers = block.containerElement.querySelectorAll(':scope > c-line').length;
      if (lineContainers && lineContainers !== lineCount) {
        throw new Error(`Logical line count mismatch (${lineContainers} !== ${lineCount})`);
      }
      const colors = new Set([...block.containerElement.querySelectorAll('c-text')]
        .map(node => getComputedStyle(node).color));
      if (colors.size < 2) throw new Error('Initial syntax highlighting is missing');
      const editSamples = [];
      const warmups = [];
      let timings = {};
      const measure = (owner, name, key) => {
        if (typeof owner?.[name] !== 'function') return;
        const original = owner[name];
        owner[name] = function(...args) {
          const t = performance.now();
          try { return original.apply(this, args); }
          finally {
            const value = timings[key] ||= {calls: 0, ms: 0};
            value.calls++;
            value.ms += performance.now() - t;
          }
        };
      };
      measure(block.runtime, 'applyDelta', 'runtimeApplyDelta');
      measure(block.runtime.scrollBlot, 'applyDelta', 'blotApplyDelta');
      measure(block, '_verifyBlotConsistency', 'consistencyCheck');
      measure(block.runtime.mapper, 'modelPointToDomPoint', 'modelToDom');
      measure(block.runtime.mapper, 'domPointToModelPoint', 'domToModel');
      measure(block.runtime._inlineFloatLayout, 'sync', 'floatLayoutSync');
      measure(block.runtime, '_patchLinesByBlot', 'linePatch');
      measure(block.runtime, '_restoreNativeSelection', 'restoreNativeSelection');
      for (let index = 0; index < warmupCount + sampleCount; index++) {
        const text = block.textContent();
        const at = source.indexOf('"row' + Math.floor(lineCount / 2)) + 4;
        doc.selection.setCursorAt(block, at);
        const eventCount = events.length;
        timings = {};
        const editStart = performance.now();
        doc.crud.replaceText(id, at, 0, 'x');
        const mutationMs = performance.now() - editStart;
        const selectionStart = performance.now();
        doc.selection.setCursorAt(block, at + 1);
        const caretMs = performance.now() - selectionStart;
        const syncMs = performance.now() - editStart;
        const syncBreakdown = JSON.parse(JSON.stringify(timings));
        const expected = text.slice(0, at) + 'x' + text.slice(at);
        await waitFor(() => events.slice(eventCount).some(e => e.id === id && e.name === 'diffHighLight'));
        const done = events.slice(eventCount).find(e => e.id === id && e.name === 'diffHighLight');
        const tokenized = events.slice(eventCount).find(e => e.id === id && e.name === '_tokenize');
        const wholeEditBreakdown = JSON.parse(JSON.stringify(timings));
        const sel = window.getSelection();
        const caret = sel?.focusNode && block.containerElement.contains(sel.focusNode)
          ? block.runtime.domPointToModel(sel.focusNode, sel.focusOffset) : null;
        if (visibleText() !== expected || block.textContent() !== expected || caret !== at + 1) {
          throw new Error(`Edited DOM/model/caret mismatch (caret=${caret}, expected=${at + 1})`);
        }
        (index < warmupCount ? warmups : editSamples).push({syncMs, mutationMs, caretMs, syncBreakdown, wholeEditBreakdown, tokenizeMs: tokenized?.duration,
          highlightMs: done.duration, totalMs: done.end - editStart});
      }
      return {lines: lineCount, characters: source.length, initialNodes, lineContainers,
        incrementalTokenizer: !!block.runtime._tokenizer,
        coldCheckpoints, initialCalls, initialPhases,
        initial: {insertSyncMs, fixtureCleanupMs, tokenizeMs: firstTokenize?.duration,
          renderMs: first.duration, totalMs: first.end - start}, warmups, edits: editSamples};
    }, {lineCount: lines, sampleCount, warmupCount, isolated});
    samples.push(sample);
    console.log(JSON.stringify(sample));
    await page.close();
  }
  const report = {browser: browserName, browserVersion: browser.version(),
    url: process.env.BENCH_URL || 'http://127.0.0.1:8081', measuredAt: new Date().toISOString(),
    sampleCount, warmupCount, isolated,
    note: 'Development Playground; warmed language/theme; initial render and model-owned edits. Editing warmups are recorded separately. Edit total includes highlight scheduling delay. With BENCH_ISOLATED=1, initial total also includes separately recorded fixture cleanup; cleanup precedes all edit timing. No browser paint timing assertion.',
    samples};
  if (output) await writeFile(output, JSON.stringify(report, null, 2) + '\n');
} finally {
  await browser.close();
}
