import * as Y from 'yjs'
import {Subject} from 'rxjs'
import {Y_REVISION_MAP_NAME, Y_REVISION_DECISION_MAP_NAME} from '../../revision/store'
import {BlockNodeType} from '../../model/block'
import type {IBlockSnapshot} from '../../block-std/types'
import type {YBlock} from '../../block-std/reactive/block'
import {
  assertRegionBlock, blockChildren, changedBlockIds, copyJson, copyNative, fail, isStructureEvent,
  patchEvent, requireBlock, scanSource, snapshotBlock, validatePatchEvent, validateSnapshots, writeSnapshots,
  type BlockMap, type SourceGraph,
} from './model'
import {
  DocumentCompositionError, type DocumentCompositionOptions, type DocumentContentRegion,
  type DocumentContentScope, type DocumentPersonalChange, type DocumentPersonalData,
} from './types'

type BlockEvent = Y.YEvent<Y.AbstractType<unknown>>

/**
 * A local editing document composed from a shared source and independent JSON regions.
 * Only sharedDoc may be connected to a network or shared persistence provider.
 * editorDoc contains private data and has different CRDT identities from sharedDoc.
 */
export class DocumentCompositionSession {
  readonly editorDoc = new Y.Doc({gc: false})
  readonly rootId: string
  readonly regions: readonly DocumentContentRegion[]
  readonly personalChanges$ = new Subject<DocumentPersonalChange>()
  readonly errors$ = new Subject<Error>()
  private readonly sharedDoc: Y.Doc
  private readonly source: BlockMap
  private readonly view: BlockMap
  private readonly regionByBlock = new Map<string, string>()
  private readonly regionRoots = new Map<string, string[]>()
  /** Historical ownership is retained after removal, for undo and fail-closed routing. */
  private readonly scopes = new Map<string, string | null>()
  private reachable = new Set<string>()
  private sourceGraph: SourceGraph
  private readonly projectionOrigin = Object.freeze({kind: 'composition-projection'})
  private readonly sharedWriteOrigin = Object.freeze({kind: 'composition-shared-write'})
  private _failed: Error | null = null
  private _disposed = false

  constructor(options: DocumentCompositionOptions) {
    this.sharedDoc = options.sharedDoc
    this.rootId = options.rootId
    this.regions = Object.freeze(options.regions.map(region => Object.freeze({...region})))
    this.source = this.sharedDoc.getMap<YBlock>('blocks')
    this.view = this.editorDoc.getMap<YBlock>('blocks')
    try {
      if (this.sharedDoc.isDestroyed) fail('共享文档已销毁')
      this.assertNoRevisions(this.sharedDoc)
      const regionIds = new Set<string>()
      for (const region of this.regions) {
        if (typeof region.id !== 'string' || !region.id.trim() || typeof region.blockId !== 'string' || !region.blockId ||
          regionIds.has(region.id) || this.regionByBlock.has(region.blockId)) fail('独立内容区域 ID 或容器绑定重复/无效')
        regionIds.add(region.id)
        this.regionByBlock.set(region.blockId, region.id)
      }
      this.sourceGraph = scanSource(this.source, this.rootId, this.regionByBlock)
      const data = options.personalData === undefined ? undefined : copyJson(options.personalData)
      if (data !== undefined && (!data || data.formatVersion !== 1 || !data.regions || typeof data.regions !== 'object' || Array.isArray(data.regions))) {
        fail('不支持的个人内容格式')
      }
      for (const region of this.regions) {
        if (!this.sourceGraph.mountedRegions.has(region.id) && !Object.prototype.hasOwnProperty.call(data?.regions ?? {}, region.id)) {
          fail(`独立内容区域尚未出现在共享文档：${region.id}`)
        }
        if (this.source.has(region.blockId)) assertRegionBlock(requireBlock(this.source, region.blockId))
      }
      const ids = new Set(this.source.keys())
      const personal = new Map<string, IBlockSnapshot[]>()
      if (data) for (const [regionId, value] of Object.entries(data.regions)) {
        if (!regionId.trim() || !value || typeof value !== 'object') fail('无效的个人区域记录')
        personal.set(regionId, validateSnapshots(value.children, ids))
      }
      for (const region of this.regions) {
        if (!personal.has(region.id)) {
          const defaults = blockChildren(requireBlock(this.source, region.blockId)).map(id => snapshotBlock(this.source, id))
          personal.set(region.id, validateSnapshots(defaults, ids, true))
        }
      }
      Y.transact(this.editorDoc, () => {
        for (const [regionId, children] of personal) {
          this.regionRoots.set(regionId, children.map(child => child.id))
          writeSnapshots(this.view, children)
          this.rememberPersonalScopes(regionId, children)
        }
        for (const id of this.sourceGraph.sharedIds) {
          this.view.set(id, this.copySharedBlock(id))
          this.scopes.set(id, null)
        }
      }, this.projectionOrigin, false)
      this.refreshViewScopes()
      this.sharedDoc.on('beforeObserverCalls', this.beforeSourceObservers)
      this.source.observeDeep(this.onSourceChange)
      this.view.observeDeep(this.onEditorChange)
      this.editorDoc.on('beforeObserverCalls', this.beforeEditorObservers)
      this.sharedDoc.on('destroy', this.onSourceDestroy)
      this.editorDoc.on('destroy', this.onEditorDestroy)
    } catch (error) {
      this.editorDoc.destroy()
      throw error
    }
  }

