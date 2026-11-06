import type {BlockCraftDoc} from '@ccc/blockcraft'
import type {
  DocumentAgentContext,
  DocumentAgentContextBlock,
  DocumentAgentSchemaCapability,
} from '../core/agent.types'
import {BLOCKCRAFT_BUILTIN_AGENT_EXTENSION} from '../core/builtin-block-capabilities'
import {DocumentAgentExtensionRegistry} from '../core/host-extension'
import {captureDocumentAgentManifestOptions} from './document-agent-capability-scope'
import {fingerprintAgentBlocks} from './document-agent-revision'

const DEFAULT_AGENT_EXTENSIONS = new DocumentAgentExtensionRegistry([
  BLOCKCRAFT_BUILTIN_AGENT_EXTENSION,
])

export function captureBlockCraftAgentContext(
  doc: BlockCraftDoc,
  options: {
    scope?: 'selection' | 'document'
    extensions?: DocumentAgentExtensionRegistry
  } = {},
): DocumentAgentContext | null {
  if (!doc.isInitialized || !doc.model.exists(doc.rootId)) return null

  const capabilities = captureBlockCraftAgentSchemaCapabilities(
    doc,
    options.extensions ?? DEFAULT_AGENT_EXTENSIONS,
  )
  const document = captureBlockCraftAgentDocumentAnchor(doc)

  const selection = doc.selection.value
  const hasExplicitSelection = options.scope !== 'document' && !!selection &&
    (!selection.collapsed || !!selection.getTableCellSelection())
  if (!hasExplicitSelection) {
    const documentContent = collectDocumentContent(doc, doc.rootId)
    return {
      protocolVersion: 2,
      scope: 'document',
      selection: null,
      selectedText: documentContent.text,
      blocks: documentContent.blocks,
      document,
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
      nodeType: String(doc.model.getNodeType(blockId) ?? 'unknown'),
      parentId: doc.model.getParentId(blockId),
      index: doc.model.indexInParent(blockId),
      childIds: doc.model.getChildrenIds(blockId),
      props: doc.model.getProps(blockId) ?? {},
      ...(doc.model.getTextDeltas(blockId) === undefined
        ? {}
        : {text: toAgentText(doc.model.getTextDeltas(blockId) ?? [])}),
      readonly: doc.isBlockReadonly(blockId),
    })
  }

  return {
    protocolVersion: 2,
    scope: 'selection',
    selection: selection.toSelectionJSON(),
    selectedText: doc.selection.getSelectedText(),
    blocks,
    document,
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

export function captureBlockCraftAgentDocumentAnchor(
  doc: BlockCraftDoc,
): DocumentAgentContext['document'] {
  const childIds = doc.model.getChildrenIds(doc.rootId)
  let appendIndex = childIds.length
  while (
    appendIndex > 0 &&
    doc.model.getFlavour(childIds[appendIndex - 1]) === 'placement-layout'
  ) {
    appendIndex--
  }
  return {
    rootId: doc.rootId,
    append: {
      parentId: doc.rootId,
      index: appendIndex,
    },
  }
}

export function captureBlockCraftAgentSchemaCapabilities(
  doc: BlockCraftDoc,
  extensions: DocumentAgentExtensionRegistry = DEFAULT_AGENT_EXTENSIONS,
): readonly DocumentAgentSchemaCapability[] {
  const manifestOptions = captureDocumentAgentManifestOptions(doc)
  return doc.schemas.getSchemaList().map(schema => {
    const flavour = String(schema.flavour)
    const capability = extensions.getBlockCapability(flavour, manifestOptions)
    const writableProperties = capability?.writableProps?.['properties']
    return {
      flavour,
      nodeType: String(schema.nodeType),
      label: schema.metadata.label,
      description: schema.metadata.description,
      schemaVersion: capability?.schemaVersion ?? schema.metadata.version,
      includeChildren: schema.metadata.includeChildren,
      excludeChildren: schema.metadata.excludeChildren,
      placementModes: schema.metadata.placement?.modes,
      plainTextOnly: schema.metadata.plainTextOnly,
      ...(capability ? {
        capabilityId: capability.id,
        semanticRoles: capability.semanticRoles,
        creatable: !!capability.createParameters,
        writablePropKeys: isRecord(writableProperties)
          ? Object.keys(writableProperties)
          : [],
        atomicProps: capability.atomicProps,
      } : {creatable: false}),
    }
  })
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
      nodeType: String(doc.model.getNodeType(blockId) ?? 'unknown'),
      parentId: doc.model.getParentId(blockId),
      index: doc.model.indexInParent(blockId),
      childIds: doc.model.getChildrenIds(blockId),
      props: doc.model.getProps(blockId) ?? {},
      ...(textDeltas === undefined ? {} : {text: toAgentText(textDeltas)}),
      readonly: doc.isBlockReadonly(blockId),
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

function toAgentText(deltas: readonly unknown[]): NonNullable<DocumentAgentContextBlock['text']> {
  return {plain: deltaToText(deltas), delta: deltas}
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
