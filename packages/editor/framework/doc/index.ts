import { DocCRUD } from "./crud";
import { ComponentRef, Injector, NgZone, ViewContainerRef } from "@angular/core";
import { BlockCraftError, ErrorCode, getScrollContainer, Logger, nextTick } from "../../global";
import { DocVM } from "./vm";
import {
  IBlockSnapshot,
  EmbedConverter,
  withDefaultEmbedConverters,
  UIEventDispatcher,
  EditableBlockComponent,
  YBlock
} from "../block-std";
import {
  ClipboardManager,
  InputTransformer,
  SelectionManager,
  ClipboardCopyFilter,
  RootVirtualizationManager,
  VirtualizationConfig,
} from "../modules";
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
import {
  BlockLockKind,
  BlockRef,
  BlockUnlockContext,
  SetBlockReadonlyOptions,
} from "./block-readonly.types";
import {writeSnapshotsToYBlockMap} from './snapshot-yblock'
import {BlockNavigationManager} from './block-navigation-manager'
import {
  BlockPlacementConfig,
  BlockPlacementManager,
} from '../services/block-placement.manager'
import {BlockObjectSizingManager} from '../services/block-object-sizing.manager'
import {DocumentViewScaleManager} from '../services/document-view-scale.manager'
import {
  BlockMutationPolicy,
  BlockMutationPolicyManager,
} from './block-mutation-policy'

export interface DocConfig {
  docId: string
  schemas: BlockCraft.SchemaManager
  logger: Logger
  injector: Injector
  yDoc: Y.Doc
  theme?: string
  embeds?: [string, EmbedConverter][]
  plugins?: DocPlugin[]
  readonly?: boolean
  /** Stable current user id used to own block locks. Omit to disable lock control. */
  currentUserId?: string
  /** Default origin for new block locks created by generic editor controls. */
  defaultBlockLockKind?: BlockLockKind
  /**
   * Additional synchronous unlock authorization. Template locks require this
   * grant even when the current user matches the persisted lock owner.
   */
  canUnlockBlock?: (context: BlockUnlockContext) => boolean
  /** Global copy filter; seeded into ClipboardManager's registry. Omit = no filtering. */
  copyFilter?: ClipboardCopyFilter
  // 如果不传递，会尝试向上遍历获取
  scrollContainer?: HTMLElement
  /** Optional root-child view virtualization. Disabled by default. */
  virtualization?: VirtualizationConfig
  /** Optional host orchestration for placement mode transitions. */
  placement?: BlockPlacementConfig
  /**
   * Optional synchronous host policy for structural, instance-meta and history
   * mutations. The policy runs before a Yjs transaction is applied.
   */
  blockMutationPolicy?: BlockMutationPolicy
}

export const Y_BLOCK_MAP_NAME = 'blocks'

const BLOCK_READONLY_FEEDBACK_MESSAGE = '内容已锁定，无法修改'
const BLOCK_READONLY_FEEDBACK_COOLDOWN_MS = 1_000
const DOC_INIT_PERFORMANCE_ALARM_MS = 300

