import { DocCRUD } from "./crud";
import { ComponentRef, Injector, NgZone, ViewContainerRef } from "@angular/core";
import { BlockCraftError, ErrorCode, getScrollContainer, Logger, nextTick, performanceTest } from "../../global";
import { DocVM } from "./vm";
import {
  IBlockSnapshot,
  EmbedConverter,
  withDefaultEmbedConverters,
  UIEventDispatcher,
  EditableBlockComponent,
  YBlock
} from "../block-std";
import { ClipboardManager, InputTransformer, SelectionManager, ClipboardCopyFilter } from "../modules";
import { BehaviorSubject, Subject, Subscription, take } from "rxjs";
import { getCommonPath } from "../utils";
import { DocPlugin } from "../plugin";
import { DOC_MESSAGE_SERVICE_TOKEN } from "../services";
import { DocOverlayService } from "../services";
import { DocDndService } from "../services/dnd.service";
import { DocInternalDragController } from "../services/internal-drag.controller";
import { DocChain } from "../chain/doc-chain";
import * as Y from "yjs";
import { BLOCK_POSITION } from "./block-position";
import { BlockModelGraph } from "./model-graph";
import { BlockReadonlyManager } from "./block-readonly-manager";
import { BlockRef } from "./block-readonly.types";

interface DocConfig {
  docId: string
  schemas: BlockCraft.SchemaManager
  logger: Logger
  injector: Injector
  yDoc: Y.Doc
  theme?: string
  embeds?: [string, EmbedConverter][]
  plugins?: DocPlugin[]
  readonly?: boolean
  /** Global copy filter; seeded into ClipboardManager's registry. Omit = no filtering. */
  copyFilter?: ClipboardCopyFilter
  // 如果不传递，会尝试向上遍历获取
  scrollContainer?: HTMLElement
}

export const Y_BLOCK_MAP_NAME = 'blocks'

const BLOCK_READONLY_FEEDBACK_MESSAGE = '内容已锁定，无法修改'
const BLOCK_READONLY_FEEDBACK_COOLDOWN_MS = 1_000

export class BlockCraftDoc {

  readonly ngZone = this.injector.get(NgZone)

  private afterInitFnStack = new Set<(root: BlockCraft.IBlockComponents['root']) => void>()
  public readonly afterInit$ = new BehaviorSubject<BlockCraft.IBlockComponents['root'] | null>(null)
  public readonly onDestroy$ = new Subject()

  /**
   * If true, doc is readonly
   */
  public readonly readonlySwitch$ = new BehaviorSubject<boolean>(true)
  readonly themeChange$ = new Subject<string>()

  readonly model = new BlockModelGraph(this)
  readonly crud = new DocCRUD(this)
  readonly vm = new DocVM(this)
  readonly event = new UIEventDispatcher(this)
  readonly selection = new SelectionManager(this)
  readonly clipboard = new ClipboardManager(this)
  readonly inputManger = new InputTransformer(this)

  readonly onChildrenUpdate$ = this.crud.onChildrenUpdate$
  readonly onPropsUpdate$ = this.crud.onPropsUpdate$
  readonly onTextUpdate$ = this.crud.onTextUpdate$
  readonly onMetaUpdate$ = this.crud.onMetaUpdate$
  readonly readonlyManager = new BlockReadonlyManager(this)

  private readonly _plugins: DocPlugin[] = []

  public readonly messageService = this.injector.get(DOC_MESSAGE_SERVICE_TOKEN)
  public readonly overlayService = new DocOverlayService(this)
  public readonly dndService = new DocDndService(this)
  public readonly dragController = new DocInternalDragController(this)

  private _scrollContainer: HTMLElement | null = null

  private _subscriptions: Subscription = new Subscription()
  private _lastReadonlyFeedbackAt = Number.NEGATIVE_INFINITY

  private _root: BlockCraft.IBlockComponents['root'] | null = null
  private _yBlockMap!: Y.Map<YBlock>

  get scrollContainer() {
    return this._scrollContainer
  }

  get rootId() {
    return this.root.id
  }

  get yDoc() {
    if (!this.config.yDoc) {
      throw new BlockCraftError(ErrorCode.DefaultFatalError, `yDoc not init yet`)
    }
    return this.config.yDoc
  }

  get yBlockMap() {
    return this._yBlockMap
  }

  // If after init, return root, otherwise throw error
  get root() {
    if (!this._root) {
      throw new BlockCraftError(ErrorCode.NoRootError, `Doc not init yet`)
    }
    return this._root
  }

