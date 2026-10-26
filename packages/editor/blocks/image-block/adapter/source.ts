const ACTIVE_IMAGE_SOURCE = /(?:javascript|vbscript)\s*:/i
const SOURCE_SCHEME = /^([a-z][a-z\d+.-]*)\s*:/i

/**
 * Normalize an image source without resolving or loading it.
 *
 * Relative and same-document sources are intentionally preserved because the
 * renderer owns URL resolution. Absolute sources are limited to protocols that
 * an Image Block can load or that the local-file pipeline can hand off.
 */
export function imageSourceFromAdapter(value: unknown): string {
  if (typeof value !== 'string') return ''
  const source = value.trim()
  if (!source || source.includes('\u0000')) return ''
  if (ACTIVE_IMAGE_SOURCE.test(source)) return ''

  const scheme = SOURCE_SCHEME.exec(source)?.[1]?.toLowerCase()
  if (!scheme) return source
  if (scheme === 'http' || scheme === 'https' || scheme === 'blob') {
    return source
  }
  if (scheme === 'data' && /^data\s*:\s*image\//i.test(source)) {
    return source
  }
  return ''
}
