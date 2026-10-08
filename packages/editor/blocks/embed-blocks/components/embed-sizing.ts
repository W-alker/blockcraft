import {normalizeObjectSize} from '../../../framework/modules/object/block-object-sizing.manager'

export const EMBED_OBJECT_SIZING = {defaultWr: 100, defaultAr: 16 / 9} as const

const positive = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0

/** Shared by live cards, snapshot cards and model-only height projection. */
export function resolveEmbedFrameSize(props: Readonly<Record<string, unknown>>, referenceWidth?: number) {
  // Preserve old full-width / fixed-height frames until the user resizes them.
  const legacy = !positive(props['wr']) && (positive(props['width']) || positive(props['height']))
  if (legacy) {
    return {
      width: positive(props['width']) ? `${props['width']}px` : '100%',
      height: `${positive(props['height']) ? props['height'] : 424}px`,
      aspectRatio: '',
    }
  }
  const {wr, ar} = normalizeObjectSize(props, EMBED_OBJECT_SIZING)
  return {
    width: positive(referenceWidth) ? `${referenceWidth * wr / 100}px` : `${wr}%`,
    height: 'auto',
    aspectRatio: String(ar),
  }
}

export function estimateEmbedFrameHeight(props: Readonly<Record<string, unknown>>, referenceWidth: number) {
  const size = resolveEmbedFrameSize(props, referenceWidth)
  return size.aspectRatio
    ? referenceWidth * normalizeObjectSize(props, EMBED_OBJECT_SIZING).wr / 100 / Number(size.aspectRatio)
    : Number.parseFloat(size.height)
}
