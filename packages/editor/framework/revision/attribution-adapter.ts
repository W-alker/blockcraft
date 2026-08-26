import * as Y from 'yjs'
import type {DeltaInsert} from '../block-std'
import type {RevisionStatus, RevisionTextTarget} from './types'

interface RevisionInlineAttribution {
  ids: readonly string[]
  kind: 'insert' | 'delete' | null
  state: RevisionStatus | null
}

/**
 * Package-internal attribution boundary. A future Yjs renderer can replace the
 * Yjs 13 RelativePosition/temporary-attribute implementation without changing
 * the public Revision contracts.
 */
export interface RevisionAttributionAdapter {
  createTextTarget(
    blockId: string,
    yText: Y.Text,
    start: number,
    end: number,
    startAssoc: -1 | 1,
    endAssoc: -1 | 1,
  ): RevisionTextTarget

  resolveTextTarget(
    target: RevisionTextTarget,
    yDoc: Y.Doc,
    yText: Y.Text,
  ): {start: number; end: number} | null

  decorateInlineAttributes(
    attributes: DeltaInsert['attributes'] | undefined,
    attribution: RevisionInlineAttribution,
  ): NonNullable<DeltaInsert['attributes']>
}

export class Yjs13RevisionAttributionAdapter implements RevisionAttributionAdapter {
  createTextTarget(
    blockId: string,
    yText: Y.Text,
    start: number,
    end: number,
    startAssoc: -1 | 1,
    endAssoc: -1 | 1,
  ): RevisionTextTarget {
    return {
      kind: 'text',
      blockId,
      start: Array.from(Y.encodeRelativePosition(
        Y.createRelativePositionFromTypeIndex(yText, start, startAssoc),
      )),
      end: Array.from(Y.encodeRelativePosition(
        Y.createRelativePositionFromTypeIndex(yText, end, endAssoc),
      )),
    }
  }

  resolveTextTarget(
    target: RevisionTextTarget,
    yDoc: Y.Doc,
    yText: Y.Text,
  ): {start: number; end: number} | null {
    try {
      const start = Y.createAbsolutePositionFromRelativePosition(
        Y.decodeRelativePosition(Uint8Array.from(target.start)),
        yDoc,
      )
      const end = Y.createAbsolutePositionFromRelativePosition(
        Y.decodeRelativePosition(Uint8Array.from(target.end)),
        yDoc,
      )
      if (!start || !end || start.type !== yText || end.type !== yText) return null
      return {start: Math.min(start.index, end.index), end: Math.max(start.index, end.index)}
    } catch {
      return null
    }
  }

  decorateInlineAttributes(
    attributes: DeltaInsert['attributes'] | undefined,
    attribution: RevisionInlineAttribution,
  ): NonNullable<DeltaInsert['attributes']> {
    const decorated = {...(attributes ?? {})}
    if (attribution.ids.length) {
      decorated['a:data-bc-revision-ids'] = attribution.ids.join(',')
      decorated['a:data-bc-revision-kind'] = attribution.kind
      decorated['a:data-bc-revision-state'] = attribution.state
    }
    return decorated
  }
}
