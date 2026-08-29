import {
  BlockNodeType,
  type BlockCraftDoc,
  type DeltaInsert,
  type IBlockSnapshot,
} from '@ccc/blockcraft'
import type {PreparedDocumentAgentOperation} from './document-agent-operation-compiler'

export interface DocumentAgentCandidateOperationTarget {
  operationIndex: number
  blockIds: readonly string[]
}

export interface DocumentAgentCandidateProjection {
  snapshot: IBlockSnapshot
  affectedBlockIds: readonly string[]
  operationTargets: readonly DocumentAgentCandidateOperationTarget[]
}

export class DocumentAgentCandidateProjectionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DocumentAgentCandidateProjectionError'
  }
}

type IndexedSnapshot = {
  snapshot: IBlockSnapshot
  parent: IBlockSnapshot | null
}

/**
 * Applies already-compiled Agent operations to an isolated Snapshot tree.
 * It never writes Yjs, revisions, selection, DOM, or Undo history.
 */
export function projectDocumentAgentCandidate(
  doc: BlockCraftDoc,
  operations: readonly PreparedDocumentAgentOperation[],
): DocumentAgentCandidateProjection {
  const baseline = doc.model.toSnapshot(doc.rootId)
  if (!baseline) {
    throw new DocumentAgentCandidateProjectionError('Unable to capture the current document Snapshot.')
  }

  const root = cloneSnapshot(baseline)
  const index = new Map<string, IndexedSnapshot>()
  indexSnapshotTree(root, null, index)
  const affected = new Set<string>()
  const operationTargets: DocumentAgentCandidateOperationTarget[] = []

  operations.forEach((operation, operationIndex) => {
    const targets: string[] = []
    const addTarget = (blockId: string | null | undefined): void => {
      if (!blockId || targets.includes(blockId)) return
      targets.push(blockId)
      affected.add(blockId)
    }

    if (operation.kind === 'replace-text') {
      const node = requireIndexedSnapshot(index, operation.blockId).snapshot
      replaceSnapshotText(node, operation.from, operation.to, operation.replacement)
      addTarget(operation.blockId)
    } else if (operation.kind === 'apply-text-delta') {
      const node = requireIndexedSnapshot(index, operation.blockId).snapshot
      applySnapshotTextDelta(node, operation.delta)
      addTarget(operation.blockId)
    } else if (operation.kind === 'update-block-props') {
      const node = requireIndexedSnapshot(index, operation.blockId).snapshot
      node.props = applyPropsPatch(node.props, operation.props) as IBlockSnapshot['props']
      addTarget(operation.blockId)
    } else if (operation.kind === 'create-blocks') {
      if (!operation.embedded) {
        const parent = requireContainer(index, operation.parentId)
        const inserted = cloneSnapshot(operation.snapshot)
        parent.children.splice(operation.index, 0, inserted)
        indexSnapshotTree(inserted, parent, index)
      }
      addTarget(operation.snapshot.id)
    } else if (operation.kind === 'replace-block') {
      const current = requireIndexedSnapshot(index, operation.blockId)
      if (!current.parent) {
        throw new DocumentAgentCandidateProjectionError(
          `Candidate block ${operation.blockId} cannot replace the root.`,
        )
      }
      const siblings = requireBlockChildren(current.parent)
      const childIndex = siblings.findIndex(child => child.id === operation.blockId)
      if (childIndex < 0) {
        throw new DocumentAgentCandidateProjectionError(
          `Candidate block ${operation.blockId} is detached from its parent.`,
        )
      }
      unregisterSnapshotTree(current.snapshot, index)
      const replacement = cloneSnapshot(operation.snapshot)
      siblings.splice(childIndex, 1, replacement)
      indexSnapshotTree(replacement, current.parent, index)
      addTarget(replacement.id)
    } else if (operation.kind === 'delete-blocks') {
      const parent = requireContainer(index, operation.parentId)
      const removed = parent.children.splice(operation.index, operation.count)
      removed.forEach(snapshot => unregisterSnapshotTree(snapshot, index))
      addStructuralNeighbours(parent, operation.index, addTarget)
      if (!targets.length) addTarget(parent.id)
    } else if (operation.kind === 'move-blocks') {
      const parent = requireContainer(index, operation.parentId)
      const target = requireContainer(index, operation.targetId)
      const moved = parent.children.splice(operation.index, operation.count)
      target.children.splice(operation.targetIndex, 0, ...moved)
      moved.forEach(snapshot => {
        const entry = requireIndexedSnapshot(index, snapshot.id)
        entry.parent = target
        addTarget(snapshot.id)
      })
      addStructuralNeighbours(parent, operation.index, addTarget)
      addStructuralNeighbours(target, operation.targetIndex + moved.length, addTarget)
    }

    operationTargets.push({operationIndex, blockIds: targets})
  })

  return {
    snapshot: root,
    affectedBlockIds: [...affected],
    operationTargets,
  }
}

