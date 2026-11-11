import {chromium, firefox, webkit} from '@playwright/test'
import {spawn, execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {createServer} from 'node:http'
import {cp, mkdir, mkdtemp, readFile, writeFile, symlink, stat, readdir} from 'node:fs/promises'
import {existsSync} from 'node:fs'
import {tmpdir, cpus, totalmem, platform, release} from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const args = Object.fromEntries(process.argv.slice(2).map(arg => {
  const [key, ...value] = arg.replace(/^--/, '').split('=')
  return [key, value.join('=') || 'true']
}))
const rounds = Number(args.rounds ?? 8)
if (!Number.isInteger(rounds) || rounds < 1) throw new Error('rounds must be a positive integer')
const variants = ['baseline', 'guarded']
const helper = 'packages/editor/framework/modules/clipboard/paste-text-safety.ts'
const manager = 'packages/editor/framework/modules/clipboard/clipboard-manager.ts'
const documentConfig = 'packages/editor/framework/doc/document.ts'
const hash = data => createHash('sha256').update(data).digest('hex')
const stacked = '我̵̠̬̖̪̱̗̗̝͉͔̲͚̪͔̭͕̭̖̳͖̘̗̭̓̆̅́͛̅̌̃̂̒͑̅́̐̌̅̎̑̆̂̅̂̄ͅ'
const sample = '昨天不是才1号喵，怎么今天就7号了喵？' + stacked + '会一直看着你们👁👁'
const repeatTo = (text, n) => text.repeat(Math.ceil(n / text.length)).slice(0, n)
const normal = repeatTo('普通正文与性能测试 abcdefghijklmnopqrstuvwxyz 0123456789。', 40000)
const allCases = [
  {name: 'normal-4k', text: normal.slice(0, 4000), ordinary: true},
  {name: 'normal-40k', text: normal, ordinary: true},
  {name: 'normal-40k-256-formats', text: normal, rich: true, ordinary: true},
  {name: 'stacked-39500', text: sample.repeat(500)},
  {name: 'stacked-39500-256-formats', text: sample.repeat(500), rich: true}
]
const cases = args.cases ? allCases.filter(item => args.cases.split(',').includes(item.name)) : allCases
if (!cases.length) throw new Error('No matching cases')
async function command(cmd, parameters, cwd, logFile) {
  const child = spawn(cmd, parameters, {cwd, env: process.env, stdio: ['ignore', 'pipe', 'pipe']})
  const chunks = []
  child.stdout.on('data', data => chunks.push(data))
  child.stderr.on('data', data => chunks.push(data))
  const code = await new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('close', resolve)
  })
  const output = Buffer.concat(chunks)
  if (logFile) await writeFile(logFile, output)
  if (code !== 0) throw new Error(cmd + ' failed (' + code + '): ' + output.toString().slice(-6000))
}

async function server(directory) {
  const contentRoot = path.join(directory, 'dist/perf')
  const mime = {'.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
    '.json': 'application/json', '.woff2': 'font/woff2', '.woff': 'font/woff', '.svg': 'image/svg+xml'}
  const http = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname)
      let file = path.join(contentRoot, pathname === '/' ? 'index.html' : pathname)
      if (!file.startsWith(contentRoot + path.sep)) { response.writeHead(403); response.end(); return }
      if (!existsSync(file) || (await stat(file)).isDirectory()) file = path.join(contentRoot, 'index.html')
      response.setHeader('Content-Type', mime[path.extname(file)] ?? 'application/octet-stream')
      response.end(await readFile(file))
    } catch { response.writeHead(500); response.end() }
  })
  await new Promise(resolve => http.listen(0, '127.0.0.1', resolve))
  return {url: 'http://127.0.0.1:' + http.address().port, close: () => new Promise(resolve => http.close(resolve))}
}

const summarize = values => {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  return {
    n: values.length, p50: sorted[Math.ceil(sorted.length * 0.5) - 1],
    p95: sorted[Math.ceil(sorted.length * 0.95) - 1], max: sorted.at(-1),
    mean: values.reduce((sum, value) => sum + value, 0) / values.length
  }
}