  get schemas() {
    return this.config.schemas
  }

  get injector() {
    return this.config.injector
  }

  get logger() {
    return this.config.logger
  }

  get plugins() {
    return this._plugins
  }

  get isReadonly() {
    return this.readonlySwitch$.value
  }

  get isInitialized() {
    return !!this._root
  }

  get theme() {
    return this.config.theme || 'light'
  }

  chain() {
    return new DocChain(this)
  }

  constructor(
    public readonly config: DocConfig
  ) {
    this.config.embeds = withDefaultEmbedConverters(this.config.embeds)
    this._plugins = this.config.plugins || []
    this._bindReadonlyViolationFeedback()
    this.onDestroy(() => {
      this.model.destroy()
      this.dragController.destroy()
      this._subscriptions.unsubscribe()
    })
    this._yBlockMap = this.yDoc.getMap<YBlock>(Y_BLOCK_MAP_NAME)
  }

  private _bindReadonlyViolationFeedback(): void {
    this._subscriptions.add(
      this.readonlyManager.violation$.subscribe(violation => {
        // Programmatic writes already receive BlockReadonlyError. UI feedback
        // is reserved for direct user actions so API consumers are not noisy.
        if (violation.trigger === 'api') return

        const now = Date.now()
        const previous = this._lastReadonlyFeedbackAt ?? Number.NEGATIVE_INFINITY
        if (now - previous < BLOCK_READONLY_FEEDBACK_COOLDOWN_MS) return

        this._lastReadonlyFeedbackAt = now
        this.messageService.warn(BLOCK_READONLY_FEEDBACK_MESSAGE)
      }),
    )
  }

  @performanceTest('Doc init', 300)
  // init from a snapshot as root
  initBySnapshot(snapShot: IBlockSnapshot, container: HTMLElement) {
    if (this._root) return

    if (snapShot.flavour !== 'root') {
      throw new BlockCraftError(ErrorCode.ModelCRUDError, `Invalid root snapshot`)
    }

    const comp = this.vm.createComponentBySnapshot(snapShot, (b) => {
      this.yBlockMap.set(b.instance.id, b.instance.yBlock)
    })
    this.model.build(comp.instance.id)
    container.append(comp.location.nativeElement)
    this._initEditor(comp.instance as any)
  }

  @performanceTest('Doc init', 300)
  initByYBlock(yRoot: YBlock, container: HTMLElement) {
    if (this._root) return
    if (yRoot.get('flavour') !== 'root') {
      throw new BlockCraftError(ErrorCode.DefaultFatalError, `Invalid root yBlock`)
    }

    const id = yRoot.get('id')
    // 「遇到才兜底」：构建组件树时收集实际遇到的悬空 child 引用（历史协同
    // 「移动 vs 删除」遗留的孤儿引用，无对应 yBlock）。干净文档一个都不会触发，
    // 不做任何全文档扫描。
    const danglingRefs: { parentId: string, childId: string }[] = []
    const comp = this.vm.createComponentByYBlocks(
      { [id]: yRoot },
      (parentId, childId) => danglingRefs.push({ parentId, childId }),
    )
    // 构建后、observer 挂载前剪除遇到的悬空引用：构建时它们被跳过渲染，
    // _compRefs 比模型短，此处剪掉模型里的悬空引用使两者重新对齐；此刻 observer
    // 未挂，删除不会触发按模型下标 splice（否则会删错有效组件）。
    if (danglingRefs.length) this.crud.pruneChildRefs(danglingRefs)

    const root = comp[id]
    this.model.build(id)
    container.append(root.location.nativeElement)
    this._initEditor(root.instance as any)
  }

  private _initEditor(comp: BlockCraft.IBlockComponents['root']) {

    // exec after init functions
    this.afterInit$.next(this._root = comp)
    this.afterInitFnStack.forEach(fn => fn(this.root))
    // this.afterInitFnStack.clear()

    // init plugins
    this._plugins.forEach(plugin => plugin.register(this))

    // listen root destroy, release all resources
    comp.onDestroy$.pipe(take(1)).subscribe(() => {
      this.onDestroy$.next(true)
      this.plugins.forEach(plugin => plugin.destroy())
      this.vm.clear()
    })

    // 这两行代码会造成严重延迟
    nextTick().then(() => {
      // init scroll container
      this._scrollContainer = this.config.scrollContainer ?? getScrollContainer(comp.hostElement)
      // init readonly
      this.readonlySwitch$.next(this.config.readonly || false)
      // init theme
      this.toggleTheme(this.config.theme || 'light')
    })

    // init hotkeys
    this.event.bindHotkey({
      key: 'z',
      shortKey: true,
      shiftKey: null
    }, context => {
      context.get('keyboardState').raw.shiftKey ? this.crud.undoManager.redo() : this.crud.undoManager.undo()
      context.preventDefault()
      context.stopPropagation()
      return true
    }, { blockId: this.rootId })

  }