function replaceSnapshotText(
  snapshot: IBlockSnapshot,
  from: number,
  to: number,
  replacement: string,
): void {
  applySnapshotTextDelta(snapshot, [
    ...(from > 0 ? [{retain: from}] : []),
    ...(to > from ? [{delete: to - from}] : []),
    ...(replacement ? [{insert: replacement}] : []),
  ])
}

function applySnapshotTextDelta(
  snapshot: IBlockSnapshot,
  operations: readonly unknown[],
): void {
  if (snapshot.nodeType !== BlockNodeType.editable) {
    throw new DocumentAgentCandidateProjectionError(`Candidate block ${snapshot.id} is not editable.`)
  }

  const source = (snapshot.children as DeltaInsert[]).map(cloneDeltaInsert)
  const output: DeltaInsert[] = []
  let runIndex = 0
  let runOffset = 0

  const append = (insert: DeltaInsert): void => appendDeltaInsert(output, insert)
  const consume = (
    length: number,
    attributes?: Readonly<Record<string, unknown>>,
    emit = true,
  ): void => {
    let remaining = length
    while (remaining > 0 && runIndex < source.length) {
      const run = source[runIndex]
      const runLength = typeof run.insert === 'string' ? run.insert.length : 1
      const available = runLength - runOffset
      const take = Math.min(remaining, available)
      if (emit) {
        const insert = typeof run.insert === 'string'
          ? run.insert.slice(runOffset, runOffset + take)
          : cloneUnknown(run.insert)
        append({
          insert,
          ...withAttributes(attributes === undefined
            ? cloneAttributes(run.attributes)
            : patchAttributes(run.attributes, attributes)),
        } as DeltaInsert)
      }
      runOffset += take
      remaining -= take
      if (runOffset === runLength) {
        runIndex++
        runOffset = 0
      }
    }
    if (remaining > 0) {
      throw new DocumentAgentCandidateProjectionError(
        `Candidate text operation exceeds block ${snapshot.id}.`,
      )
    }
  }

  for (const raw of operations) {
    if (!isRecord(raw)) {
      throw new DocumentAgentCandidateProjectionError('Candidate text Delta is invalid.')
    }
    if (typeof raw['retain'] === 'number') {
      consume(raw['retain'], isRecord(raw['attributes']) ? raw['attributes'] : undefined)
      continue
    }
    if (typeof raw['delete'] === 'number') {
      consume(raw['delete'], undefined, false)
      continue
    }
    if ('insert' in raw) {
      const insert = raw['insert']
      if (typeof insert === 'string' && !insert) continue
      append({
        insert: cloneUnknown(insert),
        ...withAttributes(isRecord(raw['attributes']) ? raw['attributes'] : undefined),
      } as DeltaInsert)
      continue
    }
    throw new DocumentAgentCandidateProjectionError('Candidate text Delta is unsupported.')
  }

  while (runIndex < source.length) {
    const run = source[runIndex]
    const runLength = typeof run.insert === 'string' ? run.insert.length : 1
    consume(runLength - runOffset)
  }
  snapshot.children = output
}

function indexSnapshotTree(
  snapshot: IBlockSnapshot,
  parent: IBlockSnapshot | null,
  index: Map<string, IndexedSnapshot>,
): void {
  if (index.has(snapshot.id)) {
    throw new DocumentAgentCandidateProjectionError(`Duplicate candidate block ID ${snapshot.id}.`)
  }
  index.set(snapshot.id, {snapshot, parent})
  if (isContainer(snapshot)) {
    snapshot.children.forEach(child => indexSnapshotTree(child, snapshot, index))
  }
}

function unregisterSnapshotTree(
  snapshot: IBlockSnapshot,
  index: Map<string, IndexedSnapshot>,
): void {
  if (isContainer(snapshot)) {
    snapshot.children.forEach(child => unregisterSnapshotTree(child, index))
  }
  index.delete(snapshot.id)
}

