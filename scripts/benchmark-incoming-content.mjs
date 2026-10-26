import {createRequire} from 'node:module'
import {mkdir, mkdtemp, writeFile} from 'node:fs/promises'
import {existsSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {chromium, firefox, webkit} from '@playwright/test'

// Use an already-running development Playground. No saved documents or system clipboard are touched.
const root = dirname(dirname(fileURLToPath(import.meta.url)))
const require = createRequire(import.meta.url)
const {build} = createRequire(require.resolve('@angular-devkit/build-angular/package.json'))('esbuild')
const outputDir = join(root, 'e2e/perf-results')
const temp = await mkdtemp(join(tmpdir(), 'bc-incoming-perf-'))
const bundle = join(temp, 'incoming.js')
await build({entryPoints: [join(root, 'packages/editor/framework/doc/incoming-content.ts')],
  outfile: bundle, bundle: true, format: 'iife', globalName: 'IncomingPerf', platform: 'browser',
  target: 'es2022', tsconfig: join(root, 'tsconfig.json'), logLevel: 'warning'})
const results = []
const url = process.env.BC_PERF_URL || 'http://127.0.0.1:8081'
const browsers = process.env.BC_PERF_BROWSERS?.split(',') || ['chromium', 'firefox', 'webkit']
const launches = {chromium, firefox, webkit}
for (const name of browsers) {
  const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  const browser = await launches[name].launch({headless: true,
    ...(name === 'chromium' && existsSync(chrome) ? {executablePath: chrome} : {})})
  try {
    const page = await browser.newPage({viewport: {width: 1280, height: 900}})
    await page.goto(url)
    await page.waitForFunction(() => window.ng?.getComponent(document.querySelector('playground-home')))
    await page.evaluate(() => { window.ng.getComponent(document.querySelector('playground-home')).ensureEditorInitialized() })
    await page.addScriptTag({path: bundle})
    const gate = await page.evaluate(async () => {
      const api = window.IncomingPerf
      const source = window.ng.getComponent(document.querySelector('block-craft-editor')).doc
      const p = text => source.schemas.createSnapshot('paragraph', [text])
      const cases = [
        ['纯文本 10 KiB', {inline: [{insert: 'a'.repeat(10240)}]}],
        ['纯文本 1.4 MiB', {inline: [{insert: 'a'.repeat(Math.floor(1.4 * 1024 * 1024))}]}],
        ['中文超限 1.6 MiB', {inline: [{insert: '中'.repeat(Math.ceil(1.6 * 1024 * 1024 / 3))}]}],
        ['2000 个短段落', {snapshots: Array.from({length: 2000}, () => p('短段落测试内容'))}],
        ['100×20 表格', {snapshots: [source.schemas.createSnapshot('table', [100, 20])]}],
        ['100×40 超限表格', {snapshots: [source.schemas.createSnapshot('table', [100, 40])]}],
      ]
      const summaries = []
      for (const [label, content] of cases) {
        const samples = []
        const bytes = api.measureIncomingContentBytes(content)
        let accepted
        for (let i = 0; i < 23; i++) {
          const start = performance.now()
          accepted = api.checkIncomingContentSize({config: {}, messageService: {warn() {}}}, content)
          const elapsed = performance.now() - start
          if (i >= 3) samples.push(elapsed)
          await new Promise(resolve => setTimeout(resolve, 0))
        }
        summaries.push({label, bytes, accepted, samples})
      }
      return summaries
    })
    results.push(...gate.map(row => ({browser: name, phase: 'gate', ...row})))
    console.log(`${name}: completed standalone Yjs budget timings`)

    for (const scenario of [
      {label: '10 KiB 粘贴／空文档', count: 1, text: 'x'.repeat(10240)},
      {label: '10 KiB 粘贴／5000 段文档', count: 5000, text: 'x'.repeat(10240)},
      {label: '1.4 MiB 单段粘贴', count: 1, text: 'a'.repeat(Math.floor(1.4 * 1024 * 1024))},
      {label: '1000 段纯文本粘贴', count: 1, text: Array.from({length: 1000}, () => '段落内容'.repeat(50)).join('\n')},
      {label: '1.6 MiB 中文超限拒绝', count: 1, text: '中'.repeat(Math.ceil(1.6 * 1024 * 1024 / 3))},
    ]) {
      const samples = []
      for (let round = 0; round < 4; round++) {
        const sample = await page.evaluate(async scenario => {
          const source = window.ng.getComponent(document.querySelector('block-craft-editor')).doc
          const viewport = document.createElement('div')
          viewport.style.cssText = 'position:fixed;inset:20px;overflow:auto;background:white;z-index:99999'
          const target = document.createElement('div')
          viewport.append(target)
          document.body.append(viewport)
          const paragraphs = Array.from({length: scenario.count}, (_, i) => source.schemas.createSnapshot('paragraph', [i ? '既有文档段落'.repeat(15) : 'keep']))
          const snapshot = source.schemas.createSnapshot('root', ['perf', paragraphs])
          const doc = new source.constructor({...source.config, docId: snapshot.id,
            yDoc: new source.yDoc.constructor(), plugins: [], readonly: false, scrollContainer: viewport,
            virtualization: {enabled: true, idlePrefetch: false}})
          let observer
          let releaseLease
          try {
            doc.initBySnapshot(snapshot, target)
            releaseLease = doc.virtualization.acquireBlockViewLease([paragraphs[0].id])
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
            const block = doc.getBlockById(paragraphs[0].id)
            block.hostElement.querySelector('.edit-container').focus()
            doc.selection.setCursorAt(block, block.textLength)
            doc.crud.undoManager.clearHistory()
            const warnings = []
            doc.messageService.warn = value => warnings.push(value)
            const tasks = []
            const supportsLongTask = PerformanceObserver.supportedEntryTypes?.includes('longtask')
            if (supportsLongTask) {
              observer = new PerformanceObserver(list => tasks.push(...list.getEntries().map(e => e.duration)))
              observer.observe({type: 'longtask'})
            }
            let updates = 0
            doc.yDoc.on('update', () => updates++)
            const data = new DataTransfer()
            data.setData('text/plain', scenario.text)
            const event = new ClipboardEvent('paste', {bubbles: true, cancelable: true})
            Object.defineProperty(event, 'clipboardData', {value: data})
            const started = performance.now()
            block.hostElement.dispatchEvent(event)
            const dispatchMs = performance.now() - started
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
            const twoFramesMs = performance.now() - started
            await new Promise(resolve => setTimeout(resolve, 0))
            const rejected = warnings.length > 0
            if (rejected && (updates || block.textContent() !== 'keep')) throw new Error('Rejected paste mutated the document')
            if (!rejected && !updates) throw new Error('Accepted paste did not update the document')
            return {dispatchMs, twoFramesMs, rejected, updates, longTasks: supportsLongTask ? tasks : null,
              mountedBlocks: viewport.querySelectorAll('[data-block-id]').length}
          } finally {
            observer?.disconnect()
            releaseLease?.()
            doc.destroy()
            doc.yDoc.destroy()
            viewport.remove()
          }
        }, scenario)
        if (round > 0) samples.push(sample)
      }
      results.push({browser: name, phase: 'paste', label: scenario.label,
        sourceBytes: Buffer.byteLength(scenario.text), existingParagraphs: scenario.count, samples})
      console.log(`${name}: ${scenario.label} ${JSON.stringify(samples.map(s => Math.round(s.twoFramesMs)))}`)
    }

    for (const scenario of [
      {label: 'HTML 100 段／约 1 MiB', mime: 'text/html', input: ('<p>' + '文'.repeat(3500) + '</p>').repeat(100)},
      {label: 'Markdown 100 段／约 1 MiB', mime: 'text/markdown', input: ('文'.repeat(3500) + '\n\n').repeat(100)},
      {label: 'HTML 超限／1.6 MiB', mime: 'text/html', input: '<p>' + '文'.repeat(Math.ceil(1.6 * 1024 * 1024 / 3)) + '</p>'},
    ]) {
      const samples = []
      for (let round = 0; round < 4; round++) {
        const sample = await page.evaluate(async scenario => {
          const source = window.ng.getComponent(document.querySelector('block-craft-editor')).doc
          const viewport = document.createElement('div')
          viewport.style.cssText = 'position:fixed;inset:20px;overflow:auto;background:white;z-index:99999'
          const target = document.createElement('div')
          viewport.append(target)
          document.body.append(viewport)
          const root = source.schemas.createSnapshot('root', ['import-perf', [source.schemas.createSnapshot('paragraph', ['keep'])]])
          const doc = new source.constructor({...source.config, docId: root.id, yDoc: new source.yDoc.constructor(),
            plugins: [], readonly: false, scrollContainer: viewport, virtualization: {enabled: true, idlePrefetch: false}})
          try {
            doc.initBySnapshot(root, target)
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
            const file = new File([scenario.input], 'import.txt')
            const adapter = doc.clipboard.adapter.getAdapter(scenario.mime)
            const started = performance.now()
            const text = await file.text()
            const parsed = await adapter.toSnapshot(text)
            const parsedAt = performance.now()
            const accepted = window.IncomingPerf.checkIncomingContentSize(doc, {snapshots: parsed.children})
            const checkedAt = performance.now()
            if (accepted) doc.crud.insertBlockSnapshots(doc.rootId, 0, parsed.children)
            const writtenAt = performance.now()
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
            return {accepted, parseMs: parsedAt - started, gateMs: checkedAt - parsedAt,
              writeMs: writtenAt - checkedAt, twoFramesMs: performance.now() - started,
              mountedBlocks: viewport.querySelectorAll('[data-block-id]').length}
          } finally {
            doc.destroy()
            doc.yDoc.destroy()
            viewport.remove()
          }
        }, scenario)
        if (round > 0) samples.push(sample)
      }
      results.push({browser: name, phase: 'import', label: scenario.label,
        sourceBytes: Buffer.byteLength(scenario.input), samples})
      console.log(`${name}: ${scenario.label} ${JSON.stringify(samples.map(s => Math.round(s.twoFramesMs)))}`)
    }
  } finally {
    await browser.close()
  }
  await mkdir(outputDir, {recursive: true})
  await writeFile(join(outputDir, 'incoming-content-2026-10-13.json'), JSON.stringify({
    measuredAt: new Date().toISOString(), url,
    methodology: 'Current development Playground, headless desktop browsers, 1280x900, sequential. Gate: 3 warmups + 20 samples; paste/import: 1 warmup + 3 samples, root virtualization enabled. Import times File.text + adapter + gate + CRUD + two frames; excludes file picker interaction. Two-frame duration includes display-frame waiting and is not time-to-idle. No before-change baseline. Long Tasks API reported only where available.',
    results,
  }, null, 2))
}

const csv = [['browser', 'phase', 'scenario', 'metric', 'samples', 'median_ms', 'p95_ms', 'max_ms', 'bytes']]
for (const row of results) {
  const metrics = row.phase === 'gate' ? ['gateMs'] : row.phase === 'paste'
    ? ['dispatchMs', 'twoFramesMs'] : ['parseMs', 'gateMs', 'writeMs', 'twoFramesMs']
  for (const metric of metrics) {
    const samples = (row.phase === 'gate' ? [...row.samples] : row.samples.map(s => s[metric])).sort((a, b) => a - b)
    const middle = Math.floor(samples.length / 2)
    const median = samples.length % 2 ? samples[middle] : (samples[middle - 1] + samples[middle]) / 2
    csv.push([row.browser, row.phase, row.label, metric, samples.length,
      median.toFixed(2), samples[Math.ceil(samples.length * .95) - 1].toFixed(2),
      samples.at(-1).toFixed(2), row.bytes ?? row.sourceBytes])
  }
}
await writeFile(join(outputDir, 'incoming-content-2026-10-13.csv'),
  csv.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n') + '\n')