  get failed(): Error | null { return this._failed }
  get disposed(): boolean { return this._disposed }

  getBlockScope(id: string): DocumentContentScope {
    // Newly inserted blocks can be queried by CRUD/history before deep observers.
    if (!this.scopes.has(id) && this.view.has(id) && !this._failed && !this._disposed) this.refreshViewScopes()
    return this.scopes.get(id)
  }

  getChildrenScope(parentId: string): DocumentContentScope {
    return this.regionByBlock.get(parentId) ?? this.getBlockScope(parentId)
  }

  isRegionContainer(id: string): boolean { return this.regionByBlock.has(id) }

  exportPersonalData(): DocumentPersonalData {
    this.assertActive()
    const regions: Record<string, {children: IBlockSnapshot[]}> = Object.create(null)
    for (const [regionId, ids] of this.regionRoots) {
      regions[regionId] = {children: ids.map(id => snapshotBlock(this.view, id))}
    }
    return {formatVersion: 1, regions}
  }

  exportSharedSnapshot(): IBlockSnapshot {
    this.assertActive()
    return snapshotBlock(this.source, this.rootId)
  }

  dispose(): void {
    if (this._disposed) return
    this._disposed = true
    this.sharedDoc.off('beforeObserverCalls', this.beforeSourceObservers)
    this.source.unobserveDeep(this.onSourceChange)
    this.view.unobserveDeep(this.onEditorChange)
    this.editorDoc.off('beforeObserverCalls', this.beforeEditorObservers)
    this.sharedDoc.off('destroy', this.onSourceDestroy)
    this.editorDoc.off('destroy', this.onEditorDestroy)
    this.personalChanges$.complete()
    this.errors$.complete()
    if (!this.editorDoc.isDestroyed) this.editorDoc.destroy()
  }

  private readonly onSourceDestroy = () => this.dispose()
  private readonly onEditorDestroy = () => this.dispose()

  private assertActive(): void {
    if (this._disposed) fail('组合文档会话已销毁')
    if (this._failed) throw this._failed
  }

  private rememberPersonalScopes(regionId: string, children: readonly IBlockSnapshot[]): void {
    for (const child of children) {
      this.scopes.set(child.id, regionId)
      if (child.nodeType !== BlockNodeType.editable) this.rememberPersonalScopes(regionId, child.children as IBlockSnapshot[])
    }
  }

  private copySharedBlock(id: string): YBlock {
    const regionId = this.regionByBlock.get(id)
    const existingProps = this.view.get(id)?.get('props').toJSON() ?? {}
    return copyNative(requireBlock(this.source, id), regionId === undefined ? undefined : this.regionRoots.get(regionId) ?? [],
      regionId === undefined ? undefined : existingProps)
  }

