import {SnapshotEnhancementTask, SnapshotViewerOptions} from "../types";

type MermaidModule = typeof import("mermaid").default
let mermaidModulePromise: Promise<MermaidModule> | null = null
let mermaidInitialized = false

function loadMermaid(): Promise<MermaidModule> {
  if (!mermaidModulePromise) {
    mermaidModulePromise = import("mermaid").then((mod) => mod.default)
  }
  return mermaidModulePromise
}

async function ensureMermaidReady(): Promise<MermaidModule> {
  const mermaid = await loadMermaid()
  if (!mermaidInitialized) {
    try {
      mermaid.initialize({startOnLoad: false, suppressErrorRendering: true})
    } catch {
      // mermaid may have been initialized elsewhere; ignore.
    }
    mermaidInitialized = true
  }
  return mermaid
}

let renderCounter = 0
function nextRenderId() {
  renderCounter += 1
  return `bc-snapshot-mermaid-${Date.now().toString(36)}-${renderCounter}`
}

async function defaultMermaidRender(source: string, signal: AbortSignal): Promise<string> {
  const mermaid = await ensureMermaidReady()
  if (signal.aborted) {
    throw new DOMException("Aborted", "AbortError")
  }
  const {svg} = await mermaid.render(nextRenderId(), source)
  return svg
}

export function createMermaidEnhancementTask(
  options: SnapshotViewerOptions,
  source: string,
  target: Element,
  key: string
): SnapshotEnhancementTask<string> | null {
  if (!source.trim()) {
    return null
  }

  const render = options.enhancers?.mermaid?.render ?? defaultMermaidRender

  return {
    key,
    target,
    policy: "eager",
    load: (signal) => render(source, signal),
    apply: (value) => {
      (target as HTMLElement).innerHTML = value
    },
  }
}
