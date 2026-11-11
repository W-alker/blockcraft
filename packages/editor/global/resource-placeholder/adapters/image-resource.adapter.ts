import {
  ResourceIntrinsicSize,
  ResourcePlaceholderAdapter,
} from '../resource-placeholder.types'

function readImageSize(
  element: HTMLImageElement,
): ResourceIntrinsicSize | null {
  const width = element.naturalWidth
  const height = element.naturalHeight
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return null
  }
  return {width, height, ar: width / height}
}

export const imageResourcePlaceholderAdapter:
ResourcePlaceholderAdapter<HTMLImageElement> = {
  kind: 'image',
  subscribe(element, handlers) {
    element.addEventListener('load', handlers.ready)
    element.addEventListener('error', handlers.error)
    return () => {
      element.removeEventListener('load', handlers.ready)
      element.removeEventListener('error', handlers.error)
    }
  },
  isReady: element => element.complete && readImageSize(element) !== null,
  readIntrinsicSize: readImageSize,
  retry(element) {
    const src = element.getAttribute('src')
    if (!src) return
    element.removeAttribute('src')
    queueMicrotask(() => {
      if (element.isConnected) element.setAttribute('src', src)
    })
  },
}
