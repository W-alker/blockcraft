import {createRequire} from 'node:module'
import {mkdtemp, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {chromium, firefox, webkit} from '@playwright/test'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const require = createRequire(import.meta.url)
const {build} = createRequire(require.resolve('@angular-devkit/build-angular/package.json'))('esbuild')
const temporary = await mkdtemp(join(tmpdir(), 'bc-incoming-preflight-'))
const bundle = join(temporary, 'incoming.js')
await build({entryPoints: [join(root, 'packages/editor/framework/doc/incoming-content.ts')],
  outfile: bundle, bundle: true, format: 'iife', globalName: 'IncomingPreflight', platform: 'browser',
  target: 'es2022', tsconfig: join(root, 'tsconfig.json'), logLevel: 'warning'})
const results = []
for (const [name, type] of Object.entries({chromium, firefox, webkit})) {
  const browser = await type.launch({headless: true,
    ...(name === 'chromium' ? {executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'} : {})})
  try {
    const page = await browser.newPage()
    await page.goto(process.env.BC_PERF_URL || 'http://127.0.0.1:8081')
    await page.waitForFunction(() => !!window.ng?.getComponent(document.querySelector('playground-home')))
    await page.evaluate(() => {window.ng.getComponent(document.querySelector('playground-home')).ensureEditorInitialized()})
    await page.addScriptTag({path: bundle})
    const rows = await page.evaluate(async () => {
      const api = window.IncomingPreflight
      const source = window.ng.getComponent(document.querySelector('block-craft-editor')).doc
      const host = {config: {}, messageService: {warn() {}}}
      const limit = api.DEFAULT_MAX_INCOMING_CONTENT_BYTES
      const summaries = []
      const paragraph = text => source.schemas.createSnapshot('paragraph', [text])
      const summarize = samples => {
        const sorted = [...samples].sort((a, b) => a - b)
        return {medianMs: sorted[Math.floor(sorted.length / 2)], minMs: sorted[0], maxMs: sorted.at(-1), samples}
      }
      const cases = [
        ['10 KiB ASCII allowed', {inline: [{insert: 'a'.repeat(10240)}]}],
        ['1.4 MiB ASCII allowed', {inline: [{insert: 'a'.repeat(Math.floor(1.4 * 1024 * 1024))}]}],
        ['1.6 MiB Chinese rejected', {inline: [{insert: '中'.repeat(Math.ceil(1.6 * 1024 * 1024 / 3))}]}],
        ['10 MiB ASCII rejected', {inline: [{insert: 'a'.repeat(10 * 1024 * 1024)}]}],
        ['1000 short paragraphs allowed', {snapshots: Array.from({length: 1000}, () => paragraph('短段落测试内容'))}],
        ['30000 empty paragraphs rejected', {snapshots: Array.from({length: 30000}, () => paragraph(''))}],
      ]
      for (const [label, content] of cases) {
        const exactBytes = api.measureIncomingContentBytes(content)
        const baseline = [], preflight = []
        // Alternate call order to reduce warmup/order bias; 3 warmup + 15 measured pairs.
        for (let i = 0; i < 18; i++) {
          const run = fast => {
            const at = performance.now()
            const accepted = fast ? api.checkIncomingContentSize(host, content) : api.measureIncomingContentBytes(content) <= limit
            const elapsed = performance.now() - at
            if (accepted !== (exactBytes <= limit)) throw new Error(`Decision changed: ${label}`)
            if (i >= 3) (fast ? preflight : baseline).push(elapsed)
          }
          run(i % 2 === 0); run(i % 2 !== 0)
          await new Promise(resolve => setTimeout(resolve, 0))
        }
        summaries.push({label, exactBytes, accepted: exactBytes <= limit, baseline: summarize(baseline), preflight: summarize(preflight)})
      }
      for (const type of ['text/markdown', 'text/html']) {
        const adapter = source.clipboard.adapter.getAdapter(type)
        const text = '中'.repeat(700000)
        const input = type === 'text/html' ? `<p>${text}</p>` : text
        const samples = []
        for (let i = 0; i < 18; i++) {
          const at = performance.now()
          if (api.checkIncomingSourceSize(host, adapter, input)) throw new Error(`Source not rejected: ${type}`)
          const elapsed = performance.now() - at
          if (i >= 3) samples.push(elapsed)
        }
        summaries.push({label: `${type} ~2 MiB Chinese source rejected before conversion`, preflight: summarize(samples)})
      }
      return summaries
    })
    results.push({browser: name, version: browser.version(), rows})
    for (const row of rows) console.log(name, row.label, 'baseline', row.baseline?.medianMs, 'preflight', row.preflight.medianMs)
  } finally {await browser.close()}
}
await writeFile(join(root, 'e2e/perf-results/incoming-preflight-2026-10-13.json'), JSON.stringify({
  measuredAt: new Date().toISOString(), methodology: 'Headless real browsers, 3 warmups + 15 samples. Old exact encoding vs current conservative preflight + exact fallback, paired alternating order. Isolated content, no live editing/rendering/network included. Source preflight measurements exclude file reading and do not invoke conversion.', results,
}, null, 2))
