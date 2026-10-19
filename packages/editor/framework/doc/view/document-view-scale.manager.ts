import {BehaviorSubject} from 'rxjs'

export type DocumentViewScaleChangeSource = 'api' | 'wheel'

export interface DocumentViewScaleChange {
  readonly scale: number
  readonly source: DocumentViewScaleChangeSource
}

export interface DocumentViewScaleAttachOptions {
  /** 在缩放面内拦截 Ctrl/Cmd + wheel。默认 false，由宿主显式启用。 */
  wheel?: boolean
}

const DEFAULT_MIN_SCALE = 0.5
const DEFAULT_MAX_SCALE = 2
const DEFAULT_SCALE_STEP = 0.1

/**
 * 文档视图缩放的唯一所有者。
 *
 * 缩放只修改宿主提供的视图面，不写 Yjs；分页、虚拟渲染和对象交互通过本
 * 服务完成 layout px / visual px 换算。宿主仍负责百分比、适合页宽等产品偏好。
 */
export class DocumentViewScaleManager {
  readonly min = DEFAULT_MIN_SCALE
  readonly max = DEFAULT_MAX_SCALE
  readonly step = DEFAULT_SCALE_STEP

  readonly scale$ = new BehaviorSubject<number>(1)
  readonly change$ = new BehaviorSubject<DocumentViewScaleChange>({
    scale: 1,
    source: 'api',
  })

  private surface: HTMLElement | null = null
  private originalZoom: string | null = null
  private originalScaleAttribute: string | null = null
  private wheelEnabled = false
  private destroyed = false
  private measuredGeometryScale = 1

  get value(): number {
    return this.scale$.value
  }

  /** 当前浏览器 BCR 相对布局尺寸的实测比例，供几何热路径无布局读取地复用。 */
  get geometryScale(): number {
    return this.measuredGeometryScale
  }

  attach(
    surface: HTMLElement,
    options: DocumentViewScaleAttachOptions = {},
  ): () => void {
    if (this.destroyed) return () => undefined
    if (this.surface === surface) {
      this.setWheelEnabled(options.wheel === true)
      this.applyScale()
      return () => this.detach(surface)
    }

    this.detach()
    this.surface = surface
    this.originalZoom = surface.style.getPropertyValue('zoom') || null
    this.originalScaleAttribute = surface.getAttribute('data-bc-view-scale')
    this.setWheelEnabled(options.wheel === true)
    this.applyScale()
    return () => this.detach(surface)
  }

  detach(expectedSurface?: HTMLElement): void {
    const surface = this.surface
    if (!surface || (expectedSurface && surface !== expectedSurface)) return
    this.setWheelEnabled(false)
    if (this.originalZoom === null) surface.style.removeProperty('zoom')
    else surface.style.setProperty('zoom', this.originalZoom)
    if (this.originalScaleAttribute === null) {
      surface.removeAttribute('data-bc-view-scale')
    } else {
      surface.setAttribute('data-bc-view-scale', this.originalScaleAttribute)
    }
    this.surface = null
    this.originalZoom = null
    this.originalScaleAttribute = null
    this.measuredGeometryScale = 1
  }

  setScale(
    value: number,
    source: DocumentViewScaleChangeSource = 'api',
  ): number {
    const scale = clampScale(value, this.min, this.max)
    if (Math.abs(scale - this.value) < 0.0001) return this.value
    this.scale$.next(scale)
    this.change$.next({scale, source})
    this.applyScale()
    return scale
  }

  zoomIn(source: DocumentViewScaleChangeSource = 'api'): number {
    return this.setScale(this.value + this.step, source)
  }

  zoomOut(source: DocumentViewScaleChangeSource = 'api'): number {
    return this.setScale(this.value - this.step, source)
  }

  reset(source: DocumentViewScaleChangeSource = 'api'): number {
    return this.setScale(1, source)
  }

  layoutToVisual(value: number): number {
    return value * this.geometryScale
  }

  visualToLayout(value: number): number {
    return value / Math.max(0.0001, this.geometryScale)
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.detach()
    this.scale$.complete()
    this.change$.complete()
  }

  private applyScale(): void {
    const surface = this.surface
    if (!surface) return
    surface.style.setProperty('zoom', formatScale(this.value))
    surface.setAttribute('data-bc-view-scale', formatScale(this.value))
    this.measureGeometryScale(surface)
  }

  private measureGeometryScale(surface: HTMLElement): void {
    const rect = surface.getBoundingClientRect()
    const widthScale = surface.offsetWidth > 0 ? rect.width / surface.offsetWidth : 0
    const heightScale = surface.offsetHeight > 0 ? rect.height / surface.offsetHeight : 0
    const measured = widthScale > 0 ? widthScale : heightScale
    this.measuredGeometryScale = Number.isFinite(measured) && measured > 0
      ? measured
      : this.value
  }

  private setWheelEnabled(enabled: boolean): void {
    const surface = this.surface
    if (!surface || enabled === this.wheelEnabled) return
    if (enabled) {
      surface.addEventListener('wheel', this.onWheel, {capture: true, passive: false})
    } else {
      surface.removeEventListener('wheel', this.onWheel, true)
    }
    this.wheelEnabled = enabled
  }

  private readonly onWheel = (event: WheelEvent): void => {
    if ((!event.ctrlKey && !event.metaKey) || event.deltaY === 0) return
    event.preventDefault()
    event.stopPropagation()
    if (event.deltaY < 0) this.zoomIn('wheel')
    else this.zoomOut('wheel')
  }
}

function clampScale(value: number, min: number, max: number): number {
  const finite = Number.isFinite(value) ? value : 1
  return Math.round(Math.min(max, Math.max(min, finite)) * 100) / 100
}

function formatScale(value: number): string {
  return String(Math.round(value * 100) / 100)
}
