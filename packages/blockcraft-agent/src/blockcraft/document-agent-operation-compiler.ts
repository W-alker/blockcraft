import {
  BlockReadonlyOperation,
  BlockNodeType,
  type BlockCraftDoc,
  type IBlockSnapshot,
} from '@ccc/blockcraft'
import type {DocumentAgentContext, DocumentAgentOperation} from '../core/agent.types'
import {validateDocumentAgentJsonSchema} from '../core/json-schema'
import type {DocumentAgentExtensionRegistry} from '../core/host-extension'
import {captureDocumentAgentManifestOptions} from './document-agent-capability-scope'

const AGENT_TEXT_ATTRIBUTE_SCHEMAS:
Readonly<Record<string, Readonly<Record<string, unknown>>>> = {
  'a:bold': {type: ['boolean', 'null']},
  'a:italic': {type: ['boolean', 'null']},
  'a:underline': {type: ['boolean', 'null']},
  'a:strike': {type: ['boolean', 'null']},
  'a:code': {type: ['boolean', 'null']},
  'a:link': {type: ['string', 'null'], maxLength: 8_192},
  't:ff': {type: ['string', 'null'], maxLength: 100},
  't:fs': {type: ['number', 'null'], minimum: 0.1, maximum: 10},
  't:ls': {type: ['number', 'null'], minimum: -1, maximum: 10},
  's:color': {type: ['string', 'null'], maxLength: 256},
  's:background': {type: ['string', 'null'], maxLength: 256},
  's:fontSize': {type: ['string', 'null'], maxLength: 100},
  's:fontFamily': {type: ['string', 'null'], maxLength: 256},
  's:letterSpacing': {type: ['string', 'null'], maxLength: 100},
}

export const DOCUMENT_AGENT_CLIENT_REF_PREFIX = '$ref:'

export type PreparedDocumentAgentOperation =
  | Exclude<DocumentAgentOperation, {kind: 'create-blocks' | 'replace-block'}>
  | {
      kind: 'create-blocks'
      parentId: string
      index: number
      snapshot: IBlockSnapshot
      /** The snapshot was folded into an earlier create/replace snapshot. */
      embedded: boolean
    }
  | {
      kind: 'replace-block'
      blockId: string
      snapshot: IBlockSnapshot
    }

export class DocumentAgentOperationCompileError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DocumentAgentOperationCompileError'
  }
}

type ShadowBlock = {
  id: string
  flavour: string
  nodeType: BlockNodeType
  parentId: string | null
  children: string[]
  props: Record<string, unknown>
  meta: Record<string, unknown>
  textLength: number | null
  created: boolean
  snapshot?: IBlockSnapshot
}

export class DocumentAgentOperationCompiler {
  private readonly blocks = new Map<string, ShadowBlock>()
  private readonly clientRefs = new Map<string, string>()
  private readonly contextIds: Set<string>
  private readonly manifestOptions: ReturnType<
    typeof captureDocumentAgentManifestOptions
  >

  constructor(
    private readonly doc: BlockCraftDoc,
    private readonly context: DocumentAgentContext,
    private readonly extensions: DocumentAgentExtensionRegistry,
  ) {
    this.contextIds = new Set([
      ...context.blocks.map(block => block.blockId),
      ...(context.document ? [context.document.rootId, context.document.append.parentId] : []),
    ])
    this.manifestOptions = captureDocumentAgentManifestOptions(doc)
    this.captureDocument()
  }

  compile(operations: readonly DocumentAgentOperation[]): PreparedDocumentAgentOperation[] {
    return operations.map((operation, index) => {
      try {
        return this.compileOperation(operation)
      } catch (error) {
        if (error instanceof DocumentAgentOperationCompileError) {
          throw new DocumentAgentOperationCompileError(`Operation ${index}: ${error.message}`)
        }
        throw error
      }
    })
  }

