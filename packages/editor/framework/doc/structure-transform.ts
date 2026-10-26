import * as Y from 'yjs'
import {BlockNodeType, IBlockSnapshot, YBlock} from '../block-std'
import {writeSnapshotsToYBlockMap} from './snapshot-yblock'
import {BlockMutationPolicyError} from './block-mutation-policy'

export interface DocumentStructureTransformContext {
  purpose: string
  operation: 'replace' | 'undo' | 'redo'
}

/** Existing child subtrees keep their Y types, ids and relative-position anchors. */
export interface DocumentRetainedChildren {
  sourceId: string
  targetId: string
}

export interface DocumentStructurePlan {
  purpose: string
  children: IBlockSnapshot[]
  retainedChildren: readonly DocumentRetainedChildren[]
  rootProps?: Readonly<Record<string, unknown>>
  rootMeta?: Readonly<Record<string, unknown>>
  /** Only metadata on retained descendants; lock metadata cannot be patched. */
  retainedMetaPatches?: Readonly<Record<string, Readonly<Record<string, unknown>>>>
}

/** Re-evaluated for execution and every history replay; never grants ordinary edits. */
export function assertDocumentStructureTransformAllowed(
  doc: BlockCraft.Doc,
  purpose: string,
  operation: DocumentStructureTransformContext['operation'] = 'replace',
): void {
  const context = {operation, blockIds: [doc.rootId], structureTransform: purpose}
  const reject = (message: string): never => { throw new BlockMutationPolicyError(context, message) }
  if (!doc.isInitialized || doc.isReadonly) reject('当前文档不可编辑')
  if (doc.event?.status.isComposing || doc.inputManger?.compositionSession.isActive) reject('请完成当前输入后再切换模板')
  if (doc.revisions?.isTracking || doc.revisions?.viewMode === 'final' || doc.revisions?.state$.value.revisions.length) {
    reject('请结束修订并处理已有修订后再切换模板')
  }
  if (doc.config.authorizeStructureTransform?.({purpose, operation}) !== true) reject('当前用户无权切换文档结构')
  // Template locks are the only exception. User locks remain effective even
  // inside retained content, including locks added after the original action.
  const pending = [doc.rootId]
  const seen = new Set<string>()
  while (pending.length) {
    const id = pending.pop()!
    if (seen.has(id)) reject('文档结构存在重复引用')
    seen.add(id)
    const block = doc.model.getYBlock(id)
    if (!block) reject('文档结构不完整')
    const meta = block!.get('meta')
    if (meta.get('lock') && meta.get('lockKind') !== 'template') reject('请先解除用户锁定的内容')
    pending.push(...doc.model.getChildrenIds(id))
  }
  doc.mutationPolicy.assert(context)
}

/**
 * Prepare all potentially failing serialization in a detached CRDT, then apply
 * one verified update. Yjs transactions themselves do NOT provide rollback.
 */
