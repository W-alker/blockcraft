import {createRequire} from 'node:module'
import {readFile, writeFile, mkdtemp} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {chromium} from '@playwright/test'

// Diagnostic only: all alternatives use an isolated Y.Doc; no editor data or
// persistence/protocol settings are changed.
const root = dirname(dirname(fileURLToPath(import.meta.url)))
const require = createRequire(import.meta.url)
const {build} = createRequire(require.resolve('@angular-devkit/build-angular/package.json'))('esbuild')
const temporary = await mkdtemp(join(tmpdir(), 'bc-yjs-overhead-'))
const bundle = join(temporary, 'diagnostic.js')
await build({stdin: {contents: `
  export * as Y from 'yjs';
  export {native2YBlock} from './packages/editor/framework/block-std/reactive/block';
  export {measureIncomingContentBytes} from './packages/editor/framework/doc/incoming-content';
`, resolveDir: root, sourcefile: 'overhead-diagnostic.ts', loader: 'ts'},
  outfile: bundle, bundle: true, format: 'iife', globalName: 'Overhead', platform: 'browser',
  target: 'es2022', tsconfig: join(root, 'tsconfig.json'), logLevel: 'warning'})

const sourceBytes = 100 * 1024
function paragraphs(count) {
  const available = sourceBytes - (count - 1) * 2
  const length = Math.floor(available / count)
  const extra = available % count
  return Array.from({length: count}, (_, i) => 'a'.repeat(length + (i < extra ? 1 : 0))).join('\n\n')
}
const fixtures = [1, 100, 1000, 10000].map(count => ({
  name: `100 KiB plain Markdown / ${count} paragraphs`, markdown: paragraphs(count),
}))
for (const profile of ['text-heavy', 'balanced', 'structure-heavy']) {
  fixtures.push({name: `10 KiB ${profile}`, markdown: await readFile(join(root,
    `e2e/perf-results/markdown-yjs-2026-10-13/${profile}-10KiB.md`), 'utf8')})
}
const browser = await chromium.launch({headless: true,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'})
try {
  const page = await browser.newPage()
  const url = process.env.BC_PERF_URL || 'http://127.0.0.1:8081'
  await page.goto(url)
  await page.waitForFunction(() => !!window.ng?.getComponent(document.querySelector('playground-home')))
  await page.evaluate(() => {window.ng.getComponent(document.querySelector('playground-home')).ensureEditorInitialized()})
  await page.addScriptTag({path: bundle})
  const results = []
  for (const fixture of fixtures) {
    const row = await page.evaluate(async markdown => {
      const {Y, native2YBlock, measureIncomingContentBytes} = window.Overhead
      const source = window.ng.getComponent(document.querySelector('block-craft-editor')).doc
      const snapshot = await source.clipboard.adapter.getAdapter('text/markdown').toSnapshot(markdown)
      const probe = new Y.Doc()
      probe.clientID = 0xffffffff
      const blocks = probe.getMap('blocks')
      const utf8 = value => new TextEncoder().encode(value).byteLength
      let blockCount = 0, textBytes = 0, propertyCount = 0, emptyMeta = 0
      const flavours = {}
      const add = block => {
        blockCount++
        flavours[block.flavour] = (flavours[block.flavour] || 0) + 1
        propertyCount += Object.keys(block.props).length
        if (!Object.keys(block.meta).length) emptyMeta++
        if (block.nodeType === 'editable') {
          for (const op of block.children) if (typeof op.insert === 'string') textBytes += utf8(op.insert)
        }
        // The adapter already generated unique fixed-length IDs. Reusing these
        // preserves the same byte size as the production helper's fresh IDs.
        const children = block.nodeType === 'editable' ? block.children : block.children.map(add)
        blocks.set(block.id, native2YBlock({...block, children}))
        return block.id
      }
      try {
        probe.transact(() => snapshot.children.forEach(add))
        const v1 = Y.encodeStateAsUpdate(probe)
        const v2 = Y.encodeStateAsUpdateV2(probe)
        const gateBytes = measureIncomingContentBytes({snapshots: snapshot.children})
        if (gateBytes !== v1.byteLength) throw new Error(`Gate encoding differs: ${gateBytes}/${v1.byteLength}`)
        const restored = new Y.Doc()
        try {
          Y.applyUpdateV2(restored, v2)
          const restoredV1 = Y.encodeStateAsUpdate(restored)
          if (restoredV1.length !== v1.length || restoredV1.some((byte, i) => byte !== v1[i])) {
            throw new Error('V2 roundtrip differs')
          }
        } finally {restored.destroy()}
        return {sourceBytes: utf8(markdown), snapshotJsonBytes: utf8(JSON.stringify(snapshot.children)),
          yjsV1Bytes: v1.byteLength, yjsV2Bytes: v2.byteLength, blockCount, textBytes, propertyCount, emptyMeta, flavours}
      } finally {probe.destroy()}
    }, fixture.markdown)
    results.push({name: fixture.name, ...row})
    console.log(JSON.stringify(results.at(-1)))
  }
  const path = join(root, 'e2e/perf-results/markdown-yjs-2026-10-13/overhead-analysis.json')
  await writeFile(path, JSON.stringify({measuredAt: new Date().toISOString(), browser: browser.version(),
    yjsVersion: require('yjs/package.json').version,
    methodology: 'Current Playground Markdown adapter. Exact 100 KiB ASCII Markdown varying paragraph count, plus existing 10 KiB mixed fixtures. Standalone Y.Doc with client ID 0xffffffff, adapter generated IDs. v1 size asserted equal to current incoming-content helper. v2 decoded and compared to original data. No change to product format or protocol.',
    results}, null, 2))
  console.log(`Saved ${path}`)
} finally {await browser.close()}