  private compileOperation(operation: DocumentAgentOperation): PreparedDocumentAgentOperation {
    if (operation.kind === 'replace-text') {
      const blockId = this.resolveExistingContextRef(operation.blockId)
      const block = this.requireBlock(blockId)
      this.assertTextWritable(block, BlockReadonlyOperation.Replace)
      if (block.textLength === null) this.fail(`Block ${blockId} is not editable.`)
      if (operation.from < 0 || operation.to < operation.from || operation.to > block.textLength) {
        this.fail(`Invalid text range for ${blockId}.`)
      }
      block.textLength = block.textLength - (operation.to - operation.from) + operation.replacement.length
      return {...operation, blockId}
    }

    if (operation.kind === 'apply-text-delta') {
      const blockId = this.resolveExistingContextRef(operation.blockId)
      const block = this.requireBlock(blockId)
      this.assertTextWritable(block, BlockReadonlyOperation.Text)
      if (block.textLength === null) this.fail(`Block ${blockId} is not editable.`)
      this.validateTextDeltaOperations(operation.delta)
      block.textLength = applyDeltaLength(block.textLength, operation.delta, message => this.fail(message))
      return {...operation, blockId}
    }

    if (operation.kind === 'update-block-props') {
      const blockId = this.resolveExistingContextRef(operation.blockId)
      const block = this.requireBlock(blockId)
      this.assertPropsWritable(block)
      const capability = this.extensions.getBlockCapability(block.flavour, {
        ...this.manifestOptions,
      })
      if (!capability?.writableProps) {
        this.fail(`Schema ${block.flavour} does not declare Agent-writable props.`)
      }
      const errors = validateDocumentAgentJsonSchema(capability.writableProps, operation.props, 'props')
      if (errors.length) this.fail(errors.join(' '))
      block.props = applyPropsPatch(block.props, operation.props)
      return {...operation, blockId}
    }

    if (operation.kind === 'create-blocks') {
      const parentId = this.resolveStructuralRef(operation.parentId)
      const parent = this.requireBlock(parentId)
      this.assertContextOrCreated(parent)
      this.assertInsertable(parent, BlockReadonlyOperation.Insert)
      if (operation.index < 0 || operation.index > parent.children.length) {
        this.fail(`Invalid insertion index for ${parentId}.`)
      }
      const snapshot = this.createSnapshot(operation.flavour, operation.params)
      this.assertChildAllowed(parent, snapshot.flavour)
      this.validateSnapshotTree(snapshot)
      const embedded = parent.created
      if (embedded) this.insertIntoCreatedSnapshot(parent, operation.index, snapshot)
      this.registerSnapshotTree(snapshot, parentId)
      parent.children.splice(operation.index, 0, snapshot.id)
      this.bindClientRef(operation.clientRef, snapshot.id)
      return {kind: 'create-blocks', parentId, index: operation.index, snapshot, embedded}
    }

    if (operation.kind === 'replace-block') {
      const blockId = this.resolveStructuralRef(operation.blockId)
      const block = this.requireBlock(blockId)
      this.assertContextOrCreated(block)
      if (block.created) {
        this.fail(`Block ${blockId} was created earlier in this plan; create the intended final snapshot directly.`)
      }
      if (!block.parentId) this.fail(`Block ${blockId} cannot be replaced.`)
      const parent = this.requireBlock(block.parentId)
      const index = parent.children.indexOf(blockId)
      if (index < 0) this.fail(`Block ${blockId} is detached from ${parent.id}.`)
      const snapshot = this.createSnapshot(operation.flavour, operation.params)
      this.assertChildAllowed(parent, snapshot.flavour)
      this.validateSnapshotTree(snapshot)
      this.assertReplaceable(block, parent)
      this.doc.mutationPolicy?.assert({
        operation: 'replace',
        blockIds: [blockId],
        parentId: parent.id,
      })
      this.removeSubtree(blockId)
      this.registerSnapshotTree(snapshot, parent.id)
      parent.children.splice(index, 1, snapshot.id)
      this.bindClientRef(operation.clientRef, snapshot.id)
      return {kind: 'replace-block', blockId, snapshot}
    }

    if (operation.kind === 'delete-blocks') {
      const parentId = this.resolveStructuralRef(operation.parentId)
      const parent = this.requireBlock(parentId)
      this.assertContextOrCreated(parent)
      const ids = parent.children.slice(operation.index, operation.index + operation.count)
      if (operation.index < 0 || operation.count < 1 || ids.length !== operation.count) {
        this.fail(`Invalid child range for ${parentId}.`)
      }
      const deleting = ids.map(id => this.requireBlock(id))
      if (deleting.some(block => block.created)) {
        this.fail('Deleting a block created earlier in the same plan is unsupported; omit that creation instead.')
      }
      this.assertRemovable(deleting, BlockReadonlyOperation.Delete)
      this.doc.mutationPolicy?.assert({
        operation: 'delete',
        blockIds: ids,
        parentId,
      })
      parent.children.splice(operation.index, operation.count)
      ids.forEach(id => this.removeSubtree(id))
      return {...operation, parentId}
    }

    if (operation.kind === 'move-blocks') {
      const parentId = this.resolveStructuralRef(operation.parentId)
      const targetId = this.resolveStructuralRef(operation.targetId)
      const parent = this.requireBlock(parentId)
      const target = this.requireBlock(targetId)
      this.assertContextOrCreated(parent)
      this.assertContextOrCreated(target)
      const movingIds = parent.children.slice(operation.index, operation.index + operation.count)
      if (operation.index < 0 || operation.count < 1 || movingIds.length !== operation.count) {
        this.fail(`Invalid child range for ${parentId}.`)
      }
      const moving = movingIds.map(id => this.requireBlock(id))
      if (moving.some(block => block.created)) {
        this.fail('Moving a block created earlier in the same plan is unsupported; create it at the final location.')
      }
      moving.forEach(block => {
        const id = block.id
        this.assertChildAllowed(target, block.flavour)
        if (id === targetId || this.isDescendant(targetId, id)) {
          this.fail(`Block ${id} cannot be moved into its own subtree.`)
        }
      })
      this.assertMovable(moving, target)
      this.doc.mutationPolicy?.assert({
        operation: 'move',
        blockIds: movingIds,
        parentId,
        targetId,
      })

      parent.children.splice(operation.index, operation.count)
      if (operation.targetIndex < 0 || operation.targetIndex > target.children.length) {
        this.fail(`Invalid post-removal move index for ${targetId}.`)
      }
      target.children.splice(operation.targetIndex, 0, ...movingIds)
      movingIds.forEach(id => this.requireBlock(id).parentId = targetId)
      return {...operation, parentId, targetId}
    }

    return this.fail('Unsupported Agent operation.')
  }

