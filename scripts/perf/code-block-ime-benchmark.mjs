import {chromium} from '@playwright/test';
import {writeFile} from 'node:fs/promises';

// 使用已有 Playground，不连接用户浏览器或改写产品文件。
// BENCH_SMOKE=1 BENCH_LINES=100 node scripts/perf/code-block-ime-benchmark.mjs /tmp/ime-smoke.json
// 默认正式测量：每种规模/操作/路径 1 次首样本、3 次预热、9 次采样。
const smoke = process.env.BENCH_SMOKE === '1';
const readCount = (name, fallback, minimum) => {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < minimum) throw new Error(`${name} must be an integer >= ${minimum}`);
  return value;
};
const samples = readCount('BENCH_SAMPLES', smoke ? 1 : 9, smoke ? 1 : 9);
const warmup = readCount('BENCH_WARMUP', smoke ? 1 : 3, smoke ? 0 : 3);
const sizes = (process.env.BENCH_LINES || (smoke ? '100' : '100,1000,5000')).split(',').map(Number);
if (sizes.some(size => !Number.isInteger(size) || size < 3)) throw new Error('BENCH_LINES must contain integer line counts >= 3');
const modes = (process.env.BENCH_MODES || 'current,legacy-ime-path').split(',');
if (modes.some(mode => !['current', 'legacy-ime-path'].includes(mode))) throw new Error('Unsupported BENCH_MODES');
const positions = (process.env.BENCH_POSITIONS || 'line-middle').split(',');
if (positions.some(position => !['line-start', 'line-middle'].includes(position))) throw new Error('Unsupported BENCH_POSITIONS');
const url = process.env.BENCH_URL || 'http://127.0.0.1:8081';
const browser = await chromium.launch({
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? {executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH} : {}),
});
const report = {
  browser: 'chromium', browserVersion: browser.version(), url, smoke, samples, warmup, positions,
  revision: process.env.BENCH_REVISION ?? null,
  measuredAt: new Date().toISOString(),
  notes: [
    'Native Chromium CDP IME: imeSetComposition then insertText, or empty imeSetComposition for cancellation.',
    'All durations use page performance.now(); stage timings exclude CDP transport, candidate selection, initial syntax loading and caret setup.',
    'syncStartMs spans compositionStart dispatch; sessionStartMs includes acquireCaretMs. prepareCommitMs includes releaseCaretMs. These nested timings are not additive.',
    'sessionEndMs sums all session.end calls in the operation, including a reset during start. One preedit update per sample isolates start/end cost; multi-update candidate correctness is covered by the line-start IME E2E suite.',
    'startAndRecoveryMs = syncStartMs + recoveryFromCommitMs excludes the preedit/CDP gap. elapsedStartToRecoveryMs is diagnostic wall time including that gap and correctness reads, not a pure processing metric.',
    'syncCommitMs spans the existing compositionEnd event dispatcher; runtimeRenderMs and syncHighlightMs are nested portions, not additive.',
    'afterTwoFramesMs ends after two animation-frame callbacks following valid recovery and idle generation; it is not a paint or compositor-present measurement.',
    'cold means the first IME operation on a freshly created, already highlighted block; it is not a cold browser/module load.',
    'legacy-ime-path bypasses only _renderCompositionSnapshot, exercising the existing synchronous full render and subsequent full renderCode with current lexer, line DOM, observer and scheduling.',
    'Modes have separate equally initialized contexts and alternate by round. Report median/min/max for measured samples only; no P95 or fixed timing assertion.',
    'Each isolated document contains only the measured code block; bringToFront and two preparatory animation frames run outside each measurement.',
  ], results: [],
};

