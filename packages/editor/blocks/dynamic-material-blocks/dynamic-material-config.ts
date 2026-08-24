import type {Type} from '@angular/core'

/** Framework-neutral presentation descriptor consumed by host-side inspectors. */
export interface DynamicMaterialConfigEntry {
  key: string
  label: string
  default: string
  options: Array<{
    value: string
    label: string
    preview?: Type<unknown>
    previewAspect?: number
    previewWidth?: number
    previewUnit?: number
  }>
  control?: 'select' | 'thumb' | 'color'
  attachTo?: string
}
