export interface ImageIntrinsicSize {
  width: number
  height: number
  ar: number
}

function normalizeImageSize(width: number, height: number): ImageIntrinsicSize | null {
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

function readSizeFromImageSource(
  source: string,
  signal?: AbortSignal,
): Promise<ImageIntrinsicSize | null> {
  if (signal?.aborted || typeof Image === 'undefined') {
    return Promise.resolve(null)
  }

  return new Promise(resolve => {
    const image = new Image()
    let settled = false

    const finish = (size: ImageIntrinsicSize | null) => {
      if (settled) return
      settled = true
      image.onload = null
      image.onerror = null
      signal?.removeEventListener('abort', onAbort)
      resolve(size)
    }
    const onAbort = () => {
      image.src = ''
      finish(null)
    }
    const onLoad = () => finish(normalizeImageSize(image.naturalWidth, image.naturalHeight))

    image.decoding = 'async'
    image.onload = onLoad
    image.onerror = () => finish(null)
    signal?.addEventListener('abort', onAbort, {once: true})
    image.src = source

    if (image.complete) {
      queueMicrotask(onLoad)
    }
  })
}

/**
 * 在图片进入文档模型前读取其固有尺寸。
 *
 * Blob/File 优先使用 createImageBitmap，Safari 等不支持或解码失败时回退到
 * 临时 Object URL + HTMLImageElement。任何读取失败都会返回 null，由调用方使用
 * 约定的占位比例兜底。
 */
export async function readImageIntrinsicSize(
  source: Blob | string,
  options: {signal?: AbortSignal} = {},
): Promise<ImageIntrinsicSize | null> {
  const {signal} = options
  if (signal?.aborted) return null

  if (typeof source === 'string') {
    return readSizeFromImageSource(source, signal)
  }

  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(source)
      const size = signal?.aborted
        ? null
        : normalizeImageSize(bitmap.width, bitmap.height)
      bitmap.close?.()
      if (size) return size
    } catch {
      // 某些 Safari/WebKit 版本虽暴露 API，但无法解码所有浏览器支持的图片格式。
    }
  }

  if (
    signal?.aborted ||
    typeof URL === 'undefined' ||
    typeof URL.createObjectURL !== 'function'
  ) {
    return null
  }

  const objectUrl = URL.createObjectURL(source)
  try {
    return await readSizeFromImageSource(objectUrl, signal)
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}