function requireIndexedSnapshot(
  index: ReadonlyMap<string, IndexedSnapshot>,
  blockId: string,
): IndexedSnapshot {
  const entry = index.get(blockId)
  if (!entry) {
    throw new DocumentAgentCandidateProjectionError(`Candidate block ${blockId} does not exist.`)
  }
  return entry
}

function requireContainer(
  index: ReadonlyMap<string, IndexedSnapshot>,
  blockId: string,
): Extract<IBlockSnapshot, {nodeType: BlockNodeType.block | BlockNodeType.root}> {
  const snapshot = requireIndexedSnapshot(index, blockId).snapshot
  if (!isContainer(snapshot)) {
    throw new DocumentAgentCandidateProjectionError(`Candidate block ${blockId} is not a container.`)
  }
  return snapshot
}

function requireBlockChildren(snapshot: IBlockSnapshot): IBlockSnapshot[] {
  if (!isContainer(snapshot)) {
    throw new DocumentAgentCandidateProjectionError(`Candidate block ${snapshot.id} has no block children.`)
  }
  return snapshot.children
}

function addStructuralNeighbours(
  parent: Extract<IBlockSnapshot, {nodeType: BlockNodeType.block | BlockNodeType.root}>,
  index: number,
  add: (blockId: string) => void,
): void {
  const before = parent.children[index - 1]
  const after = parent.children[index]
  if (before) add(before.id)
  if (after) add(after.id)
}

function cloneSnapshot(snapshot: IBlockSnapshot): IBlockSnapshot {
  return cloneUnknown(snapshot) as IBlockSnapshot
}

function cloneDeltaInsert(insert: DeltaInsert): DeltaInsert {
  return cloneUnknown(insert) as DeltaInsert
}

function cloneUnknown<T>(value: T): T {
  if (Array.isArray(value)) return value.map(item => cloneUnknown(item)) as T
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, cloneUnknown(item)]),
    ) as T
  }
  return value
}

function applyPropsPatch(
  current: Readonly<Record<string, unknown>>,
  patch: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const next = cloneUnknown(current) as Record<string, unknown>
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete next[key]
    else next[key] = cloneUnknown(value)
  }
  return next
}

function patchAttributes(
  current: DeltaInsert['attributes'],
  patch: Readonly<Record<string, unknown>>,
): Record<string, unknown> | undefined {
  const next = cloneAttributes(current) ?? {}
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete next[key]
    else next[key] = cloneUnknown(value)
  }
  return Object.keys(next).length ? next : undefined
}

function cloneAttributes(
  attributes: DeltaInsert['attributes'] | Readonly<Record<string, unknown>> | undefined,
): Record<string, unknown> | undefined {
  if (!attributes || !Object.keys(attributes).length) return undefined
  return cloneUnknown(attributes) as Record<string, unknown>
}

function withAttributes(
  attributes: DeltaInsert['attributes'] | Readonly<Record<string, unknown>> | undefined,
): {attributes?: DeltaInsert['attributes']} {
  const cloned = cloneAttributes(attributes)
  return cloned ? {attributes: cloned as DeltaInsert['attributes']} : {}
}

function appendDeltaInsert(output: DeltaInsert[], insert: DeltaInsert): void {
  if (typeof insert.insert === 'string' && !insert.insert) return
  const previous = output[output.length - 1]
  if (
    previous &&
    typeof previous.insert === 'string' &&
    typeof insert.insert === 'string' &&
    equalAttributes(previous.attributes, insert.attributes)
  ) {
    previous.insert += insert.insert
    return
  }
  output.push(insert)
}

function equalAttributes(
  left: DeltaInsert['attributes'],
  right: DeltaInsert['attributes'],
): boolean {
  const leftKeys = Object.keys(left ?? {})
  const rightKeys = Object.keys(right ?? {})
  return leftKeys.length === rightKeys.length &&
    leftKeys.every(key => left?.[key] === right?.[key])
}

function isContainer(
  snapshot: IBlockSnapshot,
): snapshot is Extract<IBlockSnapshot, {nodeType: BlockNodeType.block | BlockNodeType.root}> {
  return snapshot.nodeType === BlockNodeType.block || snapshot.nodeType === BlockNodeType.root
}

function isRecord(value: unknown): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