  /** Structural changes only; text and property edits never walk the document. */
  private refreshViewScopes(): void {
    const next = new Map<string, string | null>()
    const visit = (id: string, scope: string | null) => {
      if (next.has(id)) fail(`组合文档存在循环或重复引用：${id}`)
      const block = requireBlock(this.view, id)
      if (this.scopes.has(id) && this.scopes.get(id) !== scope) fail(`不能跨数据区域移动块：${id}`)
      if (scope !== null && this.source.has(id)) fail(`个人内容与共享块 ID 冲突：${id}`)
      if (scope === null && this.source.has(id) && !this.sourceGraph.sharedIds.has(id)) fail(`不能引用共享默认内容作为编辑块：${id}`)
      next.set(id, scope)
      const regionId = this.regionByBlock.get(id)
      if (regionId !== undefined) {
        if (scope !== null) fail('独立内容区域绑定已失效')
        assertRegionBlock(block)
      }
      const children = blockChildren(block)
      for (const child of children) visit(child, regionId ?? scope)
      if (regionId !== undefined) this.regionRoots.set(regionId, [...children])
    }
    visit(this.rootId, null)
    next.forEach((scope, id) => this.scopes.set(id, scope))
    this.reachable = new Set(next.keys())
  }

  private assertNoRevisions(doc: Y.Doc): void {
    for (const key of [Y_REVISION_MAP_NAME, Y_REVISION_DECISION_MAP_NAME]) {
      if (!doc.share.has(key)) continue
      // Binary updates initially create AbstractType roots. Materialize the map before
      // inspecting it, otherwise records received before getMap() would be invisible.
      let map: Y.Map<unknown>
      try { map = doc.getMap(key) } catch { fail(`无效的修订数据域：${key}`) }
      if (map.size > 0) fail('组合文档暂不支持修订记录；请先完成审阅并清理修订域')
    }
  }

  private readonly beforeSourceObservers = () => {
    if (!this._failed && !this._disposed) this.runSafely(() => this.assertNoRevisions(this.sharedDoc))
  }

  private readonly beforeEditorObservers = (transaction: Y.Transaction) => {
    if (transaction.origin === this.projectionOrigin || this._failed || this._disposed) return
    this.runSafely(() => this.assertNoRevisions(this.editorDoc))
    if (this._failed) return
    const structural = [...transaction.changed].some(([target, keys]) => (target as unknown) === this.view || target instanceof Y.Array ||
      (target instanceof Y.Map && ['id', 'flavour', 'nodeType', 'children'].some(key => keys.has(key))))
    if (structural) this.runSafely(() => this.refreshViewScopes())
  }

  private readonly onEditorChange = (events: BlockEvent[], transaction: Y.Transaction) => {
    if (transaction.origin === this.projectionOrigin || this._failed || this._disposed) return
    this.runSafely(() => {
      const structural = events.some(isStructureEvent)
      if (structural) {
        this.refreshViewScopes()
        for (const region of this.regions) {
          if (this.sourceGraph.mountedRegions.has(region.id) && !this.reachable.has(region.blockId)) {
            fail('不能从组合编辑器删除独立内容区域；请更新共享结构后重新投影')
          }
        }
      }
      const dirtyRegions = new Set<string>()
      const changed = changedBlockIds(events)
      for (const id of changed) {
        const scope = this.scopes.get(id)
        if (typeof scope === 'string') dirtyRegions.add(scope)
      }
      for (const event of events) {
        if (typeof event.path[0] === 'string' && event.path[1] === 'children') {
          const regionId = this.regionByBlock.get(event.path[0])
          if (regionId !== undefined) dirtyRegions.add(regionId)
        }
      }
      const added = new Set<string>()
      const removed = new Set<string>()
      if (structural) {
        for (const id of this.reachable) {
          if (this.scopes.get(id) === null && !this.sourceGraph.sharedIds.has(id)) added.add(id)
        }
        for (const id of this.sourceGraph.sharedIds) {
          if (!this.reachable.has(id)) removed.add(id)
        }
      }
      const topReplaced = new Set<string>()
      for (const event of events) if (!event.path.length) {
        event.changes.keys.forEach((change, id) => {
          if (change.action !== 'delete' && this.scopes.get(id) === null && this.reachable.has(id)) topReplaced.add(id)
        })
      }
      const patches = events.filter(event => {
        const id = event.path[0]
        return typeof id === 'string' && this.scopes.get(id) === null && this.reachable.has(id) &&
          !added.has(id) && !topReplaced.has(id) && !(this.regionByBlock.has(id) && event.path[1] === 'children') &&
          !(this.regionByBlock.has(id) && event.path[1] === 'props' && [...event.changes.keys.keys()].every(key => key === 'textFit'))
      })
      // Validate complete mutations before opening the shared transaction. Exceptions do not roll back Yjs.
      const copies = new Map<string, YBlock>()
      for (const id of new Set([...added, ...topReplaced])) {
        if (this.regionByBlock.has(id)) fail('不能替换独立内容区域的容器身份')
        const block = requireBlock(this.view, id)
        for (const child of blockChildren(block)) if (this.scopes.get(child) !== null) fail('共享块不能引用个人内容')
        copies.set(id, copyNative(block))
      }
      for (const event of patches) {
        requireBlock(this.view, event.path[0] as string)
        validatePatchEvent(event, requireBlock(this.source, event.path[0] as string), this.regionByBlock.has(event.path[0] as string))
        if (event.path.length === 1 && this.regionByBlock.has(event.path[0] as string) &&
          ['id', 'nodeType', 'children'].some(key => event.changes.keys.has(key))) fail('不能替换独立内容区域结构')
        if (event.path.length > 2) fail('组合文档不支持嵌套 Yjs 属性')
        if (event.path[1] === 'children' && event.target instanceof Y.Array) {
          for (const id of event.target.toArray()) if (this.scopes.get(id) !== null) fail('共享结构不能引用个人内容')
        }
      }
      if (copies.size || removed.size || patches.length) {
        this.sharedDoc.transact(() => {
          copies.forEach((block, id) => this.source.set(id, block))
          for (const event of patches) patchEvent(event, requireBlock(this.source, event.path[0] as string), this.regionByBlock.has(event.path[0] as string))
          removed.forEach(id => this.source.delete(id))
        }, this.sharedWriteOrigin)
      }
      if (dirtyRegions.size) this.personalChanges$.next({regionIds: [...dirtyRegions]})
    })
  }

