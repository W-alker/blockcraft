import {BlockNodeType, type BlockCraftDoc, type IBlockProps, type IBlockSnapshot} from '@ccc/blockcraft'
import type {
  DocumentAgentContext,
  DocumentAgentPropValue,
  DocumentAgentOperation,
  DocumentAgentResult,
} from '../core/agent.types'
import {validateDocumentAgentResult} from '../core/operation-validator'
import {fingerprintCurrentAgentBlocks} from './document-agent-revision'

export type DocumentAgentApplyResult = {
  applied: number
}

export class DocumentAgentApplyError extends Error {
  constructor(readonly code: 'readonly' | 'stale' | 'invalid' | 'unsupported', message: string) {
    super(message)
    this.name = 'DocumentAgentApplyError'
  }
}

export class DocumentAgentOperationApplier {
  constructor(private readonly doc: BlockCraftDoc) {}

  validate(
    context: DocumentAgentContext,
    result: DocumentAgentResult,
  ): void {
    const issues = validateDocumentAgentResult(result)
    if (issues.length) {
      throw new DocumentAgentApplyError('invalid', issues.join(' '))
    }
    if (this.doc.isReadonly) {
      throw new DocumentAgentApplyError('readonly', 'The document is readonly.')
    }
    if (this.doc.model.structureRevision !== context.baseRevision.structureRevision) {
      throw new DocumentAgentApplyError('stale', 'The document structure changed while the Agent was working.')
    }
    if (
      fingerprintCurrentAgentBlocks(this.doc, context.blocks) !==
      context.baseRevision.contentFingerprint
    ) {
      throw new DocumentAgentApplyError('stale', 'The selected content changed while the Agent was working.')
    }

    for (const operation of result.operations) {
      this.validateOperation(context, operation)
    }
  }

  apply(
    context: DocumentAgentContext,
    result: DocumentAgentResult,
  ): DocumentAgentApplyResult {
    this.validate(context, result)

    let applied = 0
    this.doc.crud.transact(() => {
      for (const operation of result.operations) {
        this.applyOperation(operation)
        applied++
      }
    })
    return {applied}
  }

