import * as Y from 'yjs'
import {BlockNodeType} from '../../model/block'
import type {IBlockSnapshot} from '../../block-std/types'
import {native2YBlock, yBlock2Native, type NativeBlockModel, type YBlock} from '../../block-std/reactive/block'
import {generateId} from '../../utils/id'
import {DocumentCompositionError} from './types'

export type BlockMap = Y.Map<YBlock>
export interface SourceGraph {
  readonly sharedIds: Set<string>
  readonly allIds: Set<string>
  readonly mountedRegions: Set<string>
}

export function fail(message: string): never {
  throw new DocumentCompositionError(message)
}

/** Copy JSON atoms without retaining references to the caller or Yjs values. */
export function copyJson<T>(value: T): T {
  const visit = (item: unknown, seen: Set<object>): unknown => {
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return item
    if (typeof item === 'number' && Number.isFinite(item)) return item
    if (typeof item !== 'object' || !item) return fail('组合文档内容必须是有效 JSON 数据')
    if (seen.has(item)) return fail('组合文档内容不能包含循环引用')
    if (!Array.isArray(item) && Object.getPrototypeOf(item) !== Object.prototype && Object.getPrototypeOf(item) !== null) {
      return fail('组合文档内容只能包含普通 JSON 对象')
    }
    seen.add(item)
    const result = Array.isArray(item)
      ? Array.from(item, child => visit(child, seen))
      : Object.fromEntries(Object.entries(item).map(([key, child]) => [key, visit(child, seen)]))
    seen.delete(item)
    return result
  }
  return visit(value, new Set()) as T
}

export function blockChildren(block: YBlock): string[] {
  if (block.get('nodeType') === BlockNodeType.editable) return []
  const children = block.get('children')
  if (!(children instanceof Y.Array)) return fail(`块 ${block.get('id')} 的子节点不是 Y.Array`)
  return children.toArray() as string[]
}

export function requireBlock(map: BlockMap, id: string): YBlock {
  const block = map.get(id)
  if (!(block instanceof Y.Map) || block.get('id') !== id || typeof block.get('flavour') !== 'string' ||
    !(block.get('props') instanceof Y.Map) || !(block.get('meta') instanceof Y.Map)) {
    return fail(`组合文档块不存在或结构无效：${id}`)
  }
  const type = block.get('nodeType')
  if (!Object.values(BlockNodeType).includes(type)) return fail(`块 ${id} 的节点类型无效`)
  if (type === BlockNodeType.editable && !(block.get('children') instanceof Y.Text)) return fail(`块 ${id} 缺少 Y.Text`)
  if (type !== BlockNodeType.editable && !(block.get('children') instanceof Y.Array)) return fail(`块 ${id} 缺少 Y.Array`)
  return block
}

/** A region shell may not expose child-owned structure as shared layout properties. */
export function assertRegionBlock(block: YBlock): void {
  if (block.get('nodeType') !== BlockNodeType.block) fail('独立内容区域必须绑定非根容器块')
  if (block.get('flavour') === 'columns') {
    fail('首版组合文档不能直接绑定分栏容器；请使用外层 render-unit 或 text-box 包裹分栏')
  }
}

export function scanSource(map: BlockMap, rootId: string, regions: ReadonlyMap<string, string>): SourceGraph {
  const allIds = new Set<string>()
  const sharedIds = new Set<string>()
  const mountedRegions = new Set<string>()
  const visit = (id: string, region: string | undefined) => {
    if (allIds.has(id)) return fail(`共享文档存在循环或重复块引用：${id}`)
    allIds.add(id)
    const block = requireBlock(map, id)
    if (region === undefined) sharedIds.add(id)
    const bound = regions.get(id)
    if (bound !== undefined) {
      if (region !== undefined) return fail('独立内容区域不能嵌套')
      if (id === rootId) return fail('独立内容区域不能绑定根块')
      assertRegionBlock(block)
      mountedRegions.add(bound)
    }
    for (const child of blockChildren(block)) {
      if (typeof child !== 'string' || !child) return fail(`块 ${id} 的子节点 ID 无效`)
      visit(child, bound ?? region)
    }
  }
  if (requireBlock(map, rootId).get('nodeType') !== BlockNodeType.root) fail('组合文档必须具有有效的根块')
  visit(rootId, undefined)
  return {allIds, sharedIds, mountedRegions}
}

