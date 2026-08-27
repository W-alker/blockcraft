import {
  RevisionUnsupportedOperationError,
  type BlockCraftDoc,
  type IBlockProps,
  type RevisionActorSnapshot,
} from '@ccc/blockcraft'
import type {
  DocumentAgentContext,
  DocumentAgentOperation,
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
    this.validateRevisionDiffCompatibility(result.operations)

    const groupId = options.groupId?.trim() || createRevisionGroupId()
    let applied = 0
    try {
      this.doc.revisions.runAsRevision(options.actor, () => {
        applied = this.applyOperations(prepared)
      }, {groupId})
    } catch (error) {
      if (error instanceof RevisionUnsupportedOperationError) {
        throw new DocumentAgentApplyError('unsupported', error.message)
      }
      throw error
    }

    const revisionIds = this.doc.revisions.listGroup(groupId).map(revision => revision.id)
    if (applied > 0 && revisionIds.length === 0) {
      throw new DocumentAgentApplyError(
        'unsupported',
        'Agent 修改没有生成可审阅的修订 Diff。',
      )
    }
    return {applied, groupId, revisionIds}
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
    this.doc.crud.transact(() => {
      for (const operation of operations) {
        this.applyOperation(operation)
        applied++
      }
    })
    return applied
  }

  private validateRevisionDiffCompatibility(
    operations: readonly DocumentAgentOperation[],
  ): void {
    for (const operation of operations) {
      if (operation.kind === 'update-block-props') {
        throw new DocumentAgentApplyError(
          'unsupported',
          '当前修订 Diff 尚不能表达已有块的属性或格式变化。请改用文本/块结构修订，或先扩展 Revision 属性 Diff。',
        )
      }
      if (operation.kind === 'move-blocks') {
        throw new DocumentAgentApplyError(
          'unsupported',
          '当前修订 Diff 尚不能表达块移动。请改用可审阅的插入/删除结构修订，或先扩展 Revision 移动 Diff。',
        )
      }
      if (operation.kind !== 'apply-text-delta') continue
      for (const deltaOperation of operation.delta) {
        if (!deltaOperation || typeof deltaOperation !== 'object' || Array.isArray(deltaOperation)) continue
        const delta = deltaOperation as Record<string, unknown>
        if (
          typeof delta['retain'] === 'number' &&
          delta['attributes'] &&
          typeof delta['attributes'] === 'object' &&
          Object.keys(delta['attributes'] as object).length
        ) {
          throw new DocumentAgentApplyError(
            'unsupported',
            '当前修订 Diff 尚不能表达已有文字的格式变化。',
          )
        }
        if ('insert' in delta && typeof delta['insert'] !== 'string') {
          throw new DocumentAgentApplyError(
            'unsupported',
            '当前修订 Diff 尚不能表达新增行内对象。',
          )
        }
      }
    }
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
