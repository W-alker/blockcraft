import {chromium, firefox, webkit} from '@playwright/test'
import {readFile, writeFile, mkdir, readdir, stat, mkdtemp, symlink} from 'node:fs/promises'
import {existsSync} from 'node:fs'
import {spawn, execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {createServer} from 'node:http'
import {cpus, totalmem, platform, release, tmpdir} from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const args = Object.fromEntries(process.argv.slice(2).map(value => {
  const [key, ...rest] = value.replace(/^--/, '').split('=')
  return [key, rest.join('=') || 'true']
}))
const rounds = Number(args.rounds ?? 3)
if (!Number.isInteger(rounds) || rounds < 1) throw new Error('Invalid rounds')
const hash = value => createHash('sha256').update(value).digest('hex')
const sourceFiles = [
  'packages/editor/framework/modules/object/text-content-auto-fit.ts',
  'packages/editor/framework/modules/virtualization/model-height-estimator.ts',
  'packages/editor/framework/modules/virtualization/root-virtualization-manager.ts',
  'packages/editor/blocks/text-box-block/text-box.block.ts',
  'packages/editor/blocks/word-art-block/word-art.block.ts',
  'pnpm-lock.yaml',
]
const sourceHashes = Object.fromEntries(await Promise.all(sourceFiles.map(async file => [file, hash(await readFile(path.join(root, file)))])))
async function command(executable, parameters, cwd, log) {
  const child = spawn(executable, parameters, {cwd, env: process.env, stdio: ['ignore', 'pipe', 'pipe']})
  const chunks = []
  child.stdout.on('data', data => chunks.push(data))
  child.stderr.on('data', data => chunks.push(data))
  const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', resolve) })
  if (log) await writeFile(log, Buffer.concat(chunks))
  if (code) throw new Error(`${executable} exited ${code}: ${Buffer.concat(chunks).toString().slice(-3000)}`)
}
async function prepare() {
  const directory = await mkdtemp(path.join(tmpdir(), 'bc-text-fit-perf-'))
  console.log('Frozen source: ' + directory)
  await command('rsync', ['-a', '--exclude=node_modules', '--exclude=.git', '--exclude=.codegraph',
    '--exclude=.gitnexus', '--exclude=.angular', '--exclude=dist', '--exclude=target',
    '--exclude=test-results', '--exclude=playwright-report', '--exclude=coverage',
    '--exclude=perf-results', root + '/', directory + '/'], root)
  const dependencyDirs = ['node_modules']
  for (const category of ['apps', 'packages']) {
    for (const entry of await readdir(path.join(root, category), {withFileTypes: true})) {
      const relative = path.join(category, entry.name, 'node_modules')
      if (entry.isDirectory() && existsSync(path.join(root, relative))) dependencyDirs.push(relative)
    }
  }
  for (const relative of dependencyDirs) await symlink(path.join(root, relative), path.join(directory, relative), 'dir')
  await command(process.execPath, [path.join(root, 'node_modules/@angular/cli/bin/ng.js'),
    'build', 'playground', '--configuration=development', '--source-map=false', '--output-path=dist/perf'], directory,
    path.join(directory, 'build.log'))
  const manifest = {directory, sourceHashes,
    revision: execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim(),
    build: 'Frozen current source, Angular development, source maps off, static HTTP, no build watcher'}
  await writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2))
  return manifest
}
async function serve(directory) {
  const content = path.join(directory, 'dist/perf')
  const mime = {'.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
    '.woff2': 'font/woff2', '.woff': 'font/woff', '.json': 'application/json', '.svg': 'image/svg+xml'}
  const server = createServer(async (request, response) => {
    try {
      let file = path.resolve(content, '.' + decodeURIComponent(new URL(request.url, 'http://localhost').pathname))
      if (file !== content && !file.startsWith(content + path.sep)) { response.writeHead(403).end(); return }
      if (!existsSync(file) || (await stat(file)).isDirectory()) file = path.join(content, 'index.html')
      response.setHeader('Content-Type', mime[path.extname(file)] ?? 'application/octet-stream')
      response.end(await readFile(file))
    } catch { response.writeHead(500).end() }
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  return {url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(resolve => server.close(resolve))}
}

const cases = [
  {name: 'mixed-1000', count: 1000},
  {name: 'mixed-5000', count: 5000},
  {name: 'nested-100', count: 100, nested: true},
].filter(config => !args.cases || args.cases.split(',').includes(config.name))
if (!cases.length) throw new Error('No cases')
const manifest = args.url ? {sourceHashes, build: 'Live development URL; pilot only'}
  : args.prepared ? JSON.parse(await readFile(path.join(args.prepared, 'manifest.json'), 'utf8')) : await prepare()
if (args['prepare-only']) { console.log('Prepared: ' + manifest.directory); process.exit(0) }
for (const [file, sha] of Object.entries(sourceHashes)) {
  if (manifest.sourceHashes[file] !== sha) throw new Error('Stale build: ' + file)
}
if (manifest.directory) {
  const bundleDir = path.join(manifest.directory, 'dist/perf')
  manifest.bundleHashes = Object.fromEntries(await Promise.all(
    (await readdir(bundleDir)).filter(file => /\.(js|css)$/.test(file))
      .map(async file => [file, hash(await readFile(path.join(bundleDir, file)))])))
}
const server = args.url ? null : await serve(manifest.directory)
const url = args.url ?? server.url
const output = path.resolve(args.output ?? 'e2e/perf-results/text-fit-' + Date.now() + '.json')
const report = {generatedAt: new Date().toISOString(), manifest, node: process.version,
  runnerSha256: hash(await readFile(fileURLToPath(import.meta.url))),
  fixtureSha256: hash(await readFile(path.join(root, 'scripts/perf/text-fit-fixture.js'))),
  machine: {cpu: cpus()[0]?.model, logicalCpus: cpus().length, memoryBytes: totalmem(), platform: platform(), release: release()},
  methodology: {rounds, warmup: args['no-warmup'] ? 0 : 1, serial: true, alternatingVariants: true,
    viewport: [1440, 1000], editorViewport: [1000, 800], plugins: [], idlePrefetch: false,
    sameInitialGeometry: true, comparisons: 'Current source fixed size vs content auto-fit; not pre-change vs post-change',
    typing: '80 trusted keyboard characters at 8ms requested delay; beforeinput to second RAF, not INP',
    longTasks: 'PerformanceObserver longtask when supported (Chromium); unsupported is null',
    frames: 'Observed RAF callback intervals, includes scheduler delay; not a hardware FPS measurement',
    scope: 'Real standalone BlockCraft docs/components in headless browsers; no host plugins, CSES or Tauri'},
  cases, samples: [], failures: []}
const save = async () => { await mkdir(path.dirname(output), {recursive: true}); await writeFile(output, JSON.stringify(report, null, 2)) }
const metrics = async cdp => cdp ? Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(item => [item.name, item.value])) : null
const metricDelta = (before, after) => before && after ? {
  layoutCount: after.LayoutCount - before.LayoutCount,
  layoutMs: (after.LayoutDuration - before.LayoutDuration) * 1000,
  styleCount: after.RecalcStyleCount - before.RecalcStyleCount,
  styleMs: (after.RecalcStyleDuration - before.RecalcStyleDuration) * 1000,
  scriptMs: (after.ScriptDuration - before.ScriptDuration) * 1000,
  heapUsedBytes: after.JSHeapUsedSize,
} : null

try {
  for (const browserName of (args.browsers ?? 'chromium').split(',')) {
    const browserType = {chromium, firefox, webkit}[browserName]
    if (!browserType) throw new Error('Unknown browser ' + browserName)
    const executablePath = args['chromium-executable'] ?? process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    const browser = await browserType.launch({headless: true,
      ...(browserName === 'chromium' && executablePath ? {executablePath} : {})})
    try {
      for (const config of cases) {
        for (let round = args['no-warmup'] ? 1 : 0; round <= rounds; round++) {
          for (const autoFit of round % 2 ? [true, false] : [false, true]) {
            const context = await browser.newContext({viewport: {width: 1440, height: 1000}, deviceScaleFactor: 1})
            const page = await context.newPage()
            const errors = []
            page.on('pageerror', error => errors.push(error.message))
            const sample = {browser: browserName, browserVersion: browser.version(), case: config.name,
              round, warmup: round === 0, variant: autoFit ? 'auto' : 'fixed', phases: [], errors}
            report.samples.push(sample)
            try {
              await page.routeWebSocket('**', socket => socket.close())
              await page.route('**/*', route => new URL(route.request().url()).origin === new URL(url).origin
                ? route.continue() : route.abort())
              await page.goto(url)
              await page.waitForFunction(() => window.ng?.getComponent(document.querySelector('block-craft-editor'))?.doc)
              await page.addScriptTag({path: path.join(root, 'scripts/perf/text-fit-fixture.js')})
              sample.longTaskSupported = await page.evaluate(() => PerformanceObserver.supportedEntryTypes.includes('longtask'))
              sample.fixture = await page.evaluate(({config, autoFit}) => window.textFitPerf.mount(config, autoFit), {config, autoFit})
              const cdp = browserName === 'chromium' ? await context.newCDPSession(page) : null
              await cdp?.send('Performance.enable')
              for (const phase of ['init', 'scroll', 'offscreen-edit', 'typing', 'batch-edit', 'width', 'idle']) {
                if (phase === 'typing') await page.evaluate(() => window.textFitPerf.prepareTyping())
                const before = await metrics(cdp)
                await page.evaluate(phase => window.textFitPerf.begin(phase), phase)
                if (phase === 'typing') {
                  const typed = 'x '.repeat(40)
                  await page.keyboard.type(typed, {delay: 8})
                  await page.evaluate(typed => window.textFitPerf.finishTyping(typed), typed)
                } else await page.evaluate(phase => window.textFitPerf.run(phase), phase)
                const result = await page.evaluate(() => window.textFitPerf.end())
                result.cdp = metricDelta(before, await metrics(cdp))
                if (!sample.longTaskSupported) result.summary.longTasks = null
                sample.phases.push(result)
              }
              await page.evaluate(() => window.textFitPerf.dispose())
              if (errors.length) throw new Error(errors.join('; '))
              console.log(JSON.stringify({browser: browserName, case: config.name, round,
                variant: sample.variant, phases: sample.phases.map(p => ({name: p.name,
                  frameP95: Math.round(p.summary.frames.p95), max: Math.round(p.summary.frames.max),
                  longTasks: p.summary.longTasks?.n, fits: p.fitCalls, fitMs: Math.round(p.summary.fit.total),
                  mounted: p.mountedMax, layoutMs: p.cdp && Math.round(p.cdp.layoutMs)}))}))
            } catch (error) {
              sample.failure = String(error.stack ?? error)
              report.failures.push({browser: browserName, case: config.name, round, autoFit, failure: sample.failure})
              console.error(sample.failure)
            } finally { await context.close(); await save() }
          }
        }
      }
    } finally { await browser.close() }
  }
} finally { await save(); await server?.close() }
console.log('Report: ' + output)
if (report.failures.length) process.exitCode = 1