async function prepare() {
  const directory = await mkdtemp(path.join(tmpdir(), 'bc-paste-perf-'))
  console.log('Frozen source: ' + directory)
  const guarded = path.join(directory, 'guarded')
  await mkdir(guarded)
  await command('rsync', ['-a', '--exclude=node_modules', '--exclude=.git', '--exclude=.codegraph',
    '--exclude=.gitnexus', '--exclude=.angular', '--exclude=dist', '--exclude=target',
    '--exclude=test-results', '--exclude=playwright-report', '--exclude=coverage', root + '/', guarded + '/'], root)
  const baseline = path.join(directory, 'baseline')
  await cp(guarded, baseline, {recursive: true})
  const guardedSource = await readFile(path.join(guarded, helper))
  const baselineSource = `import type {DeltaInsert} from '../../model';
import type {IBlockSnapshot} from '../../block-std/types/block.type';
export function sanitizePasteText(text: string): string { return text; }
export function sanitizePasteDeltas(deltas: DeltaInsert[]): DeltaInsert[] { return deltas; }
export function sanitizePasteSnapshot(_snapshot: IBlockSnapshot): void {}
`
  await writeFile(path.join(baseline, helper), baselineSource)
  const dependencyDirs = ['node_modules']
  for (const category of ['apps', 'packages']) {
    for (const item of await readdir(path.join(root, category), {withFileTypes: true})) {
      const relative = path.join(category, item.name, 'node_modules')
      if (item.isDirectory() && existsSync(path.join(root, relative))) dependencyDirs.push(relative)
    }
  }
  for (const variant of variants) {
    const cwd = path.join(directory, variant)
    for (const relative of dependencyDirs) await symlink(path.join(root, relative), path.join(cwd, relative), 'dir')
    console.log('Building ' + variant)
    await command(process.execPath, [path.join(root, 'node_modules/@angular/cli/bin/ng.js'),
      'build', 'playground', '--configuration=development', '--source-map=false', '--output-path=dist/perf'], cwd,
      path.join(directory, variant + '-build.log'))
  }
  const manifest = {directory,
    sourceRevision: execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim(),
    helper, baselineSha256: hash(baselineSource), guardedSha256: hash(guardedSource),
    managerSha256: hash(await readFile(path.join(guarded, manager))),
    documentConfigSha256: hash(await readFile(path.join(guarded, documentConfig))),
    lockSha256: hash(await readFile(path.join(guarded, 'pnpm-lock.yaml'))), dependencyDirs,
    baseline: 'Same frozen source, only paste-text-safety implementations replaced by identity/no-op functions',
    build: 'Angular development, source maps off, static HTTP after build'}
  await writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2))
  return manifest
}
async function openPage(browser, url) {
  const context = await browser.newContext({viewport: {width: 1280, height: 900}})
  const page = await context.newPage()
  page.setDefaultTimeout(15000)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(url)
  await page.waitForFunction(() => window.ng?.getComponent(document.querySelector('block-craft-editor'))?.doc)
  await page.evaluate(() => document.fonts.ready)
  await page.addScriptTag({path: path.join(root, 'scripts/perf/paste-text-fixture.js')})
  return {context, page, errors}
}
function summary(samples) {
  const measured = samples.filter(sample => !sample.warmup)
  return Object.fromEntries(['dispatchMs', 'pasteTwoFramesMs', 'keyboardNextFrameMs'].map(key => [key, summarize(measured.map(sample => sample[key]))]))
}
const reportPath = path.resolve(args.output ?? path.join(root, 'e2e/perf-results/paste-' + Date.now() + '.json'))
const manifest = args.prepared ? JSON.parse(await readFile(path.join(path.resolve(args.prepared), 'manifest.json'), 'utf8')) : await prepare()
console.log('Prepared: ' + manifest.directory)
if (args['prepare-only']) process.exit(0)
if (hash(await readFile(path.join(root, helper))) !== manifest.guardedSha256) throw new Error('Paste helper changed; prepare again')
if (hash(await readFile(path.join(root, manager))) !== manifest.managerSha256) throw new Error('Clipboard manager changed; prepare again')
if (hash(await readFile(path.join(root, documentConfig))) !== manifest.documentConfigSha256) throw new Error('Doc config changed; prepare again')
manifest.commonBundles = []
for (const name of ['vendor.js', 'polyfills.js', 'styles.css']) {
  const before = hash(await readFile(path.join(manifest.directory, 'baseline/dist/perf', name)))
  const after = hash(await readFile(path.join(manifest.directory, 'guarded/dist/perf', name)))
  if (before !== after) throw new Error('Shared bundle mismatch: ' + name)
  manifest.commonBundles.push({name, sha256: before})
}
const report = {generatedAt: new Date().toISOString(), manifest, node: process.version,
  runnerSha256: hash(await readFile(fileURLToPath(import.meta.url))),
  fixtureSha256: hash(await readFile(path.join(root, 'scripts/perf/paste-text-fixture.js'))),
  machine: {platform: platform(), release: release(), cpu: cpus()[0]?.model, memoryBytes: totalmem()},
  methodology: {rounds, warmupRounds: 1, serial: true, alternatingVariants: true,
    viewport: [1280, 900], sourceDemoInitialized: false, virtualization: false, plugins: [],
    scope: 'Real browser paste/input handlers, synthetic ClipboardEvent, trusted keyboard; not CSES/Tauri',
    percentile: 'Nearest-rank observed samples; 8-sample p95 is max, not production P95',
    alert: 'Ordinary paste/keyboard p50 > baseline * 1.20 + 2ms is a review alert, not an SLO'},
  cases: cases.map(({name, text, rich, ordinary}) => ({name, units: text.length, rich: !!rich, ordinary: !!ordinary})),
  results: [], alerts: []}
