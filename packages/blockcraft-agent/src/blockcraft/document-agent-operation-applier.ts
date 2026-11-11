import {
  type BlockCraftDoc,
  type DocUndoItemToken,
  type IBlockProps,
  type RevisionActorSnapshot,
} from '@ccc/blockcraft'
import type {
  DocumentAgentContext,
  DocumentAgentResult,
} from '../core/agent.types'
import {BLOCKCRAFT_BUILTIN_AGENT_EXTENSION} from '../core/builtin-block-capabilities'
import {DocumentAgentExtensionRegistry} from '../core/host-extension'
import {validateDocumentAgentResult} from '../core/operation-validator'
import {
  DocumentAgentOperationCompileError,
  DocumentAgentOperationCompiler,
  type PreparedDocumentAgentOperation,
} from './document-agent-operation-compiler'
import {fingerprintCurrentAgentBlocks} from './document-agent-revision'

export type DocumentAgentApplyResult = {
  applied: number
}

export type DocumentAgentRevisionApplyResult = DocumentAgentApplyResult & {
  groupId: string
  revisionIds: readonly string[]
  /** Safely reverts this whole Agent transaction while it remains the latest local edit. */
  undoItemToken: DocUndoItemToken | null
}

export interface DocumentAgentRevisionApplyOptions {
  actor: RevisionActorSnapshot
  groupId?: string
}

export class DocumentAgentApplyError extends Error {
  constructor(readonly code: 'readonly' | 'stale' | 'invalid' | 'unsupported', message: string) {
    super(message)
    this.name = 'DocumentAgentApplyError'
  }
}

export class DocumentAgentOperationApplier {
  constructor(
    private readonly doc: BlockCraftDoc,
    private readonly extensions = new DocumentAgentExtensionRegistry([
      BLOCKCRAFT_BUILTIN_AGENT_EXTENSION,
    ]),
  ) {}

  validate(
    context: DocumentAgentContext,
    result: DocumentAgentResult,
  ): void {
    this.prepare(context, result)
  }

  apply(
    context: DocumentAgentContext,
    result: DocumentAgentResult,
  ): DocumentAgentApplyResult {
    const prepared = this.prepare(context, result)
    return {applied: this.applyOperations(prepared)}
  }

  applyAsRevision(
    context: DocumentAgentContext,
    result: DocumentAgentResult,
    options: DocumentAgentRevisionApplyOptions,
  ): DocumentAgentRevisionApplyResult {
    const prepared = this.prepare(context, result)
    const groupId = options.groupId?.trim() || createRevisionGroupId()
    const captured = this.doc.crud.undoManager.captureUndoItem(() => {
      let applied = 0
      this.doc.crud.transact(() => {
        applied = this.doc.revisions.runAsRevision(options.actor, () =>
          this.executeOperations(prepared), {groupId})
      })
      return applied
    })

    const revisionIds = this.doc.revisions.listGroup(groupId).map(revision => revision.id)
    return {
      applied: captured.result,
      groupId,
      revisionIds,
      undoItemToken: captured.token,
    }
  }

  private prepare(
    context: DocumentAgentContext,
    result: DocumentAgentResult,
  ): PreparedDocumentAgentOperation[] {
    const issues = validateDocumentAgentResult(result)
    if (issues.length) {
      throw new DocumentAgentApplyError('invalid', issues.join(' '))
    }
    if (context.protocolVersion !== 2) {
      throw new DocumentAgentApplyError('invalid', 'Unsupported Agent context protocol version.')
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

    try {
      return new DocumentAgentOperationCompiler(
        this.doc,
        context,
        this.extensions,
      ).compile(result.operations)
    } catch (error) {
      if (error instanceof DocumentAgentOperationCompileError) {
        throw new DocumentAgentApplyError('invalid', error.message)
      }
      throw error
    }
  }

  private applyOperations(operations: readonly PreparedDocumentAgentOperation[]): number {
    let applied = 0
    this.doc.crud.transact(() => applied = this.executeOperations(operations))
    return applied
  }

  private executeOperations(operations: readonly PreparedDocumentAgentOperation[]): number {
    for (const operation of operations) this.applyOperation(operation)
    return operations.length
  }

  private applyOperation(operation: PreparedDocumentAgentOperation): void {
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
      this.doc.crud.updateBlockProps(operation.blockId, operation.props as Partial<IBlockProps>)
      return
    }
    if (operation.kind === 'create-blocks') {
      if (operation.embedded) return
      this.doc.crud.insertBlockSnapshots(operation.parentId, operation.index, [operation.snapshot])
      return
    }
    if (operation.kind === 'replace-block') {
      this.doc.crud.replaceBlockSnapshots(operation.blockId, [operation.snapshot])
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
    }
  }
}

let revisionGroupSequence = 0

function createRevisionGroupId(): string {
  revisionGroupSequence = (revisionGroupSequence + 1) % Number.MAX_SAFE_INTEGER
  return `blockcraft-agent-${Date.now().toString(36)}-${revisionGroupSequence.toString(36)}`
}