export function applyDocumentStructurePlan(doc: BlockCraft.Doc, plan: DocumentStructurePlan): void {
  assertDocumentStructureTransformAllowed(doc, plan.purpose)
  if (!plan.children.length) throw new Error('目标文档不能为空')
  const retained = new Set<string>()
  const sources = new Set<string>()
  const targets = new Map<string, string[]>()
  const current = doc.exportSnapshot()
  if (!current) throw new Error('文档尚未加载')
  const oldNodes = new Map<string, IBlockSnapshot>()
  const indexOld = (block: IBlockSnapshot) => {
    oldNodes.set(block.id, block)
    if (block.nodeType !== BlockNodeType.editable) block.children.forEach(indexOld)
  }
  indexOld(current)
  for (const mapping of plan.retainedChildren) {
    const source = oldNodes.get(mapping.sourceId)
    if (!source || source.nodeType !== BlockNodeType.block || sources.has(source.id) || targets.has(mapping.targetId)) {
      throw new Error('保留区域映射无效')
    }
    sources.add(source.id)
    const keep = (block: IBlockSnapshot) => {
      if (retained.has(block.id)) throw new Error('保留区域不能嵌套或重复')
      retained.add(block.id)
      if (block.nodeType !== BlockNodeType.editable) block.children.forEach(keep)
    }
    source.children.forEach(keep)
    targets.set(mapping.targetId, source.children.map(child => child.id))
  }
  if ([...sources].some(id => retained.has(id))) throw new Error('保留区域不能嵌套')
  const newNodes = new Map<string, IBlockSnapshot>()
  const validate = (block: IBlockSnapshot, parent: IBlockSnapshot, isRetained = false) => {
    const schema = doc.schemas.get(block.flavour, false)
    if (!schema || schema.nodeType !== block.nodeType || !doc.schemas.isValidChildrenForInstance(block.flavour, parent.flavour, parent.meta)) {
      throw new Error(`目标区域不支持内容类型：${block.flavour}`)
    }
    if (!isRetained) {
      if (!block.id || newNodes.has(block.id) || doc.yBlockMap.has(block.id)) throw new Error('目标块 ID 重复')
      newNodes.set(block.id, block)
    }
    const mapped = targets.get(block.id)
    if (mapped && (block.nodeType !== BlockNodeType.block || block.children.length)) throw new Error('承接区域必须为空容器')
    if (block.nodeType !== BlockNodeType.editable) {
      if (mapped) mapped.forEach(id => validate(oldNodes.get(id)!, block, true))
      else block.children.forEach(child => validate(child, block, isRetained))
    }
  }
  plan.children.forEach(block => validate(block, current))
  if ([...targets.keys()].some(id => !newNodes.has(id))) throw new Error('承接区域不存在')
  for (const [id, patch] of Object.entries(plan.retainedMetaPatches ?? {})) {
    if (!retained.has(id) || 'lock' in patch || 'lockKind' in patch) throw new Error('保留内容元数据补丁无效')
  }
  if ('lock' in (plan.rootMeta ?? {}) || 'lockKind' in (plan.rootMeta ?? {})) throw new Error('不能修改根锁定信息')

  const staging = new Y.Doc({gc: false})
  let update: Uint8Array
  try {
    Y.applyUpdate(staging, Y.encodeStateAsUpdate(doc.yDoc))
    const vector = Y.encodeStateVector(staging)
    const blocks = staging.getMap<YBlock>('blocks')
    staging.transact(() => {
      writeSnapshotsToYBlockMap(blocks, plan.children)
      for (const [targetId, ids] of targets) {
        const children = blocks.get(targetId)!.get('children') as Y.Array<string>
        children.insert(0, ids)
      }
      const root = blocks.get(doc.rootId)!
      const children = root.get('children') as Y.Array<string>
      children.delete(0, children.length)
      children.insert(0, plan.children.map(block => block.id))
      for (const id of oldNodes.keys()) if (id !== doc.rootId && !retained.has(id)) blocks.delete(id)
      const patchMap = (map: Y.Map<unknown>, patch: Readonly<Record<string, unknown>>) => {
        for (const [key, value] of Object.entries(patch)) {
          if (value === null || value === undefined) map.delete(key)
          else map.set(key, value)
        }
      }
      patchMap(root.get('props'), plan.rootProps ?? {})
      patchMap(root.get('meta'), plan.rootMeta ?? {})
      for (const [id, patch] of Object.entries(plan.retainedMetaPatches ?? {})) patchMap(blocks.get(id)!.get('meta'), patch)
    })
    update = Y.encodeStateAsUpdate(staging, vector)
  } finally {
    staging.destroy()
  }
  assertDocumentStructureTransformAllowed(doc, plan.purpose)
  doc.crud.undoManager.captureStructureTransform(plan.purpose, () => {
    doc.selection.replay(null)
    doc.crud.transact(() => Y.applyUpdate(doc.yDoc, update))
  })
}
