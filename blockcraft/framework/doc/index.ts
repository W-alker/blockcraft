import {DocCRUD} from "./crud";
import {ComponentRef, Injector, NgZone, ViewContainerRef} from "@angular/core";
import {BlockCraftError, ErrorCode, getScrollContainer, Logger, nextTick, performanceTest} from "../../global";
import {DocVM} from "./vm";
import {
  IBlockSnapshot,
  EmbedConverter,
  InlineManager,
  UIEventDispatcher,
  EditableBlockComponent,
  YBlock
} from "../block-std";
import {ClipboardManager, InputTransformer, SelectionManager} from "../modules";
import {BehaviorSubject, Subject, Subscription, take} from "rxjs";
import {getCommonPath} from "../utils";
import {DocPlugin} from "../plugin";
import {DOC_MESSAGE_SERVICE_TOKEN} from "../services";
import {DocOverlayService} from "../services";
import {DocDndService} from "../services/dnd.service";
import * as Y from "yjs";

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
  // 如果不传递，会尝试向上遍历获取
  scrollContainer?: HTMLElement
}

export const Y_BLOCK_MAP_NAME = 'blocks'

export class BlockCraftDoc {

  readonly ngZone = this.injector.get(NgZone)

  private afterInitFnStack = new Set<(root: BlockCraft.IBlockComponents['root']) => void>()
  public readonly afterInit$ = new BehaviorSubject<BlockCraft.IBlockComponents['root'] | null>(null)
  public readonly onDestroy$ = new Subject()

  /**
   * If true, doc is readonly
   */
  public readonly readonlySwitch$ = new BehaviorSubject<boolean>(true)

  readonly crud = new DocCRUD(this)
  readonly vm = new DocVM(this)
  readonly event = new UIEventDispatcher(this)
  readonly inlineManager = new InlineManager(this)
  readonly selection = new SelectionManager(this)
  readonly clipboard = new ClipboardManager(this)
  readonly inputManger = new InputTransformer(this)

  readonly onChildrenUpdate$ = this.crud.onChildrenUpdate$
  readonly onPropsUpdate$ = this.crud.onPropsUpdate$
  readonly onTextUpdate$ = this.crud.onTextUpdate$

  private readonly _plugins: DocPlugin[] = []

  public readonly messageService = this.injector.get(DOC_MESSAGE_SERVICE_TOKEN)
  public readonly overlayService = new DocOverlayService(this)
  public readonly dndService = new DocDndService(this)

  private _scrollContainer: HTMLElement | null = null
  private _viewContainer: ViewContainerRef | null = null

  private _subscriptions: Subscription = new Subscription()

  private _root: BlockCraft.IBlockComponents['root'] | null = null
  private _yBlockMap!: Y.Map<YBlock>

  get viewContainer() {
    return this._viewContainer
  }

  get scrollContainer() {
    return this._scrollContainer
  }

  get rootId() {
    return this.root.id
  }

  get yDoc() {
    if(!this.config.yDoc) {
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

  constructor(
    public readonly config: DocConfig
  ) {
    this._plugins = this.config.plugins || []
    this.onDestroy(this._subscriptions.unsubscribe)
    this._yBlockMap = this.yDoc.getMap<YBlock>(Y_BLOCK_MAP_NAME)
  }

  @performanceTest('Doc init', 300)
  // init from a snapshot as root
  async initBySnapshot(snapShot: IBlockSnapshot, container: ViewContainerRef) {
    if (this._root) return

    if (snapShot.flavour !== 'root') {
      throw new BlockCraftError(ErrorCode.ModelCRUDError, `Invalid root snapshot`)
    }

    const comp = await this.vm.createComponentBySnapshot(snapShot, (b) => {
      this.yBlockMap.set(b.instance.id, b.instance.yBlock)
    })
    this._viewContainer = container
    container.insert(comp.hostView)
    this._initEditor(comp.instance as any)
  }

  @performanceTest('Doc init', 300)
  async initByYBlock(yRoot: YBlock, container: ViewContainerRef) {
    if (this._root) return
    if (yRoot.get('flavour') !== 'root') {
      throw new BlockCraftError(ErrorCode.DefaultFatalError, `Invalid root yBlock`)
    }

    const id = yRoot.get('id')
    const comp = await this.vm.createComponentByYBlocks({[id]: yRoot})
    const root = comp[id]
    container.insert(root.hostView)
    this._viewContainer = container
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
      this.vm.gc()
    })

    // init theme
    this.toggleTheme(this.config.theme || 'light')

    // 这两行代码会造成严重延迟
    nextTick().then(() => {
      // init scroll container
      this._scrollContainer = this.config.scrollContainer ?? getScrollContainer(comp.hostElement)
      // init readonly
      this.readonlySwitch$.next(this.config.readonly || false)
    })

    // init hotkeys
    this.event.bindHotkey({
      key: 'z',
      shortKey: true,
      shiftKey: null
    }, context => {
      context.get('keyboardState').raw.shiftKey ? this.crud.redo() : this.crud.undo()
      context.preventDefault()
      return true
    }, {blockId: this.rootId})

  }

