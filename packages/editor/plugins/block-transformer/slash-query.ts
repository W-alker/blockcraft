import type {DeltaInsert} from '../../framework'
import {deltaToString, sliceDelta} from '../../global'

const MAX_SLASH_QUERY_LENGTH = 7

export interface SlashQueryRange {
  query: string
  triggerLength: number
}

/** Reads one contiguous `/query` token from model Delta data. */
export function resolveSlashQueryRange(
  deltas: DeltaInsert[],
  triggerIndex: number,
): SlashQueryRange | null {
  const tail = deltaToString(sliceDelta(deltas, triggerIndex), '\uFFFC')
  if (!tail || tail[0] !== '/') return null
  const boundary = tail.slice(1).search(/[\s\uFFFC]/)
  const query = boundary < 0 ? tail.slice(1) : tail.slice(1, boundary + 1)
  // Count Unicode code points; model offsets below remain UTF-16 positions.
  let queryLength = 0
  for (const _character of query) {
    if (++queryLength > MAX_SLASH_QUERY_LENGTH) return null
  }
  return {query, triggerLength: query.length + 1}
}

export function isSlashQueryCursorOwned(
  triggerIndex: number,
  triggerLength: number,
  cursorOffset: number,
): boolean {
  return cursorOffset >= triggerIndex + 1 &&
    cursorOffset <= triggerIndex + triggerLength
}
