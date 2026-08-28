import {decodeAdapterProps} from '../../../adapters/generic'
import type {DividerBlockModel} from '..'

type DividerProps = DividerBlockModel['props']

const STRING_FIELDS = [
  'style',
  'size',
  'text',
  'color',
  'lineColor',
] as const satisfies readonly (keyof DividerProps)[]

const NUMBER_FIELDS = [
  'opacity',
  'fontSize',
  'letterSpacing',
] as const satisfies readonly (keyof DividerProps)[]

function oneOf<T extends string>(
  value: unknown,
  values: readonly T[],
): value is T {
  return typeof value === 'string' && values.includes(value as T)
}

/** Decode only the bounded fields declared by DividerBlockModel. */
export function applyDividerAdapterProps(
  target: DividerProps,
  encoded: unknown,
): void {
  const source = decodeAdapterProps(encoded)
  const output = target as Record<string, unknown>

  for (const key of STRING_FIELDS) {
    if (typeof source[key] === 'string') output[key] = source[key]
  }
  for (const key of NUMBER_FIELDS) {
    if (typeof source[key] === 'number') output[key] = source[key]
  }
  if (oneOf(source['length'], ['short', 'medium', 'long', 'full'])) {
    output['length'] = source['length']
  }
  if (oneOf(source['thickness'], ['thin', 'regular', 'thick'])) {
    output['thickness'] = source['thickness']
  }
  if (oneOf(source['align'], ['left', 'center', 'right'])) {
    output['align'] = source['align']
  }
  if (oneOf(source['fontWeight'], ['normal', 'bold'])) {
    output['fontWeight'] = source['fontWeight']
  }
  if (oneOf(source['fontStyle'], ['normal', 'italic'])) {
    output['fontStyle'] = source['fontStyle']
  }
}