  private validateOperation(
    context: DocumentAgentContext,
    operation: DocumentAgentOperation,
  ): void {
    if (operation.kind === 'replace-text') {
      assertBlockInContext(context, operation.blockId)
      if (!this.doc.model.exists(operation.blockId)) {
        throw new DocumentAgentApplyError('stale', `Block ${operation.blockId} no longer exists.`)
      }
      const textLength = this.doc.model.getTextLength(operation.blockId)
      if (
        operation.from < 0 ||
        operation.to < operation.from ||
        operation.to > textLength
      ) {
        throw new DocumentAgentApplyError('invalid', `Invalid text range for ${operation.blockId}.`)
      }
      return
    }

    if (operation.kind === 'update-block-props') {
      assertBlockInContext(context, operation.blockId)
      if (!this.doc.model.exists(operation.blockId)) {
        throw new DocumentAgentApplyError('stale', `Block ${operation.blockId} no longer exists.`)
      }
      const contextBlock = context.blocks.find(block => block.blockId === operation.blockId)
      for (const [key, value] of Object.entries(operation.props)) {
        if (
          !AGENT_WRITABLE_PROP_KEYS.has(key) &&
          !(key in (contextBlock?.props ?? {}))
        ) {
          throw new DocumentAgentApplyError('invalid', `Property ${key} is not writable by the Agent.`)
        }
        if (!isDocumentAgentPropValue(value)) {
          throw new DocumentAgentApplyError('invalid', `Property ${key} has an unsupported value.`)
        }
      }
      if (
        contextBlock?.flavour === 'mermaid' &&
        'mode' in operation.props &&
        !['text', 'graph', 'default'].includes(String(operation.props['mode']))
      ) {
        throw new DocumentAgentApplyError('invalid', 'Mermaid mode must be text, graph, or default.')
      }
      return
    }

    if (operation.kind === 'insert-blocks') {
      assertBlockInContext(context, operation.parentId)
      if (!this.doc.model.exists(operation.parentId)) {
        throw new DocumentAgentApplyError('stale', `Parent ${operation.parentId} no longer exists.`)
      }
      const childCount = this.doc.model.getChildrenIds(operation.parentId).length
      if (operation.index > childCount) {
        throw new DocumentAgentApplyError('invalid', `Invalid insertion index for ${operation.parentId}.`)
      }
      if (!operation.snapshots.every(isBlockSnapshotLike)) {
        throw new DocumentAgentApplyError('invalid', 'Agent returned an invalid block snapshot.')
      }
      for (const snapshot of operation.snapshots) {
        if (this.doc.model.exists(snapshot.id)) {
          throw new DocumentAgentApplyError('invalid', `Snapshot ${snapshot.id} already exists.`)
        }
        if (!this.isSnapshotInsertable(operation.parentId, snapshot)) {
          throw new DocumentAgentApplyError('invalid', `Snapshot ${snapshot.id} is not valid at this position.`)
        }
      }
      return
    }

    if (operation.kind === 'create-blocks') {
      assertBlockInContext(context, operation.parentId)
      if (!this.doc.model.exists(operation.parentId)) {
        throw new DocumentAgentApplyError('stale', `Parent ${operation.parentId} no longer exists.`)
      }
      const childCount = this.doc.model.getChildrenIds(operation.parentId).length
      if (operation.index > childCount) {
        throw new DocumentAgentApplyError('invalid', `Invalid insertion index for ${operation.parentId}.`)
      }
      if (!this.doc.schemas.has(operation.flavour)) {
        throw new DocumentAgentApplyError('invalid', `Schema ${operation.flavour} is not registered.`)
      }
      if (!this.doc.canInsertChild(operation.parentId, operation.flavour as BlockCraft.BlockFlavour)) {
        throw new DocumentAgentApplyError('invalid', `Schema ${operation.flavour} is not allowed in ${operation.parentId}.`)
      }
      const snapshot = this.createSnapshot(operation)
      if (!this.isSnapshotTreeValid(snapshot)) {
        throw new DocumentAgentApplyError('invalid', `Schema ${operation.flavour} created an invalid snapshot.`)
      }
      return
    }

    if (operation.kind === 'replace-block') {
      assertBlockInContext(context, operation.blockId)
      if (!this.doc.model.exists(operation.blockId)) {
        throw new DocumentAgentApplyError('stale', `Block ${operation.blockId} no longer exists.`)
      }
      const parentId = this.doc.model.getParentId(operation.blockId)
      if (!parentId) {
        throw new DocumentAgentApplyError('invalid', `Block ${operation.blockId} cannot be replaced.`)
      }
      if (!this.doc.schemas.has(operation.flavour)) {
        throw new DocumentAgentApplyError('invalid', `Schema ${operation.flavour} is not registered.`)
      }
      if (!this.doc.canInsertChild(parentId, operation.flavour as BlockCraft.BlockFlavour)) {
        throw new DocumentAgentApplyError('invalid', `Schema ${operation.flavour} is not allowed in ${parentId}.`)
      }
      const snapshot = this.createSnapshot(operation)
      if (!this.isSnapshotTreeValid(snapshot)) {
        throw new DocumentAgentApplyError('invalid', `Schema ${operation.flavour} created an invalid snapshot.`)
      }
      return
    }

    if (operation.kind === 'apply-text-delta') {
      assertBlockInContext(context, operation.blockId)
      if (!this.doc.model.exists(operation.blockId)) {
        throw new DocumentAgentApplyError('stale', `Block ${operation.blockId} no longer exists.`)
      }
      if (this.doc.model.getTextDeltas(operation.blockId) === undefined) {
        throw new DocumentAgentApplyError('invalid', `Block ${operation.blockId} is not editable.`)
      }
      return
    }

    if (operation.kind === 'delete-blocks') {
      assertBlockInContext(context, operation.parentId)
      assertChildRange(this.doc, operation.parentId, operation.index, operation.count)
      return
    }

    if (operation.kind === 'move-blocks') {
      assertBlockInContext(context, operation.parentId)
      assertBlockInContext(context, operation.targetId)
      assertChildRange(this.doc, operation.parentId, operation.index, operation.count)
      const targetChildren = this.doc.model.getChildrenIds(operation.targetId)
      if (operation.targetIndex > targetChildren.length) {
        throw new DocumentAgentApplyError('invalid', `Invalid move index for ${operation.targetId}.`)
      }
      if (operation.parentId === operation.targetId &&
          operation.targetIndex >= operation.index &&
          operation.targetIndex <= operation.index + operation.count) {
        throw new DocumentAgentApplyError('invalid', 'A block range cannot be moved into itself.')
      }
      for (const blockId of this.doc.model.getChildrenIds(operation.parentId)
        .slice(operation.index, operation.index + operation.count)) {
        const flavour = this.doc.model.getFlavour(blockId)
        if (!flavour || !this.doc.canInsertChild(operation.targetId, flavour as BlockCraft.BlockFlavour)) {
          throw new DocumentAgentApplyError('invalid', `Block ${blockId} is not allowed in ${operation.targetId}.`)
        }
      }
      return
    }

    throw new DocumentAgentApplyError('unsupported', 'Agent returned an unsupported operation.')
  }

