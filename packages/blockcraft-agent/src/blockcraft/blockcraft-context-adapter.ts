import type {BlockCraftDoc} from '@ccc/blockcraft'
import type {
  DocumentAgentContext,
  DocumentAgentContextBlock,
  DocumentAgentSchemaCapability,
} from '../core/agent.types'
import {fingerprintAgentBlocks} from './document-agent-revision'

export function captureBlockCraftAgentContext(
  doc: BlockCraftDoc,
  options: {scope?: 'selection' | 'document'} = {},
): DocumentAgentContext | null {
  if (!doc.isInitialized || !doc.model.exists(doc.rootId)) return null

  const capabilities = captureBlockCraftAgentSchemaCapabilities(doc)

  const selection = doc.selection.value
  const hasExplicitSelection = options.scope !== 'document' && !!selection &&
    (!selection.collapsed || !!selection.getTableCellSelection())
  if (!hasExplicitSelection) {
    const documentContent = collectDocumentContent(doc, doc.rootId)
    return {
      scope: 'document',
      selection: null,
      selectedText: documentContent.text,
      blocks: documentContent.blocks,
      capabilities,
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
  for (const blockId of [...blockIds]) {
    const parentId = doc.model.getParentId(blockId)
    if (parentId) blockIds.add(parentId)
  }

  const blocks: DocumentAgentContextBlock[] = []
  for (const blockId of blockIds) {
    if (!doc.model.exists(blockId)) continue

    blocks.push({
      blockId,
      flavour: doc.model.getFlavour(blockId) ?? 'unknown',
      parentId: doc.model.getParentId(blockId),
      index: doc.model.indexInParent(blockId),
      childIds: doc.model.getChildrenIds(blockId),
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
    capabilities,
    baseRevision: {
      structureRevision: doc.model.structureRevision,
      contentFingerprint: fingerprintAgentBlocks(blocks),
    },
  }
}

/** Capture the complete model for applying a result independently of live UI selection. */
export function captureBlockCraftAgentDocumentContext(
  doc: BlockCraftDoc,
): DocumentAgentContext | null {
  return captureBlockCraftAgentContext(doc, {scope: 'document'})
}

export function captureBlockCraftAgentSchemaCapabilities(
  doc: BlockCraftDoc,
): readonly DocumentAgentSchemaCapability[] {
  return doc.schemas.getSchemaList().map(schema => ({
    flavour: String(schema.flavour),
    nodeType: String(schema.nodeType),
    label: schema.metadata.label,
    description: schema.metadata.description,
    includeChildren: schema.metadata.includeChildren,
    excludeChildren: schema.metadata.excludeChildren,
    placementModes: schema.metadata.placement?.modes,
    plainTextOnly: schema.metadata.plainTextOnly,
  }))
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
      parentId: doc.model.getParentId(blockId),
      index: doc.model.indexInParent(blockId),
      childIds: doc.model.getChildrenIds(blockId),
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
