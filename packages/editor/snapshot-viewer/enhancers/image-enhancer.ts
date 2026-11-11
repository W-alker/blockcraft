import {SnapshotEnhancementTask} from "../types";

export function createImageEnhancementTask(
  target: HTMLImageElement,
  src: string,
  key: string
): SnapshotEnhancementTask<string> {
  return {
    key,
    target,
    load: () => src,
    apply: (value) => {
      target.src = value
    },
  }
}
