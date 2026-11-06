/**
 * Absolute placement browser benchmark. Run two isolated development playgrounds
 * from the same dependency installation; do not run other builds/tests in parallel.
 * See docs/absolute-placement-performance-2026-09-10.md for method and limitations.
 * PERF_MODES=flow,full,sparse; PERF_REPEATS=3; PERF_SMOKE=1 narrows to 100 paragraphs / 10 objects / full pagination.
 * Optional: PLACEMENT_BASELINE_URL, PLACEMENT_CURRENT_URL, PLACEMENT_PERF_OUTPUT,
 * PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH. Browser contexts contain only synthetic data.
 */
const { chromium } = require('@playwright/test');
const fs = require('fs');
const OUT =
  process.env.PLACEMENT_PERF_OUTPUT ||
  require('path').join(process.cwd(), 'tmp/placement-performance');
fs.mkdirSync(OUT, { recursive: true });
const q = (a, p) =>
  a.length
    ? [...a].sort((x, y) => x - y)[
        Math.min(a.length - 1, Math.floor(a.length * p))
      ]
    : 0;
(async () => {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {}),
    args: [
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
    ],
  });
  const configs = process.env.PERF_SMOKE
    ? [{ n: 100, a: 10, mode: 'full' }]
    : [
        ...(process.env.PERF_MODES || 'flow,full,sparse').split(',').flatMap((mode) => [
          { n: 100, a: 10, mode },
          { n: 1000, a: 100, mode },
          { n: 5000, a: 500, mode },
        ]),
      ];
  let results = [];
  for (let rep = 0; rep < Number(process.env.PERF_REPEATS || 1); rep++)
    for (const cfg of configs)
      for (const version of rep % 2
        ? ['current', 'baseline']
        : ['baseline', 'current']) {
        const context = await browser.newContext({
          viewport: { width: 1440, height: 1000 },
        });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', (e) => errors.push(e.message));
        page.setDefaultTimeout(90000);
        console.log('START', rep, version, JSON.stringify(cfg));
        try {
          await page.goto(
            version === 'current'
              ? process.env.PLACEMENT_CURRENT_URL || 'http://127.0.0.1:8181'
              : process.env.PLACEMENT_BASELINE_URL || 'http://127.0.0.1:8182',
          );
          await page.waitForFunction(
            () =>
              window.ng?.getComponent(
                document.querySelector('block-craft-editor'),
              )?.doc,
          );
          const init = await page.evaluate(async ({ n, a, mode }) => {
            const ed = window.ng.getComponent(
              document.querySelector('block-craft-editor'),
            );
            const d = ed.doc;
            window.d = d;
            d.virtualization.config.enabled = true;
            d.virtualization.config.idlePrefetch = false;
            const paras = Array.from({ length: n }, (_, i) =>
              d.schemas.createSnapshot('paragraph', [
                [
                  {
                    insert: `第 ${i + 1} 段：性能测试使用相同的正文内容与绝对定位图形，检查分页、输入和滚动的额外开销。`,
                  },
                ],
              ]),
            );
            const root = d.schemas.createSnapshot('root', [ed.rootId, paras]);
            const start = performance.now();
            d.initBySnapshot(root, ed.container.nativeElement);
            const ids = [];
            const first = d.schemas.createSnapshot('shape', ['rectangle']);
            first.props = { ...first.props, width: 100, height: 60 };
            ids.push(
              d.placement.insertAbsoluteSnapshot(first, { anchorRect: null }),
            );
            d.crud.updateBlockProps(ids[0], { position: { x: 80, y: 120 } });
            const rest = Array.from({ length: a - 1 }, (_, j) => {
              const i = j + 1;
              const s = d.schemas.createSnapshot('shape', ['rectangle']);
              s.props = {
                ...s.props,
                ...d.model.getProps(ids[0]),
                position: {
                  x: 80 + (i % 3) * 145,
                  y: 120 + Math.floor(i / 3) * 200,
                },
              };
              return s;
            });
            ids.push(
              ...d.crud.insertBlockSnapshots(
                d.model.getParentId(ids[0]),
                1,
                rest,
              ),
            );
            window.ids = ids;
            window.pid = paras[0].id;
            const p = d.plugins.find((x) => x.name === 'pagination');
            window.p = p;
            if (mode !== 'flow') {
              p.disable();
              p._controller?.destroy();
              p._controller = null;
              p._experimentalSparseView = mode === 'sparse';
              p.updateConfig({
                pageSize: { width: 794, height: 1123 },
                margins: { top: 60, right: 60, bottom: 60, left: 60 },
                pageGap: 24,
                experimentalSparseView: mode === 'sparse',
              });
              p.enable();
              p.recompute();
            }
            await new Promise((r) => setTimeout(r, 1200));
            window.lease = d.virtualization.acquireBlockViewLease([
              ids[0],
              paras[0].id,
            ]);
            await new Promise((r) =>
              requestAnimationFrame(() => requestAnimationFrame(r)),
            );
            window.stats = {};
            const wrap = (obj, key, name) => {
              if (!obj || typeof obj[key] !== 'function') return;
              const fn = obj[key];
              obj[key] = function (...args) {
                const t = performance.now();
                try {
                  return fn.apply(this, args);
                } finally {
                  const s =
                    window.stats[name] ||
                    (window.stats[name] = { count: 0, ms: 0, max: 0 });
                  const dur = performance.now() - t;
                  s.count++;
                  s.ms += dur;
                  s.max = Math.max(s.max, dur);
                }
              };
            };
            wrap(p._controller, '_recompute', 'pagination');
            wrap(p._controller?._heightSource, 'measure', 'measure');
            wrap(d.placement.surface, 'refresh', 'surfaceRefresh');
            wrap(d.placement.surface, 'constrainY', 'constrainDrag');
            window.begin = () => {
              window.stats = {};
              window.frames = [];
              window.longs = [];
              window.inputDelays = [];
              window.activePerf = true;
              let last = performance.now();
              const tick = (t) => {
                if (!window.activePerf) return;
                window.frames.push(t - last);
                last = t;
                window.perfRaf = requestAnimationFrame(tick);
              };
              window.perfRaf = requestAnimationFrame(tick);
              window.po = new PerformanceObserver((l) =>
                window.longs.push(
                  ...l
                    .getEntries()
                    .map((x) => ({ start: x.startTime, duration: x.duration })),
                ),
              );
              window.po.observe({ type: 'longtask' });
              window.perfStart = performance.now();
            };
            document.addEventListener(
              'beforeinput',
              () => {
                if (!window.activePerf) return;
                const t = performance.now();
                requestAnimationFrame(() =>
                  window.inputDelays.push(performance.now() - t),
                );
              },
              true,
            );
            window.end = () => {
              window.activePerf = false;
              cancelAnimationFrame(window.perfRaf);
              window.longs.push(
                ...window.po
                  .takeRecords()
                  .map((x) => ({ start: x.startTime, duration: x.duration })),
              );
              window.po.disconnect();
              return {
                elapsed: performance.now() - window.perfStart,
                stats: window.stats,
                frames: window.frames,
                longs: window.longs,
                inputDelays: window.inputDelays,
                heap: performance.memory?.usedJSHeapSize,
                dom: document.querySelectorAll('[data-block-id]').length,
                pages: document.querySelectorAll('.bc-page-sheet').length,
              };
            };
            return {
              ms: performance.now() - start,
              roots: d.model.getChildrenIds(d.rootId).length,
              objects: ids.length,
              virtualization: d.virtualization.config.enabled,
              sparse: p._controller?.options.sparseView ?? false,
              scrollKind: d.scrollContainer?.constructor.name,
            };
          }, cfg);
          console.log('INIT', JSON.stringify(init));
          const actions = {};
          const run = async (name, act) => {
            await page.waitForTimeout(300);
            await page.evaluate(() => window.begin());
            await act();
            await page.waitForTimeout(100);
            const r = await page.evaluate(() => window.end());
            r.frameP95 = q(r.frames, 0.95);
            r.frameMax = Math.max(...r.frames);
            r.framesOver34 = r.frames.filter((x) => x > 34).length;
            r.inputP95 = q(r.inputDelays, 0.95);
            actions[name] = r;
            console.log(
              'ACTION',
              version,
              cfg.mode,
              cfg.n,
              name,
              JSON.stringify({
                p95: r.frameP95,
                max: r.frameMax,
                long: r.longs.length,
                stats: r.stats,
              }),
            );
          };
          await run('idle', () => page.waitForTimeout(800));
          await run('scroll', () =>
            page.evaluate(async () => {
              const sc = d.scrollContainer;
              const s =
                sc === window || sc === document
                  ? document.scrollingElement
                  : sc;
              let max = 0;
              for (let i = 0; i < 60; i++) {
                s.scrollTop = (i < 30 ? i : 60 - i) * 80;
                await new Promise(requestAnimationFrame);
                max = Math.max(max, s.scrollTop);
              }
              s.scrollTop = 0;
              if (!(max > 500))
                throw new Error(
                  'Scroll did not move ' + max + ' ' + sc?.constructor.name,
                );
            }),
          );
          await page.evaluate(() => d.navigateToBlock(pid));
          const para = page.locator(
            `[data-block-id="${await page.evaluate(() => pid)}"]`,
          );
          await para.click({ position: { x: 20, y: 10 } });
          const before = await page.evaluate(() => d.model.getTextLength(pid));
          await run('typing', () =>
            page.keyboard.type('abcdefghijklmnopqrstuvwxyz0123456789', {
              delay: 35,
            }),
          );
          const after = await page.evaluate(() => d.model.getTextLength(pid));
          if (after - before !== 36)
            throw new Error('Typing assertion ' + before + ' -> ' + after);
          await page.evaluate(() => d.selection.blur());
          await run('drag', () =>
            page.evaluate(async () => {
              const b = d.getBlockById(ids[0]);
              const r = b.hostElement.getBoundingClientRect();
              d.placement.startDrag(
                new PointerEvent('pointerdown', {
                  pointerId: 71,
                  button: 0,
                  clientX: r.left + 10,
                  clientY: r.top + 10,
                }),
                b,
              );
              for (let i = 0; i < 60; i++) {
                window.dispatchEvent(
                  new PointerEvent('pointermove', {
                    pointerId: 71,
                    clientX: r.left + 10 + Math.sin(i / 8) * 35,
                    clientY: r.top + 10 + Math.sin(i / 10) * 50,
                  }),
                );
                await new Promise(requestAnimationFrame);
              }
              window.dispatchEvent(
                new PointerEvent('pointerup', { pointerId: 71 }),
              );
              if (d.model.getProps(ids[0]).position.x === 80)
                throw new Error('Drag did not move');
            }),
          );
          await run('moveCommit', () =>
            page.evaluate(async () => {
              for (let i = 0; i < 20; i++) {
                d.crud.updateBlockProps(ids[0], {
                  position: { x: 80 + (i % 2) * 10, y: 120 },
                });
                await new Promise((r) =>
                  requestAnimationFrame(() => requestAnimationFrame(r)),
                );
              }
            }),
          );
          await run('zoom', () =>
            page.evaluate(async () => {
              for (let i = 0; i < 10; i++) {
                d.viewScale.setScale(i % 2 ? 1 : 0.75);
                await new Promise((r) =>
                  requestAnimationFrame(() => requestAnimationFrame(r)),
                );
              }
            }),
          );
          results.push({ rep, version, ...cfg, init, actions, errors });
        } catch (e) {
          console.log('FAIL', String(e));
          results.push({ rep, version, ...cfg, error: String(e), errors });
          await page
            .screenshot({
              path: OUT + `/fail-${version}-${cfg.mode}-${cfg.n}.png`,
            })
            .catch(() => {});
        }
        fs.writeFileSync(
          OUT + '/results.json',
          JSON.stringify(
            {
              browser: browser.version(),
              timestamp: new Date().toISOString(),
              results,
            },
            null,
            2,
          ),
        );
        await context.close();
      }
  await browser.close();
  if (results.some((row) => row.error || row.errors?.length))
    process.exitCode = 1;
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