async function setup(lines, action, mode, position) {
  const context = await browser.newContext({viewport: {width: 1440, height: 900}});
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.route('https://affine-worker.toeverything.workers.dev/api/worker/link-preview', route =>
    route.fulfill({status: 200, contentType: 'application/json', body: '{}', headers: {
      'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'Content-Type',
    }}));
  await page.routeWebSocket('**', socket => socket.close());
  await page.goto(url, {waitUntil: 'domcontentloaded'});
  await page.getByRole('button', {name: '初始化', exact: true}).click();
  await page.waitForSelector('div.code-block pre.edit-container c-text');
  const metadata = await page.evaluate(async ({lines, action, mode, position}) => {
    const doc = window.ng.getComponent(document.querySelector('block-craft-editor')).doc;
    const source = Array.from({length: lines}, (_, i) =>
      `const value${i} = items.map(item => ({ id: item.id, label: "row${i}" }));`,
    ).join('\n');
    const snapshot = doc.schemas.createSnapshot('code', [source]);
    snapshot.props.lang = 'TypeScript';
    const [id] = doc.crud.insertBlockSnapshots(doc.rootId, 0, [snapshot]);
    const otherCount = doc.model.getChildrenIds(doc.rootId).length - 1;
    if (otherCount > 0) doc.crud.deleteBlocks(doc.rootId, 1, otherCount);
    if (doc.model.getChildrenIds(doc.rootId).length !== 1) throw new Error('Benchmark document is not isolated');
    await doc.navigateToBlock(id);
    const block = doc.getBlockById(id);
    const runtime = block.runtime;
    await runtime.renderCode();
    await runtime.renderCode();
    const nextFrame = () => new Promise(resolve => requestAnimationFrame(() => resolve(performance.now())));
    await nextFrame();
    await nextFrame();
    if (typeof runtime._renderCompositionSnapshot !== 'function') throw new Error('Latest IME runtime is not loaded');
    if (typeof runtime.acquireCompositionCaret !== 'function') throw new Error('Composition caret lease runtime is not loaded');
    const textInDom = () => [...block.containerElement.querySelectorAll('c-text')].map(node => node.textContent).join('');
    if (textInDom() !== source || block.textContent() !== source) throw new Error('Initial DOM/model mismatch');
    const lineNodes = () => [...block.containerElement.querySelectorAll(':scope > c-line')];
    if (lineNodes().length !== lines) throw new Error('Logical line container count mismatch');
    const state = {active: null, pending: 0, action, mode};
    const session = doc.inputManger.compositionSession;
    const targetLine = Math.floor(lines / 2);
    const targetStart = source.split('\n').slice(0, targetLine).reduce((offset, line) => offset + line.length + 1, 0);
    const caret = () => {
      const selection = getSelection();
      return selection?.focusNode && block.containerElement.contains(selection.focusNode)
        ? runtime.domPointToModel(selection.focusNode, selection.focusOffset) : null;
    };
    const originalComposition = runtime._renderCompositionSnapshot;
    runtime._renderCompositionSnapshot = function(...args) {
      if (mode === 'legacy-ime-path') return false;
      return originalComposition.apply(this, args);
    };
    for (const [name, key] of [['start', 'sessionStartMs'], ['prepareCommit', 'prepareCommitMs'], ['end', 'sessionEndMs']]) {
      const original = session[name];
      session[name] = function(...args) {
        const sample = state.active;
        const start = performance.now();
        try { return original.apply(this, args); }
        finally { if (sample) sample[key] += performance.now() - start; }
      };
    }
    const originalAcquire = runtime.acquireCompositionCaret;
    runtime.acquireCompositionCaret = function(...args) {
      const sample = state.active;
      const start = performance.now();
      let release;
      try { release = originalAcquire.apply(this, args); }
      finally { if (sample) sample.acquireCaretMs += performance.now() - start; }
      if (!release || !sample) return release;
      sample.acquiredCarets++;
      return (...values) => {
        const start = performance.now();
        try { return release(...values); }
        finally { sample.releaseCaretMs += performance.now() - start; sample.releasedCarets++; }
      };
    };
    for (const [owner, name, key] of [
      [runtime, 'render', 'runtimeRenderMs'],
      [runtime, '_renderCompositionSnapshot', 'syncHighlightMs'],
      [runtime.scrollBlot, 'build', 'buildMs'],
    ]) {
      const original = owner[name];
      owner[name] = function(...args) {
        const sample = state.active;
        const start = performance.now();
        try { return original.apply(this, args); }
        finally {
          if (sample) {
            if (key === 'buildMs') { sample.builds++; sample.buildMs += performance.now() - start; }
            else if (sample.inCommit) sample[key] += performance.now() - start;
          }
        }
      };
    }
    for (const name of ['renderCode', 'diffHighLight']) {
      const original = runtime[name];
      runtime[name] = async function(...args) {
        const sample = state.active;
        const beforeGeneration = this._renderToken;
        const start = performance.now();
        state.pending++;
        try { return await original.apply(this, args); }
        finally {
          state.pending--;
          if (sample?.commitStart !== undefined && name === 'renderCode') {
            const end = performance.now();
            // An early guard or a superseded request must never satisfy completion.
            const valid = this._renderToken === beforeGeneration + 1 &&
              doc.inputManger.compositionSession.isIdle && block.textContent() === sample.expected;
            sample.recoveries.push({start, duration: end - start, end,
              generation: this._renderToken, valid});
          }
        }
      };
    }
    const settle = async sample => {
      const deadline = performance.now() + 60_000;
      while (performance.now() < deadline) {
        await nextFrame();
        const recovery = sample.recoveries.findLast(item => item.valid && item.generation === runtime._renderToken);
        if (!recovery || state.pending || runtime._canonicalRenderFrame !== null ||
            !doc.inputManger.compositionSession.isIdle) continue;
        const generation = runtime._renderToken;
        await nextFrame();
        const end = await nextFrame();
        if (generation !== runtime._renderToken || state.pending || runtime._canonicalRenderFrame !== null ||
            !doc.inputManger.compositionSession.isIdle) continue;
        if (block.textContent() !== sample.expected || textInDom() !== sample.expected || caret() !== sample.caret) {
          throw new Error(`Final DOM/model/caret mismatch (${mode}/${action}; caret ${caret()} vs ${sample.caret})`);
        }
        const native = getSelection();
        if (!native?.isCollapsed || !native.anchorNode || !block.containerElement.contains(native.anchorNode) ||
            runtime.domPointToModel(native.anchorNode, native.anchorOffset) !== sample.caret) {
          throw new Error('Final native anchor/collapse mismatch');
        }
        const expectedCarets = position === 'line-start' ? 1 : 0;
        if (sample.acquiredCarets !== expectedCarets || sample.releasedCarets !== expectedCarets ||
            block.containerElement.querySelector('[data-cursor-blot]')) {
          throw new Error(`Unexpected caret lease lifecycle (${position}): ${sample.acquiredCarets}/${sample.releasedCarets}`);
        }
        const currentLines = lineNodes();
        const identity = {
          firstLine: currentLines[0] === sample.nodes[0], lastLine: currentLines.at(-1) === sample.nodes[1],
          firstLeaf: sample.nodes[2].isConnected, lastLeaf: sample.nodes[3].isConnected,
          targetLine: currentLines[targetLine] === sample.targetRow,
        };
        const preserved = Object.values(identity).every(Boolean);
        const replaced = Object.values(identity).every(value => !value);
        if (mode === 'current' ? sample.builds !== 0 || !preserved : sample.builds !== 2 || !replaced) {
          throw new Error(`Unexpected IME path (${mode}/${action}): builds=${sample.builds}, identity=${JSON.stringify(identity)}`);
        }
        const result = {round: sample.round, syncStartMs: sample.syncStartMs,
          sessionStartMs: sample.sessionStartMs, acquireCaretMs: sample.acquireCaretMs,
          prepareCommitMs: sample.prepareCommitMs, releaseCaretMs: sample.releaseCaretMs, sessionEndMs: sample.sessionEndMs,
          acquiredCarets: sample.acquiredCarets, releasedCarets: sample.releasedCarets,
          syncCommitMs: sample.syncCommitMs,
          runtimeRenderMs: sample.runtimeRenderMs, syncHighlightMs: sample.syncHighlightMs,
          recoveryMs: recovery.duration, recoveryFromCommitMs: recovery.end - sample.commitStart,
          startAndRecoveryMs: sample.syncStartMs + recovery.end - sample.commitStart,
          elapsedStartToRecoveryMs: recovery.end - sample.startTime,
          afterTwoFramesMs: end - sample.commitStart, buildMs: sample.buildMs, builds: sample.builds,
          identity, validRecoveries: sample.recoveries.filter(item => item.valid).length,
          staleRecoveries: sample.recoveries.filter(item => !item.valid).length,
          modelDomCaretValid: true};
        return result;
      }
      throw new Error(`IME recovery did not settle (${mode}/${action})`);
    };
    const originalRun = doc.event.run;
    doc.event.run = function(name, ...args) {
      const sample = state.active;
      if (name === 'compositionStart' && sample) {
        sample.startTime = performance.now();
        try { return originalRun.call(this, name, ...args); }
        finally { sample.syncStartMs += performance.now() - sample.startTime; }
      }
      if (name !== 'compositionEnd' || !sample) return originalRun.call(this, name, ...args);
      sample.commitStart = performance.now();
      sample.inCommit = true;
      try { return originalRun.call(this, name, ...args); }
      finally {
        sample.syncCommitMs = performance.now() - sample.commitStart;
        sample.inCommit = false;
        sample.done = settle(sample);
        // Keep failures observable by the caller even if CDP returns after settlement.
        sample.done.catch(() => {});
      }
    };
    window.__codeImeBenchmark = {
      begin(round) {
        if (state.active || state.pending || runtime._canonicalRenderFrame !== null) throw new Error('Previous operation is still active');
        if (document.visibilityState !== 'visible') throw new Error('Benchmark page must be foreground and visible');
        const before = block.textContent();
        const offset = position === 'line-start' ? targetStart : source.indexOf('"row' + targetLine) + 4;
        doc.selection.setCursorAt(block, offset);
        doc.root.hostElement.focus({preventScroll: true});
        const rows = lineNodes();
        const leaves = [...block.containerElement.querySelectorAll('c-text')];
        state.active = {round, expected: action === 'commit' ? before.slice(0, offset) + '中文输入' + before.slice(offset) : before,
          caret: offset + (action === 'commit' ? 4 : 0), nodes: [rows[0], rows.at(-1), leaves[0], leaves.at(-1)],
          offset, targetRow: rows[targetLine], previousRow: rows[targetLine - 1], previousHTML: rows[targetLine - 1].innerHTML,
          syncStartMs: 0, sessionStartMs: 0, acquireCaretMs: 0, prepareCommitMs: 0, releaseCaretMs: 0,
          sessionEndMs: 0, acquiredCarets: 0, releasedCarets: 0,
          runtimeRenderMs: 0, syncHighlightMs: 0, buildMs: 0, builds: 0, recoveries: []};
        return before;
      },
      composing(before) {
        if (!doc.inputManger.compositionSession.isActive || block.textContent() !== before) {
          throw new Error('Native IME did not enter an uncommitted composition');
        }
        const sample = state.active;
        const rows = lineNodes();
        const expected = before.slice(0, sample.offset) + 'zhongwen' + before.slice(sample.offset);
        const actual = rows.map(row => row.textContent.replace(/[\u200B\u200C]/g, '')).join('');
        if (rows.length !== lines || rows[targetLine] !== sample.targetRow || rows[targetLine - 1] !== sample.previousRow ||
            rows[targetLine - 1].innerHTML !== sample.previousHTML || actual !== expected ||
            session.resolveInsertionPoint()?.index !== sample.offset) throw new Error('Preedit line/model/caret lease mismatch');
      },
      finish() {
        const sample = state.active;
        if (!sample?.done) throw new Error('compositionEnd dispatcher was not measured');
        return sample.done.then(result => { state.active = null; return result; });
      },
    };
    return {lines, characters: source.length, action, mode, position,
      coldCheckpoints: runtime._tokenizer._lines.filter(line => line.state).length,
      lineContainers: lineNodes().length, initialNodes: block.containerElement.querySelectorAll('*').length};
  }, {lines, action, mode, position});
  return {context, page, pageErrors, cdp: await context.newCDPSession(page), ...metadata, cold: null, warmupResults: [], samples: []};
}

