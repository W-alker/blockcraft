import {SnapshotEnhancementTask} from "../types";
import {IFRAME_SANDBOX_FLAGS} from '../../global/env/iframe-sandbox'

export function createMediaSourceEnhancementTask(
  target: HTMLMediaElement,
  src: string,
  key: string
): SnapshotEnhancementTask<string> {
  return {
    key,
    target,
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
    load: () => src,
    apply: (value) => {
      const existing = target.querySelector("iframe")
      if (existing) {
        ;(existing as HTMLIFrameElement).src = value
        return
      }
      const iframe = createSnapshotIframeElement()
      iframe.src = value
      target.prepend(iframe)
    },
  }
}

export function createSnapshotIframeElement(): HTMLIFrameElement {
  const iframe = document.createElement("iframe")
  iframe.setAttribute("loading", "lazy")
  iframe.setAttribute("allowfullscreen", "true")
  iframe.setAttribute("sandbox", IFRAME_SANDBOX_FLAGS)
  iframe.setAttribute(
    "allow",
    "encrypted-media;clipboard-read *;clipboard-write *;",
  )
  iframe.setAttribute("draggable", "false")
  iframe.setAttribute("referrerpolicy", "")
  iframe.setAttribute("data-iframe-will-auto-focus", "1")
  iframe.setAttribute("frameborder", "0")
  iframe.setAttribute("data-aha-samesite", "")
  return iframe
}
