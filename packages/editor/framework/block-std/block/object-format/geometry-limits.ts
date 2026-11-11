/** Package-internal frame limits for shape, text-box and word-art objects. */
export const MIN_FORMATTED_OBJECT_SIZE = 8
export const MAX_FORMATTED_OBJECT_SIZE = 20_000

export function normalizeFormattedObjectSize(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(MAX_FORMATTED_OBJECT_SIZE, Math.max(MIN_FORMATTED_OBJECT_SIZE, value)) : fallback
}
