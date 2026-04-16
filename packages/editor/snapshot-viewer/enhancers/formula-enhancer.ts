import {SnapshotEnhancementTask, SnapshotViewerOptions} from "../types";

export function createFormulaEnhancementTask(
  options: SnapshotViewerOptions,
  latex: string,
  target: Element,
  key: string
): SnapshotEnhancementTask<string> | null {
  const render = options.enhancers?.formula?.render
  if (!render || !latex) {
    return null
  }

  return {
    key,
    target,
    policy: "eager",
    load: (signal) => render(latex, signal),
    apply: (value) => {
      (target as HTMLElement).innerHTML = value
    },
  }
}
