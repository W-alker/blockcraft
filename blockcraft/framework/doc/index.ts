import {DocCRUD, ORIGIN_NO_RECORD} from "./crud";
import {ComponentRef, Injector, ViewContainerRef} from "@angular/core";
import {BlockCraftError, ErrorCode, Logger} from "../../global";
import {DocVM} from "./vm";
import {IBlockSnapshot} from "../block-std/types";
import {EmbedConverter, InlineManager} from "../block-std/inline";
import {ClipboardManager, InputTransformer, SelectionManager} from "../modules";
import {BehaviorSubject, Subject, take} from "rxjs";
import {UIEventDispatcher} from "../block-std/event";
import {getCommonPath} from "../utils";
import {EditableBlockComponent} from "../block-std/block";
import {DocPlugin} from "../plugin";
import {DOC_MESSAGE_SERVICE_TOKEN} from "../services";
import {DocOverlayService} from "../services";
import {DocDndService} from "../services/dnd.service";

interface DocConfig {
  docId: string
  rootId: string
  schemas: BlockCraft.SchemaManager
  logger: Logger
  injector: Injector
  theme?: string
  embeds?: [string, EmbedConverter][]
  plugins?: DocPlugin[]
  readonly?: false
}

export class BlockCraftDoc {

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
  private _inputManger = new InputTransformer(this)
  readonly clipboard = new ClipboardManager(this)

  public readonly onChildrenUpdate$ = this.crud.onChildrenUpdate$
  readonly onPropsUpdate$ = this.crud.onPropsUpdate$

  private _plugins: DocPlugin[] = []

  private _root!: BlockCraft.IBlockComponents['root']

  public readonly messageService = this.injector.get(DOC_MESSAGE_SERVICE_TOKEN)
  public readonly overlayService = new DocOverlayService(this)
  public readonly dndService = new DocDndService(this)

  get rootId() {
    return this.config.rootId
  }

  // If after init, return root, otherwise throw error
  get root() {
    if (!this.afterInit$.value) {
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

  get isActive() {
    return this._root.isActive
  }

  constructor(
    public readonly config: DocConfig
  ) {
    this._plugins = this.config.plugins || []
  }

  // init from a snapshot as root
  async init(snapShot: IBlockSnapshot, container: ViewContainerRef) {
    if (snapShot.id !== this.rootId || snapShot.flavour !== 'root') {
      throw new BlockCraftError(ErrorCode.ModelCRUDError, `Invalid root snapshot`)
    }

    const comp = await this.vm.createComponentBySnapshot(snapShot, (b) => {
      this.crud.transact(async () => {
        this.crud.yBlockMap.set(b.instance.id, b.instance.yBlock)
      }, ORIGIN_NO_RECORD)
    })
    container.insert(comp.hostView)

    // exec after init functions
    this.afterInit$.next(this._root = comp.instance as BlockCraft.IBlockComponents['root'])
    this.afterInitFnStack.forEach(fn => fn(this.root))
    this.afterInitFnStack.clear()

    // init plugins
    this._plugins.forEach(plugin => plugin.register(this))

    // listen root destroy, release all resources
    comp.instance.onDestroy$.pipe(take(1)).subscribe(() => {
      this.onDestroy$.next(true)
      this.plugins.forEach(plugin => plugin.destroy())
    })

    // init theme
    this.toggleTheme(this.config.theme || 'light')

    // init readonly
    this.readonlySwitch$.next(this.config.readonly || false)

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

  afterInit(fn: (root: BlockCraft.IBlockComponents['root']) => void) {
    this.afterInit$.value ? fn(this.root) : this.afterInitFnStack.add(fn)
  }

  onDestroy(fn: () => void) {
    this.onDestroy$.pipe(take(1)).subscribe(fn)
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

  nextSibling(id: string | BlockCraft.BlockComponent) {
    const comp = typeof id === 'string' ? this.getBlockById(id) : id
    const parent = this.getBlockById(comp.parentId!)
    const index = parent.childrenIds.indexOf(comp.id)
    if (index === -1) throw new BlockCraftError(ErrorCode.ModelCRUDError, `Block not found: ${id}`)
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
