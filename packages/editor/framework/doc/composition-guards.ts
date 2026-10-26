import * as Y from 'yjs'
import type {IBlockSnapshot, YBlock} from '../block-std'
import type {BlockCraftDoc} from './document'
import type {BlockMutationContext} from './block-mutation-policy'
import type {DocumentCompositionSession} from './composition'
import {DocumentCompositionError} from './composition/types'

/** Rejected before a composed editor mutates content across storage domains. */
export class DocumentCompositionMutationError extends DocumentCompositionError {
  constructor(message = '不能跨独立内容区域修改文档') {
    super(message)
    this.name = 'DocumentCompositionMutationError'
  }
}

export interface CompositionWriteFootprint {
  textBlockIds: readonly string[]
  removableRootIds: readonly string[]
  insertParentIds: readonly string[]
}

export type CompositionScope = string | null

const attachedDocuments = new WeakMap<DocumentCompositionSession, BlockCraftDoc>()
const attachmentCleanup = new WeakMap<BlockCraftDoc, () => void>()

/** Failed projections must not accept edits that can no longer be persisted. */
export function assertCompositionActive(doc: Pick<BlockCraftDoc, 'config'>): void {
  const session = doc.config?.contentComposition
  if (session && (session.failed || session.disposed || session.editorDoc.isDestroyed)) {
    throw new DocumentCompositionMutationError('组合文档会话已失效，请重新打开文档')
  }
}

/** The host owns the session; attaching a view never takes ownership of its lifetime. */
export function attachCompositionDocument(doc: BlockCraftDoc): void {
  const session = doc.config.contentComposition
  if (!session) return
  assertCompositionActive(doc)
  if (doc.config.yDoc !== session.editorDoc) {
    throw new DocumentCompositionMutationError('组合文档必须使用有效会话的 editorDoc')
  }
  if (attachedDocuments.has(session)) {
    throw new DocumentCompositionMutationError('同一组合会话不能同时挂载多个编辑器')
  }
  if (doc.config.revision?.mode && doc.config.revision.mode !== 'off') {
    assertCompositionRevisionSupport(doc)
  }
  attachedDocuments.set(session, doc)
  const freeze = () => doc.toggleReadonly(true)
  const failureSubscription = session.errors$.subscribe(freeze)
  session.editorDoc.on('destroy', freeze)
  attachmentCleanup.set(doc, () => {
    failureSubscription.unsubscribe()
    session.editorDoc.off('destroy', freeze)
  })
}

export function detachCompositionDocument(doc: BlockCraftDoc): void {
  const session = doc.config.contentComposition
  if (session && attachedDocuments.get(session) === doc) {
    attachedDocuments.delete(session)
    attachmentCleanup.get(doc)?.()
    attachmentCleanup.delete(doc)
  }
}

export function assertCompositionRoot(doc: BlockCraftDoc, root: YBlock): void {
  const session = doc.config.contentComposition
  if (!session) return
  assertCompositionActive(doc)
  if (root.doc !== session.editorDoc || root.get('id') !== session.rootId ||
    session.editorDoc.getMap('blocks').get(session.rootId) !== root) {
    throw new DocumentCompositionMutationError('组合文档只能挂载会话的根块')
  }
}

export function assertCompositionRevisionSupport(doc: Pick<BlockCraftDoc, 'config'>): void {
  if (doc.config?.contentComposition) {
    throw new DocumentCompositionMutationError('组合文档暂不支持修订与审阅，请使用普通文档')
  }
}

/**
 * Cached ownership covers normal edits and deleted ids. New containers can be
 * created earlier in an outer transaction, before the session/model observers
 * run; only that cold path builds one live parent index for this guard call.
 */
function createScopeReader(doc: BlockCraftDoc) {
  const session = doc.config.contentComposition!
  let parents: Map<string, string> | undefined
  const readParent = (id: string): string | undefined => {
    if (id === session.rootId) return undefined
    const indexed = doc.model?.getParentId(id)
    if (indexed) {
      const children = doc.yBlockMap.get(indexed)?.get('children')
      if (children instanceof Y.Array && children.toArray().includes(id)) return indexed
    }
    if (!parents) {
      parents = new Map()
      doc.yBlockMap.forEach((block, parentId) => {
        const children = block.get('children')
        if (children instanceof Y.Array) {
          children.toArray().forEach(childId => parents!.set(childId, parentId))
        }
      })
    }
    return parents.get(id)
  }
  const read = (id: string, children = false): CompositionScope | undefined => {
    const known = children ? session.getChildrenScope(id) : session.getBlockScope(id)
    if (known !== undefined) return known
    if (!doc.yBlockMap.has(id)) return undefined
    const visited = new Set<string>([id])
    let parent = readParent(id)
    while (parent && !visited.has(parent)) {
      visited.add(parent)
      const scope = session.getChildrenScope(parent)
      if (scope !== undefined) return scope
      parent = readParent(parent)
    }
    return undefined
  }
  return {read, readParent}
}

