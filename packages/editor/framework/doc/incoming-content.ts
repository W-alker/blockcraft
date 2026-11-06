import * as Y from 'yjs'
import {BlockNodeType, type DeltaInsert} from '../model'
import type {IBlockSnapshot} from '../block-std/types/block.type'
import {native2YBlock, type NativeBlockModel, type YBlock} from '../block-std/reactive/block'
import {generateId} from '../utils/id'
import type {BlockCraftDoc} from './document'
import type {IAdapter} from '../host/adapter.service'
import {exceedsContentBudget, exceedsTextLineBudget, textBytesLowerBound} from './incoming-content-preflight'

/** Content added by ONE paste/import, excluding the existing document and uploaded file bytes. */
export interface IncomingContent {
  snapshots?: readonly IBlockSnapshot[]
  inline?: DeltaInsert[]
}

export const DEFAULT_MAX_INCOMING_CONTENT_BYTES = 1.5 * 1024 * 1024

type IncomingContentHost = Pick<BlockCraftDoc, 'config' | 'messageService'>

function incomingLimit(doc: IncomingContentHost): number {
  const configured = doc.config?.maxIncomingContentBytes
  return configured != null && Number.isFinite(configured) && configured >= 0
    ? configured : DEFAULT_MAX_INCOMING_CONTENT_BYTES
}

function rejectIncomingContent(doc: IncomingContentHost, limit: number): false {
  const label = limit === DEFAULT_MAX_INCOMING_CONTENT_BYTES ? '1.5 MB' : `${limit} 字节`
  doc.messageService.warn(`本次粘贴或导入的协同内容超过 ${label}，请分批插入`)
  return false
}

/** Preflight normalized plain text before splitting/creating snapshots. True still requires the final check. */
export function checkIncomingTextSize(doc: IncomingContentHost, text: string, options?: {splitLines?: boolean}): boolean {
  const limit = incomingLimit(doc)
  const bytes = textBytesLowerBound(text, limit)
  if (bytes > limit || (options?.splitLines && exceedsTextLineBudget(text, limit - bytes))) {
    return rejectIncomingContent(doc, limit)
  }
  return true
}

/** Preflight only when the selected adapter can prove its output exceeds the budget. */
export function checkIncomingSourceSize(doc: IncomingContentHost, adapter: IAdapter, source: string): boolean {
  if (!adapter.exceedsIncomingContentLimit) return true
  // Normalization can remove marks across separate formatted text runs. Let the
  // final normalized snapshot check decide whenever that policy could shrink input.
  if (doc.config?.pasteTextPolicy === 'remove-stacked-marks' && /\p{M}/u.test(source)) return true
  const limit = incomingLimit(doc)
  return !adapter.exceedsIncomingContentLimit(source, limit) || rejectIncomingContent(doc, limit)
}

/**
 * Standalone Yjs v1 encoding of incoming content, NOT the eventual network update.
 * Does not copy the existing document, mutate snapshots, emit live updates or create undo entries.
 */
export function measureIncomingContentBytes(content: IncomingContent): number {
  const probe = new Y.Doc()
  // Stable worst-case client-id width; random probe IDs must not change boundary decisions.
  probe.clientID = 0xffffffff
  try {
    const blocks = probe.getMap<YBlock>('blocks')
    const write = (snapshot: IBlockSnapshot): string => {
      const id = generateId()
      const children = snapshot.nodeType === BlockNodeType.editable
        ? snapshot.children
        : snapshot.children.map(write)
      blocks.set(id, native2YBlock({...snapshot, id, children} as NativeBlockModel))
      return id
    }
    probe.transact(() => {
      content.snapshots?.forEach(write)
      if (content.inline?.length) probe.getText('inline').applyDelta(content.inline)
    })
    return Y.encodeStateAsUpdate(probe).byteLength
  } finally {
    probe.destroy()
  }
}

/** Fast conservative rejection, then exact encoding; call before ANY live mutation. */
export function checkIncomingContentSize(
  doc: IncomingContentHost,
  content: IncomingContent,
): boolean {
  const limit = incomingLimit(doc)
  if (exceedsContentBudget(content, limit)) return rejectIncomingContent(doc, limit)
  if (measureIncomingContentBytes(content) <= limit) return true
  return rejectIncomingContent(doc, limit)
}
