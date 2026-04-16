import {SnapshotEnhancementTask} from "../types";

export function createMediaSourceEnhancementTask(
  target: HTMLMediaElement,
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
      target.load()
    },
  }
}

export function createIframeEnhancementTask(
  target: HTMLElement,
  src: string,
  key: string
): SnapshotEnhancementTask<string> {
  return {
    key,
    target,
    policy: "visible",
    load: () => src,
    apply: (value) => {
      const existing = target.querySelector("iframe")
      if (existing) {
        ;(existing as HTMLIFrameElement).src = value
        return
      }
      const iframe = document.createElement("iframe")
      iframe.setAttribute("loading", "lazy")
      iframe.setAttribute("allowfullscreen", "true")
      iframe.setAttribute(
        "sandbox",
        "allow-scripts allow-same-origin allow-presentation allow-forms allow-popups allow-downloads allow-storage-access-by-user-activation"
      )
      iframe.setAttribute("allow", "encrypted-media;clipboard-read *;clipboard-write *;")
      iframe.setAttribute("draggable", "false")
      iframe.setAttribute("referrerpolicy", "")
      iframe.setAttribute("data-iframe-will-auto-focus", "1")
      iframe.setAttribute("frameborder", "0")
      iframe.setAttribute("data-aha-samesite", "")
      iframe.src = value
      target.prepend(iframe)
    },
  }
}