function requireScope(scope: CompositionScope | undefined): CompositionScope {
  if (scope === undefined) throw new DocumentCompositionMutationError('无法确定内容所属区域，请重新打开文档')
  return scope
}

function assertSingleScope(scopes: ReadonlySet<CompositionScope>): void {
  if (scopes.size > 1) throw new DocumentCompositionMutationError()
}

function assertNoRegionShells(doc: BlockCraftDoc, blockIds: readonly string[]): void {
  if (!blockIds.length) return
  const targets = new Set(blockIds)
  const {readParent} = createScopeReader(doc)
  for (const region of doc.config.contentComposition!.regions) {
    if (!doc.yBlockMap.has(region.blockId)) continue
    const seen = new Set<string>()
    let current: string | undefined = region.blockId
    while (current && !seen.has(current)) {
      if (targets.has(current)) {
        throw new DocumentCompositionMutationError('独立内容区域及其外层容器不能删除、替换或移动')
      }
      seen.add(current)
      current = readParent(current)
    }
  }
}

/** Shared by CRUD and host-authorized whole-document structure transforms. */
export function assertCompositionMutation(doc: BlockCraftDoc, context: BlockMutationContext): void {
  if (!doc.config?.contentComposition) return
  assertCompositionActive(doc)
  if (context.operation !== 'delete' && context.operation !== 'replace' && context.operation !== 'move') return
  assertNoRegionShells(doc, context.blockIds)
  const {read} = createScopeReader(doc)
  const scopes = new Set<CompositionScope>()
  context.blockIds.forEach(id => scopes.add(requireScope(read(id))))
  if (context.parentId) scopes.add(requireScope(read(context.parentId, true)))
  if (context.targetId) scopes.add(requireScope(read(context.targetId, true)))
  assertSingleScope(scopes)
}

export function assertCompositionInsertion(
  doc: BlockCraftDoc,
  parentId: string,
  snapshots: readonly IBlockSnapshot[],
): void {
  const session = doc.config?.contentComposition
  if (!session) return
  assertCompositionActive(doc)
  const scope = requireScope(createScopeReader(doc).read(parentId, true))
  const visit = (snapshot: IBlockSnapshot) => {
    if (session.isRegionContainer(snapshot.id)) {
      throw new DocumentCompositionMutationError('不能插入或替换已绑定的独立内容区域')
    }
    const previous = session.getBlockScope(snapshot.id)
    if (previous !== undefined && previous !== scope) throw new DocumentCompositionMutationError()
    if (snapshot.nodeType === 'block' || snapshot.nodeType === 'root') {
      (snapshot.children as IBlockSnapshot[]).forEach(visit)
    }
  }
  snapshots.forEach(visit)
}

/** Preflight the entire plan before range editing opens its first transaction. */
export function assertCompositionWriteFootprint(doc: BlockCraftDoc, footprint: CompositionWriteFootprint): void {
  if (!doc.config?.contentComposition) return
  assertCompositionActive(doc)
  assertNoRegionShells(doc, footprint.removableRootIds)
  const {read} = createScopeReader(doc)
  const scopes = new Set<CompositionScope>()
  footprint.textBlockIds.forEach(id => scopes.add(requireScope(read(id))))
  footprint.removableRootIds.forEach(id => scopes.add(requireScope(read(id))))
  footprint.insertParentIds.forEach(id => scopes.add(requireScope(read(id, true))))
  assertSingleScope(scopes)
}

/** Captured before observers, while deleted Y types still retain their parent identity. */
export function compositionTransactionScopes(doc: BlockCraftDoc, transaction: Y.Transaction): Set<CompositionScope> {
  const scopes = new Set<CompositionScope>()
  if (!doc.config?.contentComposition) return scopes
  const {read} = createScopeReader(doc)
  for (const [type, keys] of transaction.changed) {
    if ((type as unknown) === doc.yBlockMap) {
      for (const id of keys) if (typeof id === 'string') scopes.add(requireScope(read(id)))
      continue
    }
    let current: Y.AbstractType<any> | null = type
    while (current && current.parent !== doc.yBlockMap) current = current.parent
    if (!current) continue // Revision/control maps are not block content.
    const id = (current as unknown as {_item?: {parentSub?: unknown}})._item?.parentSub
    if (typeof id !== 'string') continue
    const isChildren = (current as Y.Map<unknown>).get('children') === type && type instanceof Y.Array
    scopes.add(requireScope(read(id, isChildren)))
  }
  return scopes
}