export function snapshotBlock(map: BlockMap, id: string, visiting = new Set<string>()): IBlockSnapshot {
  if (visiting.has(id)) return fail(`快照存在循环或重复块引用：${id}`)
  visiting.add(id)
  const block = requireBlock(map, id)
  const native = copyJson(yBlock2Native(block))
  const snapshot = {
    ...native,
    children: block.get('nodeType') === BlockNodeType.editable
      ? native.children
      : blockChildren(block).map(child => snapshotBlock(map, child, visiting)),
  } as IBlockSnapshot
  return snapshot
}

export function copyNative(block: YBlock, children?: readonly string[], localProps?: Record<string, unknown>): YBlock {
  for (const field of ['props', 'meta'] as const) {
    for (const value of (block.get(field) as Y.Map<unknown>).values()) if (value instanceof Y.AbstractType) fail('props/meta 必须使用 JSON 原子值')
  }
  const native = copyJson(yBlock2Native(block))
  if (children !== undefined) native.children = [...children] as never
  if (localProps !== undefined) {
    delete native.props['textFit']
    if (Object.prototype.hasOwnProperty.call(localProps, 'textFit')) native.props['textFit'] = copyJson(localProps['textFit']) as never
  }
  return native2YBlock(native)
}

export function validateSnapshots(
  children: readonly IBlockSnapshot[],
  ids: Set<string>,
  regenerate = false,
): IBlockSnapshot[] {
  if (!Array.isArray(children)) return fail('独立区域 children 必须是块快照数组')
  const copy = copyJson(children) as IBlockSnapshot[]
  const visit = (block: IBlockSnapshot) => {
    if (!block || typeof block !== 'object' || typeof block.id !== 'string' || !block.id ||
      typeof block.flavour !== 'string' || !block.flavour || !block.props || Array.isArray(block.props) ||
      typeof block.props !== 'object' || !block.meta || Array.isArray(block.meta) || typeof block.meta !== 'object' ||
      !Object.values(BlockNodeType).includes(block.nodeType) || block.nodeType === BlockNodeType.root || !Array.isArray(block.children)) {
      return fail('独立区域包含无效的块快照')
    }
    if (regenerate) block.id = generateId()
    if (ids.has(block.id)) return fail(`独立内容块 ID 冲突：${block.id}`)
    ids.add(block.id)
    if (block.nodeType === BlockNodeType.editable) {
      for (const delta of block.children) {
        if (!delta || typeof delta !== 'object' || !('insert' in delta) || 'retain' in delta || 'delete' in delta ||
          (typeof delta.insert !== 'string' && (!delta.insert || typeof delta.insert !== 'object'))) {
          return fail(`块 ${block.id} 包含无效的文本快照`)
        }
      }
    } else {
      if (block.nodeType === BlockNodeType.void && block.children.length) return fail('空节点不能包含子块')
      block.children.forEach(child => visit(child as IBlockSnapshot))
    }
  }
  copy.forEach(visit)
  return copy
}

export function writeSnapshots(map: BlockMap, children: readonly IBlockSnapshot[]): void {
  for (const block of children) {
    const native = {...block, children: block.nodeType === BlockNodeType.editable
      ? block.children : (block.children as IBlockSnapshot[]).map(child => child.id)} as NativeBlockModel
    map.set(block.id, native2YBlock(copyJson(native)))
    if (block.nodeType !== BlockNodeType.editable) writeSnapshots(map, block.children as IBlockSnapshot[])
  }
}

export function changedBlockIds(events: readonly Y.YEvent<Y.AbstractType<unknown>>[]): Set<string> {
  const ids = new Set<string>()
  for (const event of events) {
    if (!event.path.length) event.changes.keys.forEach((_value, id) => ids.add(id))
    else if (typeof event.path[0] === 'string') ids.add(event.path[0])
  }
  return ids
}

export function isStructureEvent(event: Y.YEvent<Y.AbstractType<unknown>>): boolean {
  return event.path.length === 0 || event.target instanceof Y.Array ||
    (event.path.length === 1 && ['id', 'flavour', 'nodeType', 'children'].some(key => event.changes.keys.has(key)))
}