  private createSnapshot(flavour: string, params: readonly unknown[]): IBlockSnapshot {
    if (!this.doc.schemas.has(flavour)) this.fail(`Schema ${flavour} is not registered.`)
    const schema = this.doc.schemas.get(flavour, false)
    const capability = this.extensions.getBlockCapability(flavour, {
      ...this.manifestOptions,
    })
    if (!capability?.createParameters) {
      this.fail(`Schema ${flavour} does not declare Agent creation parameters.`)
    }
    if (
      capability.schemaVersion !== undefined &&
      capability.schemaVersion !== schema?.metadata.version
    ) {
      this.fail(
        `Capability ${capability.id} targets Schema version ${capability.schemaVersion}, ` +
        `but ${flavour} is version ${schema?.metadata.version ?? 'unknown'}.`,
      )
    }
    const errors = validateDocumentAgentJsonSchema(capability.createParameters, params, 'params')
    if (errors.length) this.fail(errors.join(' '))
    try {
      return this.doc.schemas.createSnapshot(
        flavour as BlockCraft.BlockFlavour,
        params as BlockCraft.BlockCreateParameters<BlockCraft.BlockFlavour>,
      ) as IBlockSnapshot
    } catch (error) {
      this.fail(`Unable to create ${flavour}: ${error instanceof Error ? error.message : 'invalid parameters'}`)
    }
  }

