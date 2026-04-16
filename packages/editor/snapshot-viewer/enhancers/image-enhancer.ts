import {SnapshotEnhancementTask} from "../types";

export function createImageEnhancementTask(
  target: HTMLImageElement,
  src: string,
  key: string
): SnapshotEnhancementTask<string> {
  return {
    key,
    target,
    policy: "eager",
    load: () => src,
    apply: (value) => {
      target.src = value
    },
  }
}