  private applyOperation(operation: DocumentAgentOperation): void {
    if (operation.kind === 'replace-text') {
      this.doc.crud.replaceText(
        operation.blockId,
        operation.from,
        operation.to - operation.from,
        operation.replacement,
      )
      return
    }

    if (operation.kind === 'update-block-props') {
      this.doc.crud.updateBlockProps(
        operation.blockId,
        operation.props as Partial<IBlockProps>,
      )
      return
    }

    if (operation.kind === 'insert-blocks') {
      this.doc.crud.insertBlockSnapshots(
        operation.parentId,
        operation.index,
        operation.snapshots as IBlockSnapshot[],
      )
      return
    }

    if (operation.kind === 'create-blocks') {
      this.doc.crud.insertBlockSnapshots(
        operation.parentId,
        operation.index,
        [this.createSnapshot(operation)],
      )
      return
    }

    if (operation.kind === 'replace-block') {
      this.doc.crud.replaceWithSnapshots(
        operation.blockId,
        [this.createSnapshot(operation)],
      )
      return
    }

    if (operation.kind === 'apply-text-delta') {
      this.doc.crud.applyTextDelta(operation.blockId, operation.delta as never[])
      return
    }

    if (operation.kind === 'delete-blocks') {
      this.doc.crud.deleteBlocks(operation.parentId, operation.index, operation.count)
      return
    }

    if (operation.kind === 'move-blocks') {
      this.doc.crud.moveBlocks(
        operation.parentId,
        operation.index,
        operation.count,
        operation.targetId,
        operation.targetIndex,
      )
      return
    }

    throw new DocumentAgentApplyError('unsupported', 'Agent returned an unsupported operation.')
  }

  private createSnapshot(
    operation: Extract<DocumentAgentOperation, {kind: 'create-blocks' | 'replace-block'}>,
  ): IBlockSnapshot {
    try {
      return this.doc.schemas.createSnapshot(
        operation.flavour as BlockCraft.BlockFlavour,
        operation.params as BlockCraft.BlockCreateParameters<BlockCraft.BlockFlavour>,
      ) as IBlockSnapshot
    } catch (error) {
      throw new DocumentAgentApplyError(
        'invalid',
        `Unable to create ${operation.flavour} from the supplied parameters: ${error instanceof Error ? error.message : 'invalid parameters'}`,
      )
    }
  }

  private isSnapshotInsertable(
    parentId: string,
    snapshot: BlockSnapshotLike,
  ): boolean {
    if (!this.doc.schemas.has(snapshot.flavour)) return false
    if (!this.doc.canInsertChild(parentId, snapshot.flavour as BlockCraft.BlockFlavour)) {
      return false
    }
    return this.isSnapshotTreeValid(snapshot)
  }

  private isSnapshotTreeValid(snapshot: BlockSnapshotLike): boolean {
    const schema = this.doc.schemas.get(snapshot.flavour, false)
    if (!schema) return false
    // Editable block children are Inline Delta entries, not nested Block
    // Snapshots. Only container/root block children belong to this recursive
    // tree validation.
    if (schema.nodeType === BlockNodeType.editable || !Array.isArray(snapshot.children)) {
      return true
    }
    return snapshot.children.every(child => {
      if (!isBlockSnapshotLike(child)) return false
      if (!this.doc.schemas.isValidChildrenForInstance(
        child.flavour as BlockCraft.BlockFlavour,
        schema,
        snapshot.meta,
      )) {
        return false
      }
      return this.isSnapshotTreeValid(child)
    })
  }
}

const AGENT_WRITABLE_PROP_KEYS = new Set([
  'background',
  'backColor',
  'borderColor',
  'bgi',
  'bgo',
  'bgs',
  'bgx',
  'bgy',
  'color',
  'depth',
  'heading',
  'lh',
  'pfs',
  'placementLayer',
  'position',
  'psa',
  'psb',
  'textAlign',
])

function isDocumentAgentPropValue(value: unknown): value is DocumentAgentPropValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return true
  }
  if (Array.isArray(value)) return value.every(isDocumentAgentPropValue)
  if (!value || typeof value !== 'object') return false
  return Object.values(value).every(isDocumentAgentPropValue)
}

function assertBlockInContext(context: DocumentAgentContext, blockId: string): void {
  if (context.blocks.some(block => block.blockId === blockId)) return
  throw new DocumentAgentApplyError(
    'invalid',
    `Block ${blockId} is outside the Agent request context.`,
  )
}

function assertChildRange(
  doc: BlockCraftDoc,
  parentId: string,
  index: number,
  count: number,
): void {
  if (!doc.model.exists(parentId)) {
    throw new DocumentAgentApplyError('stale', `Parent ${parentId} no longer exists.`)
  }
  const childCount = doc.model.getChildrenIds(parentId).length
  if (index < 0 || count < 1 || index + count > childCount) {
    throw new DocumentAgentApplyError('invalid', `Invalid child range for ${parentId}.`)
  }
}

type BlockSnapshotLike = {
  id: string
  flavour: string
  nodeType: unknown
  props: Record<string, unknown>
  meta: Record<string, unknown>
  children: unknown
}

function isBlockSnapshotLike(value: unknown): value is BlockSnapshotLike {
  if (!value || typeof value !== 'object') return false
  const snapshot = value as Record<string, unknown>
  return (
    typeof snapshot['id'] === 'string' &&
    typeof snapshot['flavour'] === 'string' &&
    snapshot['nodeType'] !== undefined &&
    !!snapshot['props'] &&
    typeof snapshot['props'] === 'object' &&
    !!snapshot['meta'] &&
    typeof snapshot['meta'] === 'object' &&
    snapshot['children'] !== undefined
  )
}
