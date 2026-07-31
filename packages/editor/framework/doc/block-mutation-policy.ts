import {BlockCraftError, ErrorCode} from '../../global'

export type BlockMutationOperation =
  | 'delete'
  | 'move'
  | 'replace'
  | 'update-meta'
  | 'undo'
  | 'redo'

export interface BlockMutationContext {
  operation: BlockMutationOperation
  /** Blocks directly targeted by the operation. */
  blockIds: readonly string[]
  /** Current source parent for structural operations. */
  parentId?: string
  /** Destination parent for move operations. */
  targetId?: string
  /** Instance-meta keys targeted by update-meta. */
  metaKeys?: readonly string[]
}

export interface BlockMutationPolicyResult {
  allowed: boolean
  message?: string
}

export type BlockMutationPolicy = (
  context: BlockMutationContext,
  doc: BlockCraft.Doc,
) => boolean | BlockMutationPolicyResult

export class BlockMutationPolicyError extends BlockCraftError {
  constructor(
    readonly context: BlockMutationContext,
    message = '当前操作不符合文档变更规则',
  ) {
    super(ErrorCode.ModelCRUDError, message)
    this.name = 'BlockMutationPolicyError'
  }
}

/**
 * Host-defined document mutation boundary.
 *
 * The policy is intentionally synchronous: CRUD and undo/redo must decide
 * before opening or replaying a Yjs transaction.
 */
export class BlockMutationPolicyManager {
  constructor(private readonly doc: BlockCraft.Doc) {}

  allows(context: BlockMutationContext): BlockMutationPolicyResult {
    const policy = this.doc.config.blockMutationPolicy
    if (!policy) return {allowed: true}
    const result = policy(context, this.doc)
    return typeof result === 'boolean'
      ? {allowed: result}
      : result
  }

  assert(context: BlockMutationContext): void {
    const result = this.allows(context)
    if (result.allowed) return
    throw new BlockMutationPolicyError(context, result.message)
  }
}
