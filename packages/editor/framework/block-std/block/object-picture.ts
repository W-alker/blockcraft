import type {ObjectPictureFit} from './object-format'

export interface CssPicture {
  src: string
  fit: ObjectPictureFit
  positionX: number
  positionY: number
}

/** One non-repeating image in CSS background shorthand. */
export function encodeCssPicture(picture: Readonly<CssPicture>): string {
  const size = picture.fit === 'stretch' ? '100% 100%' : picture.fit
  return `url(${JSON.stringify(picture.src)}) ${picture.positionX}% ${picture.positionY}% / ${size} no-repeat`
}

/** Deliberately bounded to the picture controls supported by the editor. */
export function decodeCssPicture(value: unknown): CssPicture | null {
  if (typeof value !== 'string' || value.length > 32_000 || /[\u0000-\u001f\u007f]/.test(value)) return null
  const match = /^url\(("(?:[^"\\]|\\["\\])*")\)\s+([+-]?(?:\d+\.?\d*|\.\d+))%\s+([+-]?(?:\d+\.?\d*|\.\d+))%\s*\/\s*(cover|contain|100%\s+100%)(?:\s+no-repeat)?$/i.exec(value.trim())
  if (!match) return null
  let src: string
  try { src = JSON.parse(match[1]!) } catch { return null }
  if (src.length > 16_000 || /[\u0000-\u001f\u007f]/.test(src) || /^(?:javascript|vbscript):/i.test(src.trim())) return null
  const x = Number(match[2]), y = Number(match[3])
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  return {src, fit: match[4]!.startsWith('100%') ? 'stretch' : match[4]!.toLowerCase() as ObjectPictureFit,
    positionX: Math.min(100, Math.max(0, x)), positionY: Math.min(100, Math.max(0, y))}
}
