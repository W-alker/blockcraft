import {DocCRUD, ORIGIN_NO_RECORD} from "./crud";
import {ComponentRef, Injector, ViewContainerRef} from "@angular/core";
import {BlockCraftError, ErrorCode, Logger} from "../../global";
import {DocVM} from "./vm";
import {IBlockSnapshot} from "../types";
import {EmbedConverter, InlineManager} from "../inline";
import {ClipboardManager, InputTransformer, SelectionManager} from "../modules";
import {BehaviorSubject, take} from "rxjs";
import {UIEventDispatcher} from "../event";
import {getCommonPath} from "../utils";
import {EditableBlockComponent} from "../block";
import {DocPlugin} from "../plugin";

interface DocConfig {
  docId: string
  rootId: string
  schemas: BlockCraft.SchemaManager
  logger: Logger
  injector: Injector
  theme?: string
  embeds?: [string, EmbedConverter][]
  plugins?: DocPlugin[]
}

export class BlockCraftDoc {

  private afterInitFnStack = new Set<(root: BlockCraft.IBlockComponents['root']) => void>()
  public readonly afterInit$ = new BehaviorSubject<BlockCraft.IBlockComponents['root'] | null>(null)
  public readonly onDestroy$ = new BehaviorSubject(false)

  readonly crud = new DocCRUD(this)
  readonly vm = new DocVM(this)
  readonly inlineManager = new InlineManager(this)
  readonly selection = new SelectionManager(this)
  readonly event = new UIEventDispatcher(this)
  private _inputManger = new InputTransformer(this)
  readonly clipboard = new ClipboardManager(this)

  public readonly onChildrenUpdate$ = this.crud.onChildrenUpdate$
  readonly onPropsUpdate$ = this.crud.onPropsUpdate$

  private _root!: BlockCraft.IBlockComponents['root']

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
    return this.config.plugins || []
  }

  get isActive() {
    return this._root.isActive
  }

  constructor(
    public readonly config: DocConfig
  ) {
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

    this.afterInit$.next(this._root = comp.instance as BlockCraft.IBlockComponents['root'])
    this.afterInitFnStack.forEach(fn => fn(this.root))
    this.afterInitFnStack.clear()

    this.plugins.forEach(plugin => plugin.loadDoc(this))

    // listen root destroy, release all resources
    comp.instance.onDestroy$.pipe(take(1)).subscribe(() => {
      this.onDestroy$.next(true)
      this.plugins.forEach(plugin => plugin.destroy())
    })

    this.toggleTheme(this.config.theme || 'light')

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

  getBlockRef<T extends BlockCraft.BlockFlavour = BlockCraft.BlockFlavour>(id: string) {
    const block = this.vm.get(id)
    if (!block) throw new BlockCraftError(ErrorCode.ModelCRUDError, `Block not found: ${id}`)
    return block as ComponentRef<BlockCraft.IBlockComponents[T]>
  }

  getBlockById<T extends BlockCraft.BlockFlavour = BlockCraft.BlockFlavour>(id: string) {
    return this.getBlockRef<T>(id).instance
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
    const parent = this.getBlockById(comp.parentId!)
    const index = parent.childrenIds.indexOf(comp.id)
    if (index === -1) throw new BlockCraftError(ErrorCode.ModelCRUDError, `Block not found: ${id}`)
    if (index === 0) return null
    return this.getBlockById(parent.childrenIds[index - 1])
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
    const fromPath = this.getBlockPath(fromComp)
    const toPath = this.getBlockPath(toComp)
    const commonPath = getCommonPath(fromPath, toPath)
    if (!commonPath.length) return []
    const childrenPath = this.getBlockById(commonPath.at(-1)!).childrenIds
    const index1 = childrenPath.indexOf(fromComp.id)
    const index2 = childrenPath.indexOf(toComp.id)
    return childrenPath.slice(Math.min(index1, index2) + (contain ? 0 : 1), Math.max(index1, index2) + (contain ? 1 : 0))
  }

  // block tree下，两个block经过的block集合
  queryBlocksThroughPathDeeply(from: string | BlockCraft.BlockComponent, to: string | BlockCraft.BlockComponent) {
    const fromComp = typeof from === 'string' ? this.getBlockById(from) : from
    const toComp = typeof to === 'string' ? this.getBlockById(to) : to

    const list: { parent: string, index: number, length: number }[] = []

    const fromPath = this.getBlockPath(fromComp)
    const toPath = this.getBlockPath(toComp)

    // 递归查找
    const collect = (path1: string[], path2: string[]) => {
      if (path1.length === 0 || path2.length === 0) return
      const commonPath = getCommonPath(path1, path2)
      if (commonPath.length === 0) return
      const commonPathElement = commonPath[commonPath.length - 1]
      const childrenPath = this.getBlockById(commonPathElement).childrenIds
      if (childrenPath.length === 0) return
      const path1Index = childrenPath.indexOf(path1[commonPath.length])
      const path2Index = childrenPath.indexOf(path2[commonPath.length])
      const len = Math.abs(path1Index - path2Index)
      if (len <= 1) return
      list.push({
        parent: commonPathElement,
        index: Math.min(path1Index, path2Index) + 1,
        length: len - 1
      })
      collect(path1.slice(commonPath.length), path2.slice(commonPath.length))
    }

    collect(fromPath, toPath)
    return list
  }

  closetBlockId(node: Node) {
    return (node instanceof HTMLElement ? node : node.parentElement)?.closest('[data-block-id]')?.getAttribute('data-block-id')
  }

  exportSnapshot() {
    return this.vm.get(this.rootId)?.instance.toSnapshot()
  }

  toggleTheme(name: string) {
    this.root.hostElement.setAttribute('data-theme', name)
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