export function patchArray(target: Y.Array<string>, delta: Y.YEvent<Y.Array<string>>['delta']): void {
  let index = 0
  for (const operation of delta) {
    if (operation.retain) index += operation.retain
    if (operation.delete) target.delete(index, operation.delete)
    if (operation.insert) {
      if (!Array.isArray(operation.insert) || !operation.insert.every(id => typeof id === 'string')) fail('块子节点增量无效')
      target.insert(index, [...operation.insert] as string[])
      index += operation.insert.length
    }
  }
}

/** Patch only one block's own fields. Never walk children into another data scope. */
export function patchEvent(event: Y.YEvent<Y.AbstractType<unknown>>, targetBlock: YBlock, regionShell = false): void {
  if (event.path.length === 2 && event.path[1] === 'children') {
    const target = targetBlock.get('children')
    if (event.target instanceof Y.Text && target instanceof Y.Text) {
      target.applyDelta(copyJson(event.delta))
      return
    }
    if (event.target instanceof Y.Array && target instanceof Y.Array) {
      patchArray(target, event.delta)
      return
    }
    return fail('组合文档的文本/结构增量类型不匹配')
  }
  if (event.path.length === 2 && (event.path[1] === 'props' || event.path[1] === 'meta') && event.target instanceof Y.Map) {
    const target = targetBlock.get(event.path[1]) as Y.Map<unknown>
    event.changes.keys.forEach((change, key) => {
      if (regionShell && event.path[1] === 'props' && key === 'textFit') return
      if (change.action === 'delete') target.delete(key)
      else target.set(key, copyJson((event.target as Y.Map<unknown>).get(key)))
    })
    return
  }
  if (event.path.length === 1 && event.target instanceof Y.Map) {
    event.changes.keys.forEach((change, key) => {
      if (!['id', 'flavour', 'nodeType', 'props', 'meta', 'children'].includes(key)) fail(`未知块字段：${key}`)
      if (change.action === 'delete') return fail(`不能删除块结构字段：${key}`)
      const value = (event.target as Y.Map<unknown>).get(key)
      targetBlock.set(key, value instanceof Y.AbstractType ? value.clone() : copyJson(value))
    })
    return
  }
  fail('组合文档不支持嵌套 Yjs 属性；props/meta 必须使用 JSON 原子值')
}

/** Preflight all failure-prone event values before mutating another Y.Doc. */
export function validatePatchEvent(event: Y.YEvent<Y.AbstractType<unknown>>, target: YBlock, regionShell = false): void {
  if (event.path.length === 2 && event.path[1] === 'children') {
    if (event.target instanceof Y.Text && target.get('children') instanceof Y.Text) {
      copyJson(event.delta)
      return
    }
    if (event.target instanceof Y.Array && target.get('children') instanceof Y.Array) {
      for (const operation of event.delta) if (operation.insert &&
        (!Array.isArray(operation.insert) || !operation.insert.every(id => typeof id === 'string'))) fail('块子节点增量无效')
      return
    }
    fail('组合文档的文本/结构增量类型不匹配')
  }
  if (event.path.length === 2 && (event.path[1] === 'props' || event.path[1] === 'meta') && event.target instanceof Y.Map) {
    if (!(target.get(event.path[1]) instanceof Y.Map)) fail('组合文档属性结构无效')
    event.changes.keys.forEach((change, key) => {
      if (regionShell && event.path[1] === 'props' && key === 'textFit') return
      if (change.action !== 'delete') copyJson((event.target as Y.Map<unknown>).get(key))
    })
    return
  }
  if (event.path.length === 1 && event.target instanceof Y.Map) {
    event.changes.keys.forEach((change, key) => {
      if (!['id', 'flavour', 'nodeType', 'props', 'meta', 'children'].includes(key)) fail(`未知块字段：${key}`)
      if (change.action === 'delete') fail(`不能删除块结构字段：${key}`)
      if (regionShell && ['id', 'flavour', 'nodeType', 'children', 'props'].includes(key)) fail('不能替换独立内容区域结构')
      const value = (event.target as Y.Map<unknown>).get(key)
      if (key === 'props' || key === 'meta') {
        if (!(value instanceof Y.Map)) fail('组合文档属性结构无效')
        for (const atom of value.values()) copyJson(atom)
      } else copyJson(value instanceof Y.AbstractType ? value.toJSON() : value)
    })
    return
  }
  fail('组合文档不支持嵌套 Yjs 属性；props/meta 必须使用 JSON 原子值')
}
