import {getStickerPreset} from './presets'
import {normalizeShapeRotation} from '../shape-block/shape.types'
import type {StickerBlockProps} from './index'

const positive = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0

/** Quantize stored sticker geometry only; drag previews retain full precision. */
export const roundStickerNumber = (value: number): number => {
  const rounded = Math.round(value * 100) / 100
  return Object.is(rounded, -0) ? 0 : rounded
}

export const normalizeStickerRotation = (value: unknown): number =>
  roundStickerNumber(normalizeShapeRotation(value)) % 360

const fixedSize = (width: number, height: number) => ({
  width: Math.max(.01, roundStickerNumber(width)),
  height: Math.max(.01, roundStickerNumber(height)),
})

/** Resolve fixed layout pixels, falling back to the selected preset. */
export function resolveStickerDimensions(
  props: Partial<StickerBlockProps>,
): {width: number; height: number} {
  if (positive(props.width) && positive(props.height)) {
    return fixedSize(props.width, props.height)
  }
  const preset = getStickerPreset(props.presetId, props.presetVersion)
  return {width: preset?.width ?? 160, height: preset?.height ?? 160}
}
