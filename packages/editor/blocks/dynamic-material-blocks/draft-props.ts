export const DRAFT_PROP_META_PREFIX = 'draft:'

export const draftPropMetaKey = (key: string): string =>
  `${DRAFT_PROP_META_PREFIX}${key}`

export const hasDraftProps = (
  meta: Record<string, unknown> | null | undefined,
): boolean => !!meta && Object.keys(meta).some(key =>
  key.startsWith(DRAFT_PROP_META_PREFIX),
)

export function readDraftProp(
  props: Record<string, unknown> | null | undefined,
  meta: Record<string, unknown> | null | undefined,
  key: string,
): unknown {
  const draftKey = draftPropMetaKey(key)
  return meta && Object.prototype.hasOwnProperty.call(meta, draftKey)
    ? meta[draftKey]
    : props?.[key]
}

export function projectDraftProps<T extends Record<string, unknown>>(
  props: T | null | undefined,
  meta: Record<string, unknown> | null | undefined,
  keys: readonly string[],
): T {
  const projected = {...(props ?? {})} as T
  for (const key of keys) {
    const value = readDraftProp(props, meta, key)
    if (value !== undefined) projected[key as keyof T] = value as T[keyof T]
  }
  return projected
}