type DocInitMethod = 'initBySnapshot' | 'initByYBlock'

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
  readonly viewScale = new DocumentViewScaleManager()
  readonly virtualization = new RootVirtualizationManager(this, this.config.virtualization)
  private readonly blockNavigation = new BlockNavigationManager(this)

  readonly onChildrenUpdate$ = this.crud.onChildrenUpdate$
  readonly onPropsUpdate$ = this.crud.onPropsUpdate$
  readonly onTextUpdate$ = this.crud.onTextUpdate$
  readonly onMetaUpdate$ = this.crud.onMetaUpdate$
  readonly readonlyManager = new BlockReadonlyManager(this)
  readonly mutationPolicy = new BlockMutationPolicyManager(this)

  private readonly _plugins: DocPlugin[] = []

  public readonly messageService = this.injector.get(DOC_MESSAGE_SERVICE_TOKEN)
  public readonly overlayService = new DocOverlayService(this)
  public readonly dndService = new DocDndService(this)
  public readonly dragController = new DocInternalDragController(this)
  public readonly placement = new BlockPlacementManager(this)
  public readonly objectSizing = new BlockObjectSizingManager(this)

  private _scrollContainer: HTMLElement | null = null

  private _subscriptions: Subscription = new Subscription()
  private _lastReadonlyFeedbackAt = Number.NEGATIVE_INFINITY
  private _subsystemsDisposed = false

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

  // The root is published before child views mount so block lifecycle hooks can
  // resolve the document during synchronous bootstrap.
  get root() {
    if (!this._root) {
      throw new BlockCraftError(ErrorCode.NoRootError, `Doc not init yet`)
    }
    return this._root
  }

  get schemas() {
    return this.config.schemas
  }

  /**
   * Model-first direct-child eligibility. Unlike SchemaManager's static query,
   * this also applies opt-in instance `meta.incl` / `meta.excl`.
   */
  canInsertChild(
    parentId: string,
    childFlavour: BlockCraft.BlockFlavour,
  ): boolean {
    const parentYBlock =
      this._yBlockMap?.get(parentId) ??
      this.model.getYBlock(parentId)
    if (!parentYBlock) return false
    const parentFlavour = parentYBlock.get('flavour')
    const parentMeta = parentYBlock.get('meta')
    if (
      typeof parentFlavour !== 'string' ||
      !(parentMeta instanceof Y.Map)
    ) {
      return false
    }
    const parentSchema = this.schemas.get(parentFlavour, false)
    if (!parentSchema) return false
    return this.schemas.isValidChildrenForInstance(
      childFlavour,
      parentSchema,
      parentMeta.toJSON() as Record<string, unknown>,
    )
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

  /**
   * Reveal and center a stable block ID without changing selection or focus.
   * Calls made before document/view initialization wait for readiness. A newer
   * request supersedes an unfinished older request.
   */
  navigateToBlock(blockId: string): Promise<boolean> {
    return this.blockNavigation.navigateToBlock(blockId)
  }

  constructor(
    public readonly config: DocConfig
  ) {
    this.config.embeds = withDefaultEmbedConverters(this.config.embeds)
    this._plugins = this.config.plugins || []
    this._bindReadonlyViolationFeedback()
    this.onDestroy(() => this._disposeSubsystems())
    this._yBlockMap = this.yDoc.getMap<YBlock>(Y_BLOCK_MAP_NAME)
  }

  private _disposeSubsystems(): void {
    if (this._subsystemsDisposed) return
    this._subsystemsDisposed = true
    this.blockNavigation.destroy()
    this.virtualization.dispose()
    this.viewScale.destroy()
    this.objectSizing.destroy()
    this.model.destroy()
    this.placement.destroy()
    this.dragController.destroy()
    this._subscriptions.unsubscribe()
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

  // init from a snapshot as root
  initBySnapshot(snapShot: IBlockSnapshot, container: HTMLElement) {
    if (this._root) return
    const startedAt = performance.now()

    if (snapShot.flavour !== 'root') {
      throw new BlockCraftError(ErrorCode.ModelCRUDError, `Invalid root snapshot`)
    }

    let yRoot!: YBlock
    const writeSnapshot = () => {
      yRoot = writeSnapshotsToYBlockMap(this.yBlockMap, [snapShot])[0]
    }
    const yDoc = this.yBlockMap.doc
    if (yDoc) yDoc.transact(writeSnapshot)
    else writeSnapshot()
    this._initByPreparedYRoot(yRoot, container, 'initBySnapshot', startedAt)
  }

  initByYBlock(yRoot: YBlock, container: HTMLElement) {
    if (this._root) return
    const startedAt = performance.now()
    if (yRoot.get('flavour') !== 'root') {
      throw new BlockCraftError(ErrorCode.DefaultFatalError, `Invalid root yBlock`)
    }

    this._initByPreparedYRoot(yRoot, container, 'initByYBlock', startedAt)
  }

  /**
   * Bootstrap both rendering modes through the same model-first root lifecycle.
   * Virtualization controls only how many root children are mounted, never when
   * child component lifecycle hooks are allowed to observe the document.
   */
  private _initByPreparedYRoot(
    yRoot: YBlock,
    container: HTMLElement,
    initMethod: DocInitMethod,
    startedAt: number,
  ): void {
    const id = yRoot.get('id')
    const sparse = this.virtualization.enabled
    const root = this.vm.createRootOnlyByYBlock(yRoot, {sparse})
    this.model.build(id)

    // Child lifecycle hooks may resolve doc.root/rootId and the model graph.
    this._root = root.instance as BlockCraft.IBlockComponents['root']

    if (!sparse) {
      // 「遇到才兜底」：完整挂载创建子树时顺便收集实际遇到的悬空引用，
      // 不增加第二次全文档扫描。CRUD observer 仍未启动，因此剪除不会按
      // 模型下标错误地同步到尚在 bootstrap 的组件树。
      const danglingRefs: {parentId: string, childId: string}[] = []
      this.vm.mountAllRootChildren((parentId, childId) => {
        danglingRefs.push({parentId, childId})
      })
      if (danglingRefs.length) this.crud.pruneChildRefs(danglingRefs)
    }

    container.append(root.location.nativeElement)
    this._initEditor(
      root.instance as BlockCraft.IBlockComponents['root'],
      initMethod,
      startedAt,
    )
  }

  private _initEditor(
    comp: BlockCraft.IBlockComponents['root'],
    initMethod?: DocInitMethod,
    startedAt?: number,
  ) {
    // Publish the configured policy before afterInit callbacks and plugins can
    // issue guarded model writes. The initial `true` only protects bootstrap.
    this.readonlySwitch$.next(this.config.readonly ?? false)

    // Establish the single root-content width source before plugins and
    // afterInit callbacks resolve responsive object geometry.
    this._root = comp
    this.objectSizing?.init(
      comp.childrenRenderRef?.containerElement ?? comp.hostElement,
    )

    // exec after init functions
    this.afterInit$.next(comp)
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
      // init theme
      this.toggleTheme(this.config.theme || 'light')
      this._scrollContainer && this.virtualization.init(this._scrollContainer)
      if (initMethod && startedAt !== undefined) {
        void this._reportDocInitAfterFirstVisibleFrame(comp, initMethod, startedAt)
      }
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

  private async _reportDocInitAfterFirstVisibleFrame(
    comp: BlockCraft.IBlockComponents['root'],
    initMethod: DocInitMethod,
    startedAt: number,
  ): Promise<void> {
    await this._waitForFirstVisibleFrame(comp.hostElement)
    if (this._root !== comp) return

    const duration = performance.now() - startedAt
    console.log(
      `%c[Async] ${initMethod}: Doc init took ${duration}ms`,
      duration > DOC_INIT_PERFORMANCE_ALARM_MS ? 'color: red; ' : '',
    )
  }

  /**
   * The first frame lets virtualization reconcile its initial viewport. The
   * second frame runs only after the browser had a paint opportunity for that
   * DOM, which is the closest local signal for the editor's first visible frame.
   */
  private _waitForFirstVisibleFrame(hostElement: HTMLElement): Promise<void> {
    const ownerWindow = hostElement.ownerDocument.defaultView
    const requestFrame = ownerWindow?.requestAnimationFrame.bind(ownerWindow)
    if (!requestFrame) return new Promise(resolve => setTimeout(resolve, 0))

    return new Promise(resolve => {
      requestFrame(() => requestFrame(() => resolve()))
    })
  }

  destroy() {
    this.blockNavigation.destroy()
    if (!this._root) {
      this._disposeSubsystems()
      return
    }
    this.vm.clear()
    this.afterInit$.next(this._root = null)
    this._disposeSubsystems()
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

  /** Resolve plain-text formatting capability without requiring a mounted view. */
  isPlainTextBlock(blockId: string): boolean {
    const retained = this.vm.get(blockId)?.instance
    if (retained instanceof EditableBlockComponent) return retained.plainTextOnly

    const flavour = this.model.getFlavour(blockId)
    if (!flavour) return false
    return this.schemas.get(flavour, false)?.metadata.plainTextOnly === true
  }

  private _getModelBlockId(block: string | BlockCraft.BlockComponent) {
    const blockId = typeof block === 'string' ? block : block.id
    if (typeof block === 'string' && !this.model.exists(blockId)) {
      throw new BlockCraftError(ErrorCode.ModelCRUDError, `Block not found: ${blockId}`)
    }
    return blockId
  }

  private _getNavigationBlock(id: string) {
    this.virtualization?.ensureViewMounted([id])
    return this.getBlockById(id)
  }

  private _getNavigableSiblingId(
    blockId: string,
    direction: 'next' | 'previous',
  ): string | null {
    const getSiblingId = direction === 'next'
      ? (id: string) => this.model.getNextSiblingId(id)
      : (id: string) => this.model.getPreviousSiblingId(id)
    let siblingId = getSiblingId(blockId)
    while (
      siblingId !== null &&
      this.placement?.isPlacementLayout?.(siblingId)
    ) {
      siblingId = getSiblingId(siblingId)
    }
    return siblingId
  }

  nextSibling(block: string | BlockCraft.BlockComponent) {
    const siblingId = this._getNavigableSiblingId(
      this._getModelBlockId(block),
      'next',
    )
    return siblingId === null ? null : this._getNavigationBlock(siblingId)
  }

  prevSibling(block: string | BlockCraft.BlockComponent) {
    const siblingId = this._getNavigableSiblingId(
      this._getModelBlockId(block),
      'previous',
    )
    return siblingId === null ? null : this._getNavigationBlock(siblingId)
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

  setBlockReadonly(
    block: BlockRef,
    readonly: boolean,
    options?: SetBlockReadonlyOptions,
  ) {
    this.readonlyManager.set(block, readonly, options)
  }

  isBlockReadonly(block: BlockRef) {
    return this.readonlyManager.isReadonly(block)
  }

  canUnlockBlock(block: BlockRef) {
    return this.readonlyManager.canUnlock(block)
  }

}

export * from './crud'
export * from './vm'
export * from './block-position'
export * from './model-graph'
export * from './block-readonly.types'
export * from './block-readonly-manager'
export * from './block-mutation-policy'

declare global {
  namespace BlockCraft {
    type Doc = InstanceType<typeof BlockCraftDoc>
  }
}
