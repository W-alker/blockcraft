import type {BlockCraftDoc, IBlockProps, IBlockSnapshot} from '@ccc/blockcraft'
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

    throw new DocumentAgentApplyError('unsupported', 'Agent returned an unsupported operation.')
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
    if (!Array.isArray(snapshot.children)) return true
    const schema = this.doc.schemas.get(snapshot.flavour, false)
    if (!schema) return false
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
