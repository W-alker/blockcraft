import {chromium} from '@playwright/test';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';

// 独立工作量计数，不进入正式 IME 耗时基准。
const url = process.env.BENCH_URL ?? 'http://127.0.0.1:8081';
const sizes = (process.env.BENCH_LINES ?? '1000,5000').split(',').map(Number);
const position = process.env.BENCH_POSITION ?? 'line-middle';
if (!['line-start', 'line-middle'].includes(position)) throw new Error('Unsupported BENCH_POSITION');
if (sizes.some(value => !Number.isInteger(value) || value < 2)) throw new Error('BENCH_LINES must contain integers >= 2');
const output = process.argv[2] ?? '/private/tmp/blockcraft-ime-integrity-counts.json';
const browser = await chromium.launch({headless: true,
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? {executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH} : {})});
const report = {measuredAt: new Date().toISOString(), revision: process.env.BENCH_REVISION ?? execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim(),
  browserVersion: browser.version(), url, diagnosticsOnly: true,
  notes: ['原生 Chromium CDP 单轮候选更新；仅检查次数，不是操作系统候选窗自动化或耗时测量。',
    'textCheckedLeaves 仅统计 inspect 返回 predicate 执行期间实际调用 _isTextIntact 的次数，textCheckedRows 是这些调用所属 c-line 去重数；不包括 capture/repair 的潜在调用、纯 Embed/Break 行，也不保证某行全部叶子均已检查。',
    '首次完整检查在创建目标代码块前安装原型包装，按目标 container 过滤，保存每次 inspect 返回 predicate 的实际调用及叶子检查；不强制清缓存。',
    'syncEnd/postEnd 分别是 compositionEnd 同步分发及本次有效 renderCode 恢复完成后跨两帧前；验证读取不触发计数。'],
  scriptSha256: crypto.createHash('sha256').update(fs.readFileSync(new URL(import.meta.url))).digest('hex'), results: []};

