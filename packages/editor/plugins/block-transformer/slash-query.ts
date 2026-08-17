import type {DeltaInsert} from '../../framework'
import {deltaToString, sliceDelta} from '../../global'

export interface SlashQueryRange {
  query: string
  triggerLength: number
}

/** Reads one contiguous `/query` or `、query` token from model Delta data. */
export function resolveSlashQueryRange(
  deltas: DeltaInsert[],
  triggerIndex: number,
): SlashQueryRange | null {
  const tail = deltaToString(sliceDelta(deltas, triggerIndex), '\uFFFC')
  if (!tail || (tail[0] !== '/' && tail[0] !== '、')) return null
  const boundary = tail.slice(1).search(/[\s\uFFFC]/)
  const query = boundary < 0 ? tail.slice(1) : tail.slice(1, boundary + 1)
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