  private validateSnapshotTree(snapshot: IBlockSnapshot, seen = new Set<string>()): void {
    if (!snapshot.id || seen.has(snapshot.id) || this.blocks.has(snapshot.id)) {
      this.fail(`Schema generated a duplicate block ID: ${snapshot.id || '(empty)'}.`)
    }
    seen.add(snapshot.id)
    const schema = this.doc.schemas.get(snapshot.flavour, false)
    if (!schema || schema.nodeType !== snapshot.nodeType) {
      this.fail(`Schema ${snapshot.flavour} generated an invalid nodeType.`)
    }
    if (!isRecord(snapshot.props) || !isRecord(snapshot.meta) || !Array.isArray(snapshot.children)) {
      this.fail(`Schema ${snapshot.flavour} generated an invalid snapshot shape.`)
    }
    if (snapshot.nodeType === BlockNodeType.void && snapshot.children.length) {
      this.fail(`Void block ${snapshot.flavour} cannot contain children.`)
    }
    if (snapshot.nodeType === BlockNodeType.editable) {
      if (!snapshot.children.every(isDeltaInsertLike)) {
        this.fail(`Editable block ${snapshot.flavour} contains invalid inline Delta.`)
      }
      snapshot.children.forEach((delta, index) => {
        this.validateInlineInsert(
          delta as unknown as Record<string, unknown>,
          `Snapshot ${snapshot.flavour} inline Delta ${index}`,
        )
      })
      return
    }
    for (const child of snapshot.children) {
      if (!isSnapshotLike(child)) this.fail(`Container ${snapshot.flavour} contains invalid child data.`)
      if (!this.doc.schemas.isValidChildrenForInstance(child.flavour, schema, snapshot.meta)) {
        this.fail(`Schema ${child.flavour} is not allowed inside ${snapshot.flavour}.`)
      }
      this.validateSnapshotTree(child, seen)
    }
  }

  private registerSnapshotTree(snapshot: IBlockSnapshot, parentId: string | null): void {
    const childSnapshots = snapshot.nodeType === BlockNodeType.block || snapshot.nodeType === BlockNodeType.root
      ? snapshot.children
      : []
    this.blocks.set(snapshot.id, {
      id: snapshot.id,
      flavour: String(snapshot.flavour),
      nodeType: snapshot.nodeType,
      parentId,
      children: childSnapshots.map(child => child.id),
      props: {...snapshot.props},
      meta: {...snapshot.meta},
      textLength: snapshot.nodeType === BlockNodeType.editable
        ? deltaLength(snapshot.children)
        : null,
      created: true,
      snapshot,
    })
    childSnapshots.forEach(child => this.registerSnapshotTree(child, snapshot.id))
  }

  private validateTextDeltaOperations(delta: readonly unknown[]): void {
    delta.forEach((raw, index) => {
      const path = `Text Delta operation ${index}`
      if (!isRecord(raw)) this.fail(`${path} is invalid.`)
      const operationKeys = Object.keys(raw).filter(key => key !== 'attributes')
      if (
        operationKeys.length !== 1 ||
        !['insert', 'delete', 'retain'].includes(operationKeys[0])
      ) {
        this.fail(`${path} must contain exactly one supported operation.`)
      }

      const operation = operationKeys[0]
      const attributes = raw['attributes']
      if (attributes !== undefined && !isPrimitiveRecord(attributes)) {
        this.fail(`${path} attributes must contain primitive values.`)
      }
      if (operation === 'delete') {
        if (attributes !== undefined) this.fail(`${path} delete cannot carry attributes.`)
        if (!isPositiveInteger(raw['delete'])) this.fail(`${path} has an invalid delete length.`)
        return
      }
      if (operation === 'retain') {
        if (!isPositiveInteger(raw['retain'])) this.fail(`${path} has an invalid retain length.`)
        this.validateTextFormattingAttributes(attributes, `${path} attributes`)
        return
      }

      if (typeof raw['insert'] === 'string') {
        this.validateTextFormattingAttributes(attributes, `${path} attributes`)
        return
      }
      this.validateInlineInsert(raw, path)
    })
  }