  private readonly onSourceChange = (events: BlockEvent[], transaction: Y.Transaction) => {
    if (this._failed || this._disposed) return
    this.runSafely(() => {
      const structural = events.some(isStructureEvent)
      const previous = this.sourceGraph
      const next = structural ? scanSource(this.source, this.rootId, this.regionByBlock) : previous
      if (structural) {
        for (const id of this.source.keys()) if (typeof this.scopes.get(id) === 'string') fail(`共享源使用了个人内容块 ID：${id}`)
      }
      this.sourceGraph = next
      if (transaction.origin === this.sharedWriteOrigin) return
      const replaced = new Set<string>()
      for (const event of events) if (!event.path.length) event.changes.keys.forEach((change, id) => {
        if (change.action !== 'delete' && next.sharedIds.has(id)) replaced.add(id)
      })
      const added = structural ? new Set([...next.sharedIds].filter(id => !previous.sharedIds.has(id))) : new Set<string>()
      const removed = structural ? new Set([...previous.sharedIds].filter(id => !next.sharedIds.has(id))) : new Set<string>()
      const copies = new Map<string, YBlock>()
      for (const id of new Set([...added, ...replaced])) copies.set(id, this.copySharedBlock(id))
      const patches = events.filter(event => {
        const id = event.path[0]
        return typeof id === 'string' && next.sharedIds.has(id) && !copies.has(id) &&
          !(this.regionByBlock.has(id) && event.path[1] === 'children') &&
          !(this.regionByBlock.has(id) && event.path[1] === 'props' && [...event.changes.keys.keys()].every(key => key === 'textFit'))
      })
      if (!copies.size && !removed.size && !patches.length) return
      Y.transact(this.editorDoc, () => {
        copies.forEach((block, id) => this.view.set(id, block))
        for (const event of patches) {
          const id = event.path[0] as string
          // Replacing a region's own fields must preserve its personal children.
          if (event.path.length === 1 && this.regionByBlock.has(id) &&
            (event.changes.keys.has('children') || event.changes.keys.has('props'))) {
            const block = this.copySharedBlock(id)
            this.view.set(id, block)
          } else patchEvent(event, requireBlock(this.view, id), this.regionByBlock.has(id))
        }
        removed.forEach(id => this.view.delete(id))
      }, this.projectionOrigin, false)
      if (structural) this.refreshViewScopes()
    })
  }

  private runSafely(action: () => void): void {
    try { action() } catch (error) {
      this._failed = error instanceof Error ? error : new DocumentCompositionError(String(error))
      this.errors$.next(this._failed)
    }
  }
}
