import {DocCRUD, ORIGIN_NO_RECORD} from "./crud";
import {ComponentRef, Injector, ViewContainerRef} from "@angular/core";
import {BlockCraftError, ErrorCode, Logger} from "../../global";
import {DocVM} from "./vm";
import {IBlockSnapshot} from "../types";
import {EmbedConverter, InlineManager} from "../inline";
import {InputTransformer} from "../modules";
import {BehaviorSubject, take} from "rxjs";

interface DocConfig {
  docId: string
  rootId: string
  schemas: BlockCraft.SchemaManager
  logger: Logger
  injector: Injector
  embeds?: [string, EmbedConverter][]
}

export class BlockCraftDoc {

  private afterInitFnStack = new Set<() => void>()
  public readonly afterInit$ = new BehaviorSubject<BlockCraft.IBlockComponents['root'] | null>(null)
  public readonly onDestroy$ = new BehaviorSubject(false)

  readonly crud = new DocCRUD(this)
  readonly vm = new DocVM(this)
  readonly inlineManager = new InlineManager(this)
  private _inputManger = new InputTransformer(this)

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
    this.afterInitFnStack.forEach(fn => fn())
    this.afterInitFnStack.clear()

    // listen root destroy, release all resources
    comp.instance.onDestroy$.pipe(take(1)).subscribe(() => {
      this.onDestroy$.next(true)
    })
  }

  afterInit(fn: () => void) {
    this.afterInit$.value ? fn() : this.afterInitFnStack.add(fn)
  }

  getBlockRef<T extends BlockCraft.BlockFlavour = BlockCraft.BlockFlavour>(id: string) {
    const block = this.vm.get(id)
    if (!block) throw new BlockCraftError(ErrorCode.ModelCRUDError, `Block not found: ${id}`)
    return block as ComponentRef<BlockCraft.IBlockComponents[T]>
  }

  getBlockById<T extends BlockCraft.BlockFlavour = BlockCraft.BlockFlavour>(id: string) {
    return this.getBlockRef<T>(id).instance
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

  compareBlockPosition(a: string | BlockCraft.BlockComponent, b: string | BlockCraft.BlockComponent): BLOCK_POSITION {
    const aComp = typeof a === 'string' ? this.getBlockById(a) : a
    const bComp = typeof b === 'string' ? this.getBlockById(b) : b
    return aComp.hostElement.compareDocumentPosition(bComp.hostElement)
  }

  exportSnapshot() {
    return this.vm.get(this.rootId)?.instance.toSnapshot()
  }

}

export * from './crud'
export * from './vm'

declare global {
  namespace BlockCraft {
    type Doc = InstanceType<typeof BlockCraftDoc>
  }
}

export enum BLOCK_POSITION {
  BEFORE = Node.DOCUMENT_POSITION_PRECEDING,
  FOLLOWING = Node.DOCUMENT_POSITION_FOLLOWING,
  CONTAINS = Node.DOCUMENT_POSITION_CONTAINED_BY,
  CONTAINED_BY = Node.DOCUMENT_POSITION_CONTAINS,
  SAME = Node.DOCUMENT_POSITION_DISCONNECTED,
}
