const FITTED_MEDIA_ATTR = 'data-bc-page-media-fitted'
const MEDIA_SURFACE_SELECTOR = '.img-wrapper, .video-block__wrapper'

export interface PageMediaNaturalSize {
  width: number
  height: number
}

/** 只有流式图片/视频主体参与分页限宽限高；绝对定位对象保持固定 placement 几何。 */
export function canFitPageMedia(host: HTMLElement, flavour: string): boolean {
  return (flavour === 'image' || flavour === 'video')
    && host.getAttribute('data-bc-placement') !== 'absolute'
    && !!resolvePageMediaSurface(host)
}

export function resolvePageMediaSurface(host: HTMLElement): HTMLElement | null {
  return host.querySelector<HTMLElement>(MEDIA_SURFACE_SELECTOR)
}

export function hasPageMediaFit(host: HTMLElement): boolean {
  return resolvePageMediaSurface(host)?.hasAttribute(FITTED_MEDIA_ATTR) ?? false
}

/**
 * 读取未受分页 max-size 约束的媒体主体尺寸。max-width/max-height 只施加到
 * image/video wrapper，不改变 block host、caption、字体或 placement 坐标系。
 */
export function measureNaturalPageMedia(host: HTMLElement): PageMediaNaturalSize | null {
  const surface = resolvePageMediaSurface(host)
  if (!surface) return null
  return suspendPageMediaFit(host, () => ({
    width: Math.max(surface.offsetWidth, surface.scrollWidth),
    height: Math.max(surface.offsetHeight, surface.scrollHeight),
  }))
}

export function applyPageMediaFit(host: HTMLElement, scale: number | undefined): void {
  const surface = resolvePageMediaSurface(host)
  const fitted = Number.isFinite(scale) && scale! > 0 && scale! < 1
    && host.getAttribute('data-bc-placement') !== 'absolute'
  if (!surface || !fitted) {
    clearPageMediaFit(host)
    return
  }

  const natural = measureNaturalPageMedia(host)
  if (!natural || natural.width <= 0 || natural.height <= 0) {
    clearPageMediaFit(host)
    return
  }

  surface.style.setProperty('max-width', `${natural.width * scale!}px`)
  surface.style.setProperty('max-height', `${natural.height * scale!}px`)
  surface.setAttribute(FITTED_MEDIA_ATTR, '')
}

export function clearPageMediaFit(host: HTMLElement): void {
  const surface = resolvePageMediaSurface(host)
  if (!surface?.hasAttribute(FITTED_MEDIA_ATTR)) return
  surface.style.removeProperty('max-width')
  surface.style.removeProperty('max-height')
  surface.removeAttribute(FITTED_MEDIA_ATTR)
}

/** 自然尺寸测量期间临时移除分页约束，结束后原样恢复。 */
export function suspendPageMediaFit<T>(host: HTMLElement, read: () => T): T {
  const surface = resolvePageMediaSurface(host)
  if (!surface?.hasAttribute(FITTED_MEDIA_ATTR)) return read()

  const maxWidth = surface.style.getPropertyValue('max-width')
  const maxWidthPriority = surface.style.getPropertyPriority('max-width')
  const maxHeight = surface.style.getPropertyValue('max-height')
  const maxHeightPriority = surface.style.getPropertyPriority('max-height')
  surface.style.removeProperty('max-width')
  surface.style.removeProperty('max-height')
  surface.removeAttribute(FITTED_MEDIA_ATTR)
  try {
    return read()
  } finally {
    if (maxWidth) surface.style.setProperty('max-width', maxWidth, maxWidthPriority)
    if (maxHeight) surface.style.setProperty('max-height', maxHeight, maxHeightPriority)
    surface.setAttribute(FITTED_MEDIA_ATTR, '')
  }
}