  destroy() {
    if (!this._root) return
    this.viewContainer?.clear()
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

  nextSibling(block: string | BlockCraft.BlockComponent) {
    const comp = typeof block === 'string' ? this.getBlockById(block) : block
    const parent = this.getBlockById(comp.parentId!)
    const index = parent.childrenIds.indexOf(comp.id)
    if (index === -1) throw new BlockCraftError(ErrorCode.ModelCRUDError, `Block not found: ${comp.id}`)
    if (index === parent.childrenIds.length - 1) return null
    return this.getBlockById(parent.childrenIds[index + 1])
  }

  prevSibling(id: string | BlockCraft.BlockComponent) {
    const comp = typeof id === 'string' ? this.getBlockById(id) : id
    // const prevElement = comp.hostElement.previousElementSibling
    // if (!prevElement) return null
    // return this.getBlockRef(prevElement.getAttribute('block-id')!).instance
    const parent = this.getBlockById(comp.parentId!)
    const childrenIds = parent.childrenIds
    const index = childrenIds.indexOf(comp.id)
    if (index === -1) throw new BlockCraftError(ErrorCode.ModelCRUDError, `Block not found: ${id}`)
    if (index === 0) return null
    return this.getBlockById(childrenIds[index - 1])
  }

  getBlockSiblingIds<T extends BlockCraft.BlockFlavour = BlockCraft.BlockFlavour>(id: string) {
    const comp = this.getBlockById<T>(id)
    return this.vm.get(comp.parentId!)!.instance.childrenIds
  }

  getBlockSiblings(id: string | BlockCraft.BlockComponent) {
    const comp = typeof id === 'string' ? this.getBlockById(id) : id
    return this.getBlockById(comp.parentId!).getChildrenBlocks()
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
    return this.queryAncestor(block).map(b => b.id)
  }

  /**
   * compare block position between two blocks
   * @param a
   * @param b
   * @return {@link BLOCK_POSITION}
   */
  compareBlockPosition(a: string | BlockCraft.BlockComponent, b: string | BlockCraft.BlockComponent): BLOCK_POSITION {
    const aComp = typeof a === 'string' ? this.getBlockById(a) : a
    const bComp = typeof b === 'string' ? this.getBlockById(b) : b
    return aComp.hostElement.compareDocumentPosition(bComp.hostElement)
  }

  /**
   * query blocks between two blocks (only first level children)
   * @param from
   * @param to
   * @param contain whether to include the from and to blocks
   */
  queryBlocksBetween(from: string | BlockCraft.BlockComponent, to: string | BlockCraft.BlockComponent, contain = false) {
    const fromComp = typeof from === 'string' ? this.getBlockById(from) : from
    const toComp = typeof to === 'string' ? this.getBlockById(to) : to
    if (fromComp === toComp && contain) return [fromComp.id]

    const fromPath = this.getBlockPath(fromComp)
    const toPath = this.getBlockPath(toComp)
    const commonPath = getCommonPath(fromPath, toPath)
    if (!commonPath.length) return []
    const childrenPath = this.getBlockById(commonPath.at(-1)!).childrenIds
    const index1 = childrenPath.indexOf(fromPath.slice(commonPath.length)[0])
    const index2 = childrenPath.indexOf(toPath.slice(commonPath.length)[0])
    return childrenPath.slice(Math.min(index1, index2) + (contain ? 0 : 1), Math.max(index1, index2) + (contain ? 1 : 0))
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
          length: index - 1,
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
    return this.vm.get(this.rootId)?.instance.toSnapshot()
  }

  toggleTheme(name: string) {
    this.root.hostElement.setAttribute('data-theme', name)
  }

  toggleReadonly(readonly: boolean) {
    this.readonlySwitch$.next(readonly)
  }

  subscribeReadonlyChange(fn: (readonly: boolean) => void) {
    const sub = this.readonlySwitch$.subscribe(fn)
    this.addSubscription(sub)
    return sub
  }

}

export * from './crud'
export * from './vm'

declare global {
  namespace BlockCraft {
    type Doc = InstanceType<typeof BlockCraftDoc>
  }
}

/**
 * A block, b block\
 * BEFORE: b block is before a block\
 * AFTER: b block is after a block\
 * CONTAINS: b block contains a block\
 * CONTAINED_BY: a block contains b block\
 * SAME: b block and a block are the same block
 */
export enum BLOCK_POSITION {
  BEFORE = Node.DOCUMENT_POSITION_PRECEDING,
  AFTER = Node.DOCUMENT_POSITION_FOLLOWING,
  CONTAINS = Node.DOCUMENT_POSITION_CONTAINED_BY,
  CONTAINED_BY = Node.DOCUMENT_POSITION_CONTAINS,
  SAME = Node.DOCUMENT_POSITION_DISCONNECTED,
}
