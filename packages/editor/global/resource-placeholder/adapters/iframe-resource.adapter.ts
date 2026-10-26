import {
  ResourcePlaceholderAdapter,
} from '../resource-placeholder.types'

const loadedFrames = new WeakSet<HTMLIFrameElement>()

export const iframeResourcePlaceholderAdapter:
ResourcePlaceholderAdapter<HTMLIFrameElement> = {
  kind: 'iframe',
  defaultTimeoutMs: 10000,
  subscribe(element, handlers) {
    const onLoad = () => {
      loadedFrames.add(element)
      handlers.ready()
    }
    element.addEventListener('load', onLoad)
    element.addEventListener('error', handlers.error)
    return () => {
      element.removeEventListener('load', onLoad)
      element.removeEventListener('error', handlers.error)
    }
  },
  isReady: element => loadedFrames.has(element),
  readIntrinsicSize: () => null,
  retry(element) {
    const contentWindow = element.contentWindow
    if (contentWindow) {
      try {
        contentWindow.location.reload()
        return
      } catch {}
    }
    const src = element.getAttribute('src')
    if (!src) return
    element.removeAttribute('src')
    queueMicrotask(() => {
      if (element.isConnected) element.setAttribute('src', src)
    })
  },
}