  private validateInlineInsert(
    delta: Record<string, unknown>,
    path: string,
  ): void {
    const deltaKeys = Object.keys(delta)
    if (
      !deltaKeys.includes('insert') ||
      deltaKeys.some(key => key !== 'insert' && key !== 'attributes')
    ) {
      this.fail(`${path} must contain only insert and optional attributes.`)
    }
    const insert = delta['insert']
    if (typeof insert === 'string') {
      this.validateTextFormattingAttributes(delta['attributes'], `${path} attributes`)
      return
    }
    if (!isPrimitiveRecord(insert)) {
      this.fail(`${path} Embed insert must be a single-key primitive object.`)
    }
    const embedKeys = Object.keys(insert)
    if (embedKeys.length !== 1 || !embedKeys[0].trim()) {
      this.fail(`${path} Embed insert must contain exactly one non-empty key.`)
    }
    const embedKey = embedKeys[0]
    const attributes = delta['attributes']
    if (attributes !== undefined && !isPrimitiveRecord(attributes)) {
      this.fail(`${path} Embed attributes must contain primitive values.`)
    }

    if (embedKey === 'break') {
      if (insert[embedKey] !== '\n') {
        this.fail(`${path} contains an invalid line break.`)
      }
      this.validateTextFormattingAttributes(attributes, `${path} attributes`)
      return
    }

    if (!this.manifestOptions.registeredInlineEmbedKeys?.includes(embedKey)) {
      this.fail(`Inline Embed converter ${embedKey} is not registered.`)
    }
    const capability = this.extensions.getInlineEmbedCapability(
      embedKey,
      this.manifestOptions,
    )
    if (!capability?.insert) {
      this.fail(`Inline Embed ${embedKey} does not declare Agent insertion.`)
    }
    const valueErrors = validateDocumentAgentJsonSchema(
      capability.insert.value,
      insert[embedKey],
      `${path}.insert.${embedKey}`,
    )
    if (valueErrors.length) this.fail(valueErrors.join(' '))

    const attributeValue = attributes ?? {}
    if (!capability.insert.attributes) {
      if (Object.keys(attributeValue as Record<string, unknown>).length) {
        this.fail(`Inline Embed ${embedKey} does not allow Agent-written attributes.`)
      }
      return
    }
    const attributeErrors = validateDocumentAgentJsonSchema(
      capability.insert.attributes,
      attributeValue,
      `${path}.attributes`,
    )
    if (attributeErrors.length) this.fail(attributeErrors.join(' '))
  }

  private validateTextFormattingAttributes(
    value: unknown,
    path: string,
  ): void {
    if (value === undefined) return
    if (!isPrimitiveRecord(value)) {
      this.fail(`${path} must contain primitive values.`)
    }
    for (const [key, attributeValue] of Object.entries(value)) {
      const schema = AGENT_TEXT_ATTRIBUTE_SCHEMAS[key]
      if (!schema) {
        this.fail(`${path}.${key} is not an Agent-writable text format.`)
      }
      const errors = validateDocumentAgentJsonSchema(
        schema,
        attributeValue,
        `${path}.${key}`,
      )
      if (errors.length) this.fail(errors.join(' '))
    }
  }

