import {
  ResourceIntrinsicSize,
  ResourcePlaceholderAdapter,
} from '../resource-placeholder.types'

function readVideoSize(
  element: HTMLVideoElement,
): ResourceIntrinsicSize | null {
  const width = element.videoWidth
  const height = element.videoHeight
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

export const videoResourcePlaceholderAdapter:
ResourcePlaceholderAdapter<HTMLVideoElement> = {
  kind: 'video',
  subscribe(element, handlers) {
    element.addEventListener('loadedmetadata', handlers.ready)
    element.addEventListener('error', handlers.error)
    return () => {
      element.removeEventListener('loadedmetadata', handlers.ready)
      element.removeEventListener('error', handlers.error)
    }
  },
  isReady: element =>
    element.readyState >= HTMLMediaElement.HAVE_METADATA &&
    readVideoSize(element) !== null,
  readIntrinsicSize: readVideoSize,
  retry(element) {
    element.load()
  },
}
