import type {BlockCraftDoc} from '@ccc/blockcraft'
import type {
  DocumentAgentContext,
  DocumentAgentContextBlock,
} from '../core/agent.types'
import {fingerprintAgentBlocks} from './document-agent-revision'

export function captureBlockCraftAgentContext(
  doc: BlockCraftDoc,
): DocumentAgentContext | null {
  if (!doc.isInitialized || !doc.model.exists(doc.rootId)) return null

  const selection = doc.selection.value
  const hasExplicitSelection = !!selection &&
    (!selection.collapsed || !!selection.getTableCellSelection())
  if (!hasExplicitSelection) {
    const documentContent = collectDocumentContent(doc, doc.rootId)
    return {
      scope: 'document',
      selection: null,
      selectedText: documentContent.text,
      blocks: documentContent.blocks,
      baseRevision: {
        structureRevision: doc.model.structureRevision,
        contentFingerprint: fingerprintAgentBlocks(documentContent.blocks),
      },
    }
  }

  const blockIds = new Set<string>([
    selection.firstBlockId,
    selection.lastBlockId,
  ])

  for (const blockId of selection.getBoundarySelectedChildIds() ?? []) {
    blockIds.add(blockId)
  }

  const blocks: DocumentAgentContextBlock[] = []
  for (const blockId of blockIds) {
    if (!doc.model.exists(blockId)) continue

    blocks.push({
      blockId,
      flavour: doc.model.getFlavour(blockId) ?? 'unknown',
      props: doc.model.getProps(blockId) ?? {},
      textDeltas: doc.model.getTextDeltas(blockId) ?? [],
      snapshot: doc.model.toSnapshot(blockId),
    })
  }

  return {
    scope: 'selection',
    selection: selection.toSelectionJSON(),
    selectedText: doc.selection.getSelectedText(),
    blocks,
    baseRevision: {
      structureRevision: doc.model.structureRevision,
      contentFingerprint: fingerprintAgentBlocks(blocks),
    },
  }
}

function collectDocumentContent(
  doc: BlockCraftDoc,
  rootId: string,
): {blocks: DocumentAgentContextBlock[]; text: string} {
  const blocks: DocumentAgentContextBlock[] = []
  const textParts: string[] = []
  const visited = new Set<string>()

  const visit = (blockId: string): void => {
    if (visited.has(blockId) || !doc.model.exists(blockId)) return
    visited.add(blockId)

    const textDeltas = doc.model.getTextDeltas(blockId)
    blocks.push({
      blockId,
      flavour: doc.model.getFlavour(blockId) ?? 'unknown',
      props: doc.model.getProps(blockId) ?? {},
      textDeltas: textDeltas ?? [],
      snapshot: doc.model.toSnapshot(blockId),
    })

    if (textDeltas !== undefined) {
      textParts.push(deltaToText(textDeltas))
      return
    }

    for (const childId of doc.model.getChildrenIds(blockId)) visit(childId)
  }

  visit(rootId)
  return {blocks, text: textParts.join('\n')}
}

function deltaToText(deltas: readonly unknown[]): string {
  return deltas
    .map(delta => {
      if (!delta || typeof delta !== 'object') return ''
      const insert = (delta as {insert?: unknown}).insert
      return typeof insert === 'string' ? insert : ''
    })
    .join('')
}