  destroy() {
    if (!this._root) return
    this.vm.clear()
    this.afterInit$.next(this._root = null)
  }

  afterInit(fn: (root: BlockCraft.IBlockComponents['root']) => void) {
    this.afterInit$.value ? fn(this.root) : this.afterInitFnStack.add(fn)
  }

  onDestroy(fn: () => void) {
    this.onDestroy$.pipe(take(1)).subscribe(fn)
  }

  /**
   * 新增订阅，会在文档销毁时自动解除监听
   * @param sub
   */
  addSubscription(sub: Subscription) {
    this._subscriptions.add(sub)
  }

  /**
   * 移除订阅
   * @param sub
   */
  removeSubscription(sub: Subscription) {
    this._subscriptions.remove(sub)
  }

  getBlockRef<T extends BlockCraft.BlockFlavour = BlockCraft.BlockFlavour>(id: string, onError?: () => void) {
    const block = this.vm.get(id)
    if (!block) {
      onError?.()
      throw new BlockCraftError(ErrorCode.ModelCRUDError, `Block not found: ${id}`)
    }
    return block as ComponentRef<BlockCraft.IBlockComponents[T]>
  }

  getBlockById<T extends BlockCraft.BlockFlavour = BlockCraft.BlockFlavour>(id: string, onError?: () => void) {
    return this.getBlockRef<T>(id, onError).instance
  }

  isEditable(block: BlockCraft.BlockComponent): block is EditableBlockComponent {
    return block instanceof EditableBlockComponent
  }

  private _getModelBlockId(block: string | BlockCraft.BlockComponent) {
    const blockId = typeof block === 'string' ? block : block.id
    if (typeof block === 'string' && !this.model.exists(blockId)) {
      throw new BlockCraftError(ErrorCode.ModelCRUDError, `Block not found: ${blockId}`)
    }
    return blockId
  }

  nextSibling(block: string | BlockCraft.BlockComponent) {
    const siblingId = this.model.getNextSiblingId(this._getModelBlockId(block))
    return siblingId === null ? null : this.getBlockById(siblingId)
  }

  prevSibling(block: string | BlockCraft.BlockComponent) {
    const siblingId = this.model.getPreviousSiblingId(this._getModelBlockId(block))
    return siblingId === null ? null : this.getBlockById(siblingId)
  }

  getBlockSiblingIds<T extends BlockCraft.BlockFlavour = BlockCraft.BlockFlavour>(id: string) {
    this._getModelBlockId(id)
    const parentId = this.model.getParentId(id)
    if (parentId === null) {
      throw new BlockCraftError(ErrorCode.ModelCRUDError, `Block has no parent: ${id}`)
    }
    return [...this.model.getChildrenIds(parentId)]
  }

  getBlockSiblings(block: string | BlockCraft.BlockComponent) {
    const blockId = this._getModelBlockId(block)
    const parentId = this.model.getParentId(blockId)
    if (parentId === null) {
      throw new BlockCraftError(ErrorCode.ModelCRUDError, `Block has no parent: ${blockId}`)
    }
    return this.model.getChildrenIds(parentId).map(id => this.getBlockById(id))
  }

  /**
   * query ancestor blocks
   * @param block the block to start query
   * @param predicate if predicate is provided, return the first block that matches the predicate. Until the root block is reached or the predicate is matched
   */
  queryAncestor(block: string | BlockCraft.BlockComponent, predicate?: (b: BlockCraft.BlockComponent) => boolean) {

    const path: BlockCraft.BlockComponent[] = []

    const query = (block: BlockCraft.BlockComponent, predicate?: (b: BlockCraft.BlockComponent) => boolean): BlockCraft.BlockComponent | null => {
      path.push(block)
      if (predicate && predicate(block)) return block
      if (block.flavour === 'root' || !block.parentId) return null
      return query(this.getBlockById(block.parentId), predicate)
    }

    query(typeof block === 'string' ? this.getBlockById(block) : block, predicate)
    return path.reverse()
  }