async function measure(target, round) {
  await target.page.bringToFront();
  await target.page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const before = await target.page.evaluate(round => window.__codeImeBenchmark.begin(round), round);
  await target.page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await target.cdp.send('Input.imeSetComposition', {text: 'zhongwen', selectionStart: 8, selectionEnd: 8});
  await target.page.evaluate(before => window.__codeImeBenchmark.composing(before), before);
  if (target.action === 'commit') await target.cdp.send('Input.insertText', {text: '中文输入'});
  else await target.cdp.send('Input.imeSetComposition', {text: '', selectionStart: 0, selectionEnd: 0});
  const result = await target.page.evaluate(() => window.__codeImeBenchmark.finish());
  if (target.pageErrors.length) throw new Error(`Page errors: ${target.pageErrors.join('; ')}`);
  return result;
}

const summarize = rows => Object.fromEntries([
  'syncStartMs', 'sessionStartMs', 'acquireCaretMs', 'prepareCommitMs', 'releaseCaretMs', 'sessionEndMs',
  'syncCommitMs', 'runtimeRenderMs', 'syncHighlightMs', 'recoveryMs',
  'recoveryFromCommitMs', 'startAndRecoveryMs', 'elapsedStartToRecoveryMs', 'afterTwoFramesMs', 'buildMs',
].map(key => {
  const sorted = rows.map(row => row[key]).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return [key, {median: sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2,
    min: sorted[0], max: sorted.at(-1)}];
}));

