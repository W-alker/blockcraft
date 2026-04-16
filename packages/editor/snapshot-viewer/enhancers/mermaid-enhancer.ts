import {SnapshotEnhancementTask, SnapshotViewerOptions} from "../types";

export function createMermaidEnhancementTask(
  options: SnapshotViewerOptions,
  source: string,
  target: Element,
  key: string
): SnapshotEnhancementTask<string> | null {
  const render = options.enhancers?.mermaid?.render
  if (!render || !source.trim()) {
    return null
  }

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