const servers = {}
async function save() { await mkdir(path.dirname(reportPath), {recursive: true}); await writeFile(reportPath, JSON.stringify(report, null, 2)) }
try {
  for (const variant of variants) servers[variant] = await server(path.join(manifest.directory, variant))
  for (const browserName of (args.browsers ?? 'chromium,firefox,webkit').split(',')) {
    const browserType = {chromium, firefox, webkit}[browserName]
    if (!browserType) throw new Error('Unknown browser: ' + browserName)
    const executablePath = args['chromium-executable'] ?? process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    const browser = await browserType.launch({headless: true, ...(browserName === 'chromium' && executablePath ? {executablePath} : {})})
    try {
      for (const config of cases) {
        const pages = {}, samples = {baseline: [], guarded: []}
        try {
          for (const variant of variants) pages[variant] = await openPage(browser, servers[variant].url)
          for (let round = 0; round <= rounds; round++) {
            for (const variant of round % 2 ? [...variants].reverse() : variants) {
              const page = pages[variant].page
              await page.bringToFront()
              await page.evaluate(({config, guarded}) => window.pastePerf.mount(config, guarded), {config, guarded: variant === 'guarded'})
              const measured = await page.evaluate(() => window.pastePerf.paste())
              await page.evaluate(() => window.pastePerf.prepareKey())
              await page.keyboard.type('x')
              measured.keyboardNextFrameMs = await page.evaluate(() => window.pastePerf.finishKey())
              samples[variant].push({warmup: round === 0, ...measured})
              await page.evaluate(() => window.pastePerf.dispose())
            }
          }
          for (const variant of variants) {
            if (pages[variant].errors.length) throw new Error(pages[variant].errors.join('; '))
            report.results.push({browser: browserName, browserVersion: browser.version(), case: config.name, variant,
              summary: summary(samples[variant]), samples: samples[variant]})
          }
          const before = summary(samples.baseline), after = summary(samples.guarded)
          if (config.ordinary) {
            for (const metric of ['pasteTwoFramesMs', 'keyboardNextFrameMs']) {
              if (after[metric].p50 > before[metric].p50 * 1.2 + 2)
                report.alerts.push({browser: browserName, case: config.name, metric, baseline: before[metric], guarded: after[metric]})
            }
          }
          console.log(JSON.stringify({browser: browserName, case: config.name, baseline: before, guarded: after}))
          await save()
        } finally { for (const item of Object.values(pages)) await item.context.close() }
      }
    } finally { await browser.close() }
  }
} catch (error) { report.failure = String(error.stack ?? error); process.exitCode = 1 }
finally { await save(); for (const item of Object.values(servers)) await item.close() }
console.log('Report: ' + reportPath + '; review alerts: ' + report.alerts.length)
if (report.failure) console.error(report.failure)