  getBlockPath(block: string | BlockCraft.BlockComponent) {
    const blockId = this._getModelBlockId(block)
    const path = this.model.getPath(blockId)
    if (!path) throw new BlockCraftError(ErrorCode.ModelCRUDError, `Block not found: ${blockId}`)
    return [...path]
  }

  /**
   * compare block position between two blocks
   * @param a
   * @param b
   * @return {@link BLOCK_POSITION}
   */
  compareBlockPosition(a: string | BlockCraft.BlockComponent, b: string | BlockCraft.BlockComponent): BLOCK_POSITION {
    const aId = this._getModelBlockId(a)
    const bId = this._getModelBlockId(b)
    const position = this.model.comparePosition(aId, bId)
    if (position === null) {
      throw new BlockCraftError(ErrorCode.ModelCRUDError, `Blocks cannot be compared: ${aId}, ${bId}`)
    }
    return position
  }

  /**
   * query blocks between two blocks (only first level children)
   * @param from
   * @param to
   * @param contain whether to include the from and to blocks
   */
  queryBlocksBetween(from: string | BlockCraft.BlockComponent, to: string | BlockCraft.BlockComponent, contain = false) {
    const fromId = this._getModelBlockId(from)
    const toId = this._getModelBlockId(to)
    return [...this.model.queryBetween(fromId, toId, contain)]
  }

  // block tree下，两个block经过的block集合
  queryBlocksThroughPathDeeply(from: string | BlockCraft.BlockComponent, to: string | BlockCraft.BlockComponent) {
    const fromComp = typeof from === 'string' ? this.getBlockById(from) : from
    const toComp = typeof to === 'string' ? this.getBlockById(to) : to

    const list: {
      parent: string,
      parentBlock: BlockCraft.BlockComponent,
      index: number,
      length: number,
      group: string[]
    }[] = []

    const fromPath = this.getBlockPath(fromComp)
    const toPath = this.getBlockPath(toComp)

    const commonPath = getCommonPath(fromPath, toPath)
    const endId = commonPath.at(-1)!

    const collect = (comp: BlockCraft.BlockComponent, isFrom: boolean) => {
      const parentId = comp.parentId
      if (!parentId || parentId === endId) return
      const parentComp = this.getBlockById(parentId)
      const childrenIds = parentComp.childrenIds
      const index = childrenIds.indexOf(comp.id)
      if (isFrom && index < childrenIds.length - 1) {
        list.push({
          parentBlock: parentComp,
          parent: parentId,
          index: index + 1,
          length: childrenIds.length - index - 1,
          group: childrenIds.slice(index + 1)
        })
      } else if (!isFrom && index > 0) {
        list.push({
          parent: parentId,
          index: 0,
          length: index,
          parentBlock: parentComp,
          group: childrenIds.slice(0, index)
        })
      }
      collect(parentComp, isFrom)
    }

    collect(fromComp, true)
    collect(toComp, false)

    const childrenPath = this.getBlockById(commonPath.at(-1)!).childrenIds
    const index1 = childrenPath.indexOf(fromPath.slice(commonPath.length)[0])
    const index2 = childrenPath.indexOf(toPath.slice(commonPath.length)[0])
    list.push({
      parent: endId,
      index: index1 + 1,
      length: index2 - index1 - 1,
      parentBlock: this.getBlockById(endId),
      group: childrenPath.slice(index1 + 1, index2)
    })

    return list
  }

  exportSnapshot() {
    return this.model.toSnapshot(this.rootId) ?? undefined
  }

  toggleTheme(name: string) {
    document.body.setAttribute('blockcraft-theme', this.config.theme = name)
    this.themeChange$.next(this.config.theme)
  }

  toggleReadonly(readonly: boolean) {
    this.config.readonly = readonly
    this.readonlySwitch$.next(readonly)
  }

  subscribeReadonlyChange(fn: (readonly: boolean) => void) {
    const sub = this.readonlySwitch$.subscribe(fn)
    this.addSubscription(sub)
    return sub
  }

  setBlockReadonly(block: BlockRef, readonly: boolean) {
    this.readonlyManager.set(block, readonly)
  }

  isBlockReadonly(block: BlockRef) {
    return this.readonlyManager.isReadonly(block)
  }

}

export * from './crud'
export * from './vm'
export * from './block-position'
export * from './model-graph'
export * from './block-readonly.types'
export * from './block-readonly-manager'

declare global {
  namespace BlockCraft {
    type Doc = InstanceType<typeof BlockCraftDoc>
  }
}