  private captureDocument(): void {
    const visit = (blockId: string, parentId: string | null): void => {
      if (this.blocks.has(blockId) || !this.doc.model.exists(blockId)) return
      const nodeType = this.doc.model.getNodeType(blockId)
      const flavour = this.doc.model.getFlavour(blockId)
      if (!nodeType || !flavour) return
      const yMeta = this.doc.model.getYBlock(blockId)?.get('meta') as {toJSON?: () => unknown} | undefined
      const metaValue = yMeta?.toJSON?.()
      const children = [...this.doc.model.getChildrenIds(blockId)]
      this.blocks.set(blockId, {
        id: blockId,
        flavour: String(flavour),
        nodeType,
        parentId,
        children,
        props: {...(this.doc.model.getProps(blockId) ?? {})},
        meta: isRecord(metaValue) ? {...metaValue} : {},
        textLength: nodeType === BlockNodeType.editable
          ? this.doc.model.getTextLength(blockId)
          : null,
        created: false,
      })
      children.forEach(childId => visit(childId, blockId))
    }
    visit(this.doc.rootId, null)
  }

  private resolveExistingContextRef(reference: string): string {
    const blockId = this.resolveStructuralRef(reference)
    const block = this.requireBlock(blockId)
    if (block.created) {
      this.fail(`New block reference ${reference} can only be used by structural operations; include text and props in create params.`)
    }
    this.assertContextOrCreated(block)
    return blockId
  }

  private resolveStructuralRef(reference: string): string {
    if (!reference.startsWith(DOCUMENT_AGENT_CLIENT_REF_PREFIX)) return reference
    const clientRef = reference.slice(DOCUMENT_AGENT_CLIENT_REF_PREFIX.length)
    const blockId = this.clientRefs.get(clientRef)
    if (!blockId) this.fail(`Unknown or forward clientRef: ${clientRef}.`)
    return blockId
  }

  private bindClientRef(clientRef: string | undefined, blockId: string): void {
    if (!clientRef) return
    if (this.clientRefs.has(clientRef)) this.fail(`Duplicate clientRef: ${clientRef}.`)
    this.clientRefs.set(clientRef, blockId)
  }

  private assertContextOrCreated(block: ShadowBlock): void {
    if (block.created || this.contextIds.has(block.id)) return
    this.fail(`Block ${block.id} is outside the Agent request context.`)
  }

  private assertTextWritable(block: ShadowBlock, operation: BlockReadonlyOperation): void {
    this.assertPermission(() => this.doc.readonlyManager.assertTextWritable(block.id, operation))
  }

  private assertPropsWritable(block: ShadowBlock): void {
    this.assertPermission(() => this.doc.readonlyManager.assertPropsWritable(
      block.id,
      BlockReadonlyOperation.Props,
    ))
  }

  private assertInsertable(parent: ShadowBlock, operation: BlockReadonlyOperation): void {
    if (parent.created) return
    this.assertPermission(() => this.doc.readonlyManager.assertInsertable(parent.id, operation))
  }

  private assertReplaceable(block: ShadowBlock, parent: ShadowBlock): void {
    this.assertRemovable([block], BlockReadonlyOperation.Replace)
    this.assertInsertable(parent, BlockReadonlyOperation.Replace)
  }

  private assertRemovable(
    blocks: readonly ShadowBlock[],
    operation: BlockReadonlyOperation,
  ): void {
    this.assertPermission(() => this.doc.readonlyManager.assertRemovable(
      blocks.map(block => block.id),
      operation,
    ))
  }

  private assertMovable(blocks: readonly ShadowBlock[], target: ShadowBlock): void {
    if (target.created) {
      this.assertRemovable(blocks, BlockReadonlyOperation.Move)
      return
    }
    this.assertPermission(() => this.doc.readonlyManager.assertMovable(
      blocks.map(block => block.id),
      target.id,
      BlockReadonlyOperation.Move,
    ))
  }

  private assertPermission(assertion: () => void): void {
    try {
      assertion()
    } catch (error) {
      this.fail(error instanceof Error ? error.message : 'The operation is readonly.')
    }
  }

