import {existsSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const runtimeEnv = {
  ...process.env,
  BC_IDLE_PREFETCH_VISUAL: '1',
}

if (!runtimeEnv.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
  const candidates = resolveSystemChromiumCandidates()
  const executablePath = candidates.find(
    candidate => candidate && existsSync(candidate),
  )
  if (executablePath) {
    runtimeEnv.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = executablePath
  }
}

const cliPath = join(repoRoot, 'node_modules', '@playwright', 'test', 'cli.js')
const args = [
  cliPath,
  'test',
  'e2e/idle-prefetch-visual.spec.ts',
  '--project=chromium',
  '--workers=1',
]
if (runtimeEnv.BC_IDLE_PREFETCH_HEADLESS !== '1') args.push('--headed')
args.push(...process.argv.slice(2))

const result = spawnSync(process.execPath, args, {
  cwd: repoRoot,
  env: runtimeEnv,
  stdio: 'inherit',
})
if (result.error) throw result.error
process.exitCode = result.status ?? 1

function resolveSystemChromiumCandidates() {
  if (process.platform === 'darwin') {
    return [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    ]
  }
  if (process.platform === 'win32') {
    return [
      process.env.LOCALAPPDATA &&
        join(
          process.env.LOCALAPPDATA,
          'Google',
          'Chrome',
          'Application',
          'chrome.exe',
        ),
      process.env.PROGRAMFILES &&
        join(
          process.env.PROGRAMFILES,
          'Google',
          'Chrome',
          'Application',
          'chrome.exe',
        ),
      process.env['PROGRAMFILES(X86)'] &&
        join(
          process.env['PROGRAMFILES(X86)'],
          'Microsoft',
          'Edge',
          'Application',
          'msedge.exe',
        ),
    ].filter(Boolean)
  }
  return [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/microsoft-edge',
  ]
}