try {
  for (const [sizeIndex, lines] of sizes.entries()) {
    for (const position of positions) {
    for (const action of ['commit', 'cancel']) {
      const targets = [];
      try {
        for (const mode of modes) targets.push(await setup(lines, action, mode, position));
        const rounds = ['cold', ...Array.from({length: warmup}, (_, i) => `warmup-${i + 1}`),
          ...Array.from({length: samples}, (_, i) => `sample-${i + 1}`)];
        for (const [index, round] of rounds.entries()) {
          const ordered = (index + sizeIndex) % 2 ? [...targets].reverse() : targets;
          for (const target of ordered) {
            const value = await measure(target, round);
            if (round === 'cold') target.cold = value;
            else if (round.startsWith('warmup')) target.warmupResults.push(value);
            else target.samples.push(value);
          }
        }
        for (const {context, page, cdp, ...result} of targets) {
          result.summary = summarize(result.samples);
          report.results.push(result);
          console.log(JSON.stringify({lines, position, action, mode: result.mode, summary: result.summary}));
        }
      } finally {
        for (const target of targets) await target.context.close();
      }
    }
    }
  }
  if (process.argv[2]) await writeFile(process.argv[2], JSON.stringify(report, null, 2) + '\n');
} finally {
  await browser.close();
}