  private insertIntoCreatedSnapshot(
    parent: ShadowBlock,
    index: number,
    snapshot: IBlockSnapshot,
  ): void {
    if (!parent.snapshot || (
      parent.nodeType !== BlockNodeType.block &&
      parent.nodeType !== BlockNodeType.root
    )) {
      this.fail(`Created block ${parent.id} cannot contain block children.`)
    }
    ;(parent.snapshot.children as IBlockSnapshot[]).splice(index, 0, snapshot)
  }

  private assertChildAllowed(parent: ShadowBlock, childFlavour: string): void {
    if (!this.doc.schemas.isValidChildrenForInstance(
      childFlavour as BlockCraft.BlockFlavour,
      parent.flavour as BlockCraft.BlockFlavour,
      parent.meta,
    )) {
      this.fail(`Schema ${childFlavour} is not allowed in ${parent.id}.`)
    }
  }

  private requireBlock(blockId: string): ShadowBlock {
    const block = this.blocks.get(blockId)
    if (!block) this.fail(`Block ${blockId} does not exist in the sequential plan.`)
    return block
  }

  private removeSubtree(blockId: string): void {
    const block = this.blocks.get(blockId)
    if (!block) return
    block.children.forEach(childId => this.removeSubtree(childId))
    this.blocks.delete(blockId)
  }

  private isDescendant(blockId: string, ancestorId: string): boolean {
    let current = this.blocks.get(blockId)?.parentId ?? null
    while (current) {
      if (current === ancestorId) return true
      current = this.blocks.get(current)?.parentId ?? null
    }
    return false
  }

  private fail(message: string): never {
    throw new DocumentAgentOperationCompileError(message)
  }
}

function applyPropsPatch(
  current: Record<string, unknown>,
  patch: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const next = {...current}
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete next[key]
    else next[key] = value
  }
  return next
}

function applyDeltaLength(
  currentLength: number,
  delta: readonly unknown[],
  fail: (message: string) => never,
): number {
  let sourceCursor = 0
  let nextLength = currentLength
  for (const raw of delta) {
    if (!isRecord(raw)) return fail('Text Delta contains an invalid operation.')
    if (typeof raw['retain'] === 'number') {
      sourceCursor += raw['retain']
      if (sourceCursor > currentLength) {
        return fail('Text Delta retains beyond the current text length.')
      }
      continue
    }
    if (typeof raw['delete'] === 'number') {
      sourceCursor += raw['delete']
      if (sourceCursor > currentLength) {
        return fail('Text Delta deletes beyond the current text length.')
      }
      nextLength -= raw['delete']
      continue
    }
    if ('insert' in raw) {
      nextLength += typeof raw['insert'] === 'string' ? raw['insert'].length : 1
      continue
    }
    return fail('Text Delta contains an unsupported operation.')
  }
  return nextLength
}

function deltaLength(delta: readonly unknown[]): number {
  return delta.reduce<number>((length, raw) => {
    if (!isRecord(raw) || !('insert' in raw)) return length
    return length + (typeof raw['insert'] === 'string' ? raw['insert'].length : 1)
  }, 0)
}

function isDeltaInsertLike(value: unknown): boolean {
  return isRecord(value) && 'insert' in value
}

function isSnapshotLike(value: unknown): value is IBlockSnapshot {
  return isRecord(value) &&
    typeof value['id'] === 'string' &&
    typeof value['flavour'] === 'string' &&
    typeof value['nodeType'] === 'string' &&
    Array.isArray(value['children'])
}

function isRecord(value: unknown): value is Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function isPrimitiveRecord(value: unknown): value is Record<string, string | number | boolean | null> {
  if (!isRecord(value)) return false
  return Object.values(value).every(item =>
    item === null ||
    typeof item === 'string' ||
    typeof item === 'boolean' ||
    (typeof item === 'number' && Number.isFinite(item)),
  )
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) > 0
}