try {
  for (const lines of sizes) for (const action of ['commit', 'cancel']) {
    const context = await browser.newContext({viewport: {width: 1440, height: 900}});
    try {
      const page = await context.newPage();
      const pageErrors = [];
      page.on('pageerror', error => pageErrors.push(error.message));
      await page.route('https://affine-worker.toeverything.workers.dev/api/worker/link-preview', route => route.fulfill({
        status: 200, contentType: 'application/json', body: '{}', headers: {
          'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'Content-Type',
        }}));
      await page.routeWebSocket('**', socket => socket.close());
      await page.goto(url, {waitUntil: 'domcontentloaded'});
      await page.getByRole('button', {name: '初始化', exact: true}).click();
      await page.waitForSelector('div.code-block pre.edit-container c-text');
      const initial = await page.evaluate(async ({lines, action, position}) => {
        const doc = window.ng.getComponent(document.querySelector('block-craft-editor')).doc;
        const existing = window.ng.getComponent(document.querySelector('div.code-block'));
        const proto = Object.getPrototypeOf(existing.runtime._lineIntegrity);
        const originalInspect = proto.inspect, originalTextCheck = proto._isTextIntact;
        if (typeof originalInspect !== 'function' || typeof originalTextCheck !== 'function') throw new Error('Integrity count hooks unavailable');
        let phase = 'initialFull', activePass = null;
        const passes = [];
        proto.inspect = function(scroll, container, ...args) {
          const pass = {container, phase, rows: new Set(), leaves: 0, predicates: 0};
          passes.push(pass);
          const predicate = originalInspect.call(this, scroll, container, ...args);
          return function(...values) {
            const previous = activePass;
            activePass = pass;
            pass.predicates++;
            try { return predicate.apply(this, values); }
            finally { activePass = previous; }
          };
        };
        proto._isTextIntact = function(blot, ...args) {
          if (activePass) {
            activePass.leaves++;
            activePass.rows.add(blot.domNode.parentElement);
          }
          return originalTextCheck.call(this, blot, ...args);
        };
        const source = Array.from({length: lines}, (_, i) =>
          `const value${i} = items.map(item => ({ id: item.id, label: "row${i}" }));`).join('\n');
        const snapshot = doc.schemas.createSnapshot('code', [source]);
        snapshot.props.lang = 'TypeScript';
        const [id] = doc.crud.insertBlockSnapshots(doc.rootId, 0, [snapshot]);
        const others = doc.model.getChildrenIds(doc.rootId).length - 1;
        if (others) doc.crud.deleteBlocks(doc.rootId, 1, others);
        await doc.navigateToBlock(id);
        const block = doc.getBlockById(id), runtime = block.runtime, container = block.containerElement;
        const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
        const domText = () => [...container.querySelectorAll('c-text')].map(node => node.textContent).join('');
        const rows = () => [...container.querySelectorAll(':scope > c-line')];
        const counts = selected => ({inspectCalls: selected.length,
          predicateCalls: selected.reduce((sum, pass) => sum + pass.predicates, 0),
          textCheckedLeaves: selected.reduce((sum, pass) => sum + pass.leaves, 0),
          textCheckedRows: new Set(selected.flatMap(pass => [...pass.rows])).size});
        const targetPasses = () => passes.filter(pass => pass.container === container);
        await runtime.renderCode();
        await runtime.renderCode();
        await frame(); await frame();
        if (block.textContent() !== source || domText() !== source || rows().length !== lines) throw new Error('Initial projection mismatch');
        const initialPasses = targetPasses().map(pass => counts([pass]));
        if (!initialPasses.some(pass => pass.textCheckedRows === lines)) throw new Error('Cold full integrity inspection was not observed');
        let builds = 0, pending = 0, validGeneration = null;
        const originalBuild = runtime.scrollBlot.build;
        runtime.scrollBlot.build = function(...args) { builds++; return originalBuild.apply(this, args); };
        const targetLine = Math.floor(lines / 2);
        const offset = position === 'line-start'
          ? source.split('\n').slice(0, targetLine).reduce((sum, line) => sum + line.length + 1, 0)
          : source.indexOf('"row' + targetLine) + 4;
        const expected = action === 'commit' ? source.slice(0, offset) + '中文输入' + source.slice(offset) : source;
        const expectedCaret = offset + (action === 'commit' ? 4 : 0);
        const beforeRows = rows(), leaves = [...container.querySelectorAll('c-text')];
        const identity = [beforeRows[0], beforeRows.at(-1), beforeRows[targetLine], leaves[0], leaves.at(-1)];
        const originalRenderCode = runtime.renderCode;
        runtime.renderCode = async function(...args) {
          const generation = this._renderToken;
          pending++;
          try {
            const value = await originalRenderCode.apply(this, args);
            if (this._renderToken === generation + 1 && doc.inputManger.compositionSession.isIdle && block.textContent() === expected) {
              validGeneration = this._renderToken;
            }
            return value;
          } finally { pending--; }
        };
        const run = doc.event.run;
        doc.event.run = function(name, ...args) {
          if (name === 'compositionStart') {
            phase = 'start';
            try { return run.call(this, name, ...args); }
            finally { phase = 'preedit'; }
          }
          if (name !== 'compositionEnd') return run.call(this, name, ...args);
          phase = 'syncEnd';
          try { return run.call(this, name, ...args); }
          finally { phase = 'postEnd'; }
        };
        phase = 'prepareCaret';
        doc.selection.setCursorAt(block, offset);
        doc.root.hostElement.focus({preventScroll: true});
        await frame(); await frame();
        phase = 'preedit';
        window.__codeImeIntegrityCounts = {
          checkPreedit() {
            if (!doc.inputManger.compositionSession.isActive || block.textContent() !== source ||
                doc.inputManger.compositionSession.resolveInsertionPoint()?.index !== offset) throw new Error('Native preedit/model mismatch');
            const actual = rows().map(row => row.textContent.replace(/[\u200B\u200C]/g, '')).join('');
            if (actual !== source.slice(0, offset) + 'zhongwen' + source.slice(offset)) throw new Error('Preedit DOM mismatch');
          },
          async finish() {
            const deadline = performance.now() + 60_000;
            while (performance.now() < deadline) {
              await frame();
              if (validGeneration !== runtime._renderToken || pending || runtime._canonicalRenderFrame !== null ||
                  !doc.inputManger.compositionSession.isIdle) continue;
              const generation = runtime._renderToken;
              await frame(); await frame();
              if (generation !== runtime._renderToken || pending || runtime._canonicalRenderFrame !== null) continue;
              phase = 'validation';
              const selection = getSelection(), currentRows = rows();
              if (block.textContent() !== expected || domText() !== expected || currentRows.length !== lines ||
                  !selection?.isCollapsed || !selection.anchorNode || !selection.focusNode ||
                  !container.contains(selection.anchorNode) || !container.contains(selection.focusNode) ||
                  runtime.domPointToModel(selection.anchorNode, selection.anchorOffset) !== expectedCaret ||
                  runtime.domPointToModel(selection.focusNode, selection.focusOffset) !== expectedCaret) throw new Error('Final model/DOM/caret mismatch');
              if (builds || currentRows[0] !== identity[0] || currentRows.at(-1) !== identity[1] ||
                  currentRows[targetLine] !== identity[2] || !identity[3].isConnected || !identity[4].isConnected ||
                  container.querySelector('[data-cursor-blot]')) throw new Error('Untouched DOM identity/build mismatch');
              return {syncEnd: counts(targetPasses().filter(pass => pass.phase === 'syncEnd')),
                postEnd: counts(targetPasses().filter(pass => pass.phase === 'postEnd')),
                builds, modelDomCaretValid: true, untouchedIdentityValid: true};
            }
            throw new Error('Native IME recovery did not settle');
          },
        };
        return {lines, action, position, characters: source.length, initialPasses};
      }, {lines, action, position});
      await page.bringToFront();
      const cdp = await context.newCDPSession(page);
      await cdp.send('Input.imeSetComposition', {text: 'zhongwen', selectionStart: 8, selectionEnd: 8});
      await page.evaluate(() => window.__codeImeIntegrityCounts.checkPreedit());
      if (action === 'commit') await cdp.send('Input.insertText', {text: '中文输入'});
      else await cdp.send('Input.imeSetComposition', {text: '', selectionStart: 0, selectionEnd: 0});
      const result = {...initial, ...await page.evaluate(() => window.__codeImeIntegrityCounts.finish()), pageErrors};
      if (pageErrors.length) throw new Error(`Page errors: ${pageErrors.join('; ')}`);
      report.results.push(result);
      console.log(JSON.stringify(result));
    } finally { await context.close(); }
  }
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  console.log(`Saved ${output}`);
} finally { await browser.close(); }
