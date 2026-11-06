import {createRequire} from 'node:module'
import {mkdir, mkdtemp, writeFile} from 'node:fs/promises'
import {existsSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {createHash} from 'node:crypto'
import {chromium, firefox, webkit} from '@playwright/test'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const require = createRequire(import.meta.url)
const {build} = createRequire(require.resolve('@angular-devkit/build-angular/package.json'))('esbuild')
const output = join(root, 'e2e/perf-results/markdown-yjs-2026-10-13')
await mkdir(output, {recursive: true})
const temporary = await mkdtemp(join(tmpdir(), 'bc-md-size-'))
const bundle = join(temporary, 'incoming.js')
await build({entryPoints: [join(root, 'packages/editor/framework/doc/incoming-content.ts')],
  outfile: bundle, bundle: true, format: 'iife', globalName: 'IncomingSize', platform: 'browser',
  target: 'es2022', tsconfig: join(root, 'tsconfig.json'), logLevel: 'warning'})

const sizesKiB = [10, 20, 50, 100, 200, 300, 500, 750, 1024]
const profiles = ['text-heavy', 'balanced', 'structure-heavy']
const body = '这一段记录产品设计、实现细节与验证结果，保留中文、English 和 emoji 😀。正文采用完整句子，方便观察文字字节数与块结构开销之间的关系。'
const inline = '这一段包含 **加粗**、*斜体*、~~删除线~~、`inlineCode`、[参考链接](https://example.invalid/reference) 和公式 $E=mc^2$。'

function section(profile) {
  const prose = profile === 'text-heavy' ? 22 : profile === 'balanced' ? 4 : 1
  const rows = profile === 'structure-heavy' ? 14 : 3
  const listItems = profile === 'structure-heavy' ? 18 : 3
  return [
    '# 一级标题', '## 二级标题', '### 三级标题', '#### 四级标题', '##### 五级标题', '###### 六级标题',
    ...Array.from({length: prose}, () => body.repeat(profile === 'text-heavy' ? 2 : 1)),
    inline,
    Array.from({length: listItems}, (_, i) => `- 无序条目 ${i + 1}`).join('\n') + '\n  - 嵌套子条目',
    Array.from({length: listItems}, (_, i) => `${i + 1}. 有序步骤 ${i + 1}`).join('\n'),
    '- [ ] 待办事项\n- [x] 已完成事项',
    '> 引用中的第一段。\n>\n> 引用中的第二段，带有 **重点**。',
    '---',
    '```typescript\ninterface Item { id: string; done: boolean }\nconst items: Item[] = [{id: "task-1", done: false}];\nconst pending = items.filter(item => !item.done);\n```',
    '```mermaid\nflowchart LR\n  A[输入] --> B[转换]\n  B --> C[校验]\n```',
    '$$\n\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}\n$$',
    '![示例图片](https://example.invalid/diagram.png "只存 URL，不下载")',
    '| 项目 | 状态 | 数量 | 备注 |\n| :--- | :---: | ---: | --- |\n' +
      Array.from({length: rows}, (_, i) => `| 项目${i + 1} | 完成 | ${i + 1} | **核对** |`).join('\n'),
  ].join('\n\n') + '\n\n'
}

// Keep every repeated section syntactically complete; pad the final plain paragraph
// with ordinary text to make the UTF-8 source exactly the requested byte length.
function sample(profile, target) {
  const unit = section(profile)
  const unitBytes = Buffer.byteLength(unit)
  if (unitBytes + 2 > target) throw new Error(`Sample unit exceeds smallest target: ${profile} ${unitBytes}`)
  const count = Math.floor((target - 2) / unitBytes)
  let markdown = unit.repeat(count)
  let remaining = target - Buffer.byteLength(markdown)
  while (remaining >= Buffer.byteLength(body)) {
    markdown += body
    remaining -= Buffer.byteLength(body)
  }
  markdown += 'x'.repeat(remaining - 2) + '\n\n'
  if (Buffer.byteLength(markdown) !== target) throw new Error('Invalid fixture size')
  return {markdown, sections: count, sectionBytes: unitBytes}
}

const fixtures = profiles.flatMap(profile => sizesKiB.map(kib => {
  const fixture = sample(profile, kib * 1024)
  return {profile, sourceKiB: kib, ...fixture,
    sha256: createHash('sha256').update(fixture.markdown).digest('hex')}
}))
for (const fixture of fixtures.filter(f => f.sourceKiB === 10)) {
  await writeFile(join(output, `${fixture.profile}-10KiB.md`), fixture.markdown)
}

const results = []
const environments = []
const url = process.env.BC_PERF_URL || 'http://127.0.0.1:8081'
for (const [name, type] of Object.entries({chromium, firefox, webkit})) {
  const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  const browser = await type.launch({headless: true,
    ...(name === 'chromium' && existsSync(chrome) ? {executablePath: chrome} : {})})
  try {
    const page = await browser.newPage()
    await page.goto(url)
    await page.waitForFunction(() => window.ng?.getComponent(document.querySelector('playground-home')))
    await page.evaluate(() => { window.ng.getComponent(document.querySelector('playground-home')).ensureEditorInitialized() })
    await page.addScriptTag({path: bundle})
    const environment = await page.evaluate(() => {
      const doc = window.ng.getComponent(document.querySelector('block-craft-editor')).doc
      const adapter = doc.clipboard.adapter.getAdapter('text/markdown')
      if (!adapter) throw new Error('Markdown adapter missing')
      window.mdSizeAdapter = adapter
      const concrete = doc.clipboard.adapter.markdownAdapter
      return {adapter: concrete.constructor.name, profile: concrete.markdownProfile, userAgent: navigator.userAgent}
    })
    environments.push({browser: name, version: browser.version(), ...environment})
    // Byte size is browser-independent. Cross-check every profile at three scales
    // in Firefox/WebKit; measure all nine scales in Chromium.
    const selected = name === 'chromium' ? fixtures : fixtures.filter(f => [10, 100, 1024].includes(f.sourceKiB))
    for (const fixture of selected) {
      const measured = await page.evaluate(async markdown => {
        const started = performance.now()
        const snapshot = await window.mdSizeAdapter.toSnapshot(markdown)
        const parseMs = performance.now() - started
        const blockCounts = {}, headings = {}, inlineAttributes = {}, embeds = {}
        let deltaOperations = 0
        const walk = block => {
          blockCounts[block.flavour] = (blockCounts[block.flavour] || 0) + 1
          if (block.props.heading) headings[block.props.heading] = (headings[block.props.heading] || 0) + 1
          if (block.nodeType === 'editable') {
            for (const op of block.children) {
              deltaOperations++
              for (const key of Object.keys(op.attributes || {})) inlineAttributes[key] = (inlineAttributes[key] || 0) + 1
              if (op.insert && typeof op.insert === 'object') {
                for (const key of Object.keys(op.insert)) embeds[key] = (embeds[key] || 0) + 1
              }
            }
          } else {
            block.children.forEach(walk)
          }
        }
        snapshot.children.forEach(walk)
        const measuredAt = performance.now()
        const yjsBytes = window.IncomingSize.measureIncomingContentBytes({snapshots: snapshot.children})
        const measureMs = performance.now() - measuredAt
        const repeatedBytes = window.IncomingSize.measureIncomingContentBytes({snapshots: snapshot.children})
        if (repeatedBytes !== yjsBytes) throw new Error('Non-deterministic Yjs size')
        const limitBytes = window.IncomingSize.DEFAULT_MAX_INCOMING_CONTENT_BYTES
        return {yjsBytes, limitBytes, accepted: yjsBytes <= limitBytes, parseMs, measureMs,
          topLevelBlocks: snapshot.children.length, totalBlocks: Object.values(blockCounts).reduce((a, b) => a + b, 0),
          blockCounts, headings, inlineAttributes, embeds, deltaOperations,
          snapshotJsonBytes: new TextEncoder().encode(JSON.stringify(snapshot.children)).byteLength}
      }, fixture.markdown)
      const row = {browser: name, profile: fixture.profile, sourceKiB: fixture.sourceKiB,
        sourceBytes: Buffer.byteLength(fixture.markdown), sha256: fixture.sha256,
        sections: fixture.sections, sectionBytes: fixture.sectionBytes, ...measured}
      row.expansionRatio = row.yjsBytes / row.sourceBytes
      results.push(row)
      console.log(`${name} ${row.profile} ${row.sourceKiB} KiB => ${(row.yjsBytes / 1024).toFixed(2)} KiB (${row.expansionRatio.toFixed(2)}x), ${row.totalBlocks} blocks, ${row.accepted ? 'allow' : 'reject'}`)
    }
  } finally {
    await browser.close()
  }
  await writeFile(join(output, 'results.json'), JSON.stringify({measuredAt: new Date().toISOString(), url,
    methodology: 'Exact UTF-8 source bytes, 1 KiB = 1024 bytes. Real configured Markdown adapter toSnapshot, then current measureIncomingContentBytes over imported children. Standalone Yjs v1, fixed 5-byte client ID, fresh 18-character block IDs. No existing document/history/root wrapper/network framing, no compression. Two independent encodings per parsed sample must agree. Firefox/WebKit cross-check 10/100/1024 KiB in each profile. Timings are single-run diagnostics, not a performance benchmark.',
    environments, results}, null, 2))
}

const primary = results.filter(r => r.browser === 'chromium')
for (const row of results.filter(r => r.browser !== 'chromium')) {
  const expected = primary.find(r => r.profile === row.profile && r.sourceKiB === row.sourceKiB)
  if (expected.yjsBytes !== row.yjsBytes || expected.totalBlocks !== row.totalBlocks) {
    throw new Error(`Cross-browser mismatch: ${row.browser} ${row.profile} ${row.sourceKiB}`)
  }
}
const columns = ['browser', 'profile', 'sourceKiB', 'sourceBytes', 'yjsBytes', 'expansionRatio', 'totalBlocks', 'topLevelBlocks', 'deltaOperations', 'accepted', 'snapshotJsonBytes', 'parseMs', 'measureMs']
await writeFile(join(output, 'results.csv'), [columns.join(','), ...results.map(row => columns.map(c => row[c]).join(','))].join('\n') + '\n')
console.log(`All cross-browser sizes agree. Results: ${output}`)
