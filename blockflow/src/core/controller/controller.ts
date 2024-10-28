import {BehaviorSubject, Subject, take, takeWhile} from "rxjs";
import {BaseStore} from "../store";
import {SchemaStore} from "../schemas";
import {IPlugin} from "../plugins";
import {BaseBlock, EditableBlock, KeyEventBus} from "../block-std";
import {
  BlockModel,
  NO_RECORD_CHANGE_SIGNAL,
  syncBlockModelChildren,
  UpdateEvent,
  USER_CHANGE_SIGNAL,
  YBlockModel
} from "../yjs";
import {EditorRoot} from "../block-render";
import {Injector} from "@angular/core";
import {StackItemEvent} from "yjs/dist/src/utils/UndoManager";
import {IBlockFlavour, IBlockModel} from "../types";
import {IBlockFlowRange} from "./type";
import {CharacterIndex, genUniqueID, getCurrentCharacterRange} from "../utils";
import {IOrderedListBlockModel, updateOrderAround} from "../../blocks";
import Y from "../yjs";

export interface HistoryConfig {
  open: boolean
  duration?: number,
}

export interface IControllerConfig {
  rootId: string
  schemas: SchemaStore
  readonly?: boolean
  historyConfig?: HistoryConfig
  plugins?: IPlugin[],
  localUser?: {
    userId: string
    userName: string
  }
}

export class Controller {
  public readonly readonly$ = new BehaviorSubject(false)

  public readonly blockUpdate$ = new Subject<UpdateEvent & {block: BaseBlock}>()
  private blockRefStore = new BaseStore<string, BaseBlock | EditableBlock>()
  private blocksWaiting: Record<string, boolean> = {}
  private blocksReady$ = new Subject()

  public readonly rootModel: BlockModel[] = []
  public readonly yDoc = new Y.Doc({gc: false, guid: this.config.rootId})
  public readonly rootYModel = this.yDoc.getArray<YBlockModel>(this.rootId)
  private _rootYModelObserver = (event: Y.YArrayEvent<YBlockModel>, tr: Y.Transaction) => {
    if (tr.origin === USER_CHANGE_SIGNAL || tr.origin === NO_RECORD_CHANGE_SIGNAL) return
    const {path, target, changes} = event
    syncBlockModelChildren(changes.delta as any[], this.rootModel as BlockModel[])
  }

  public readonly historyManager?: Y.UndoManager
  public readonly undoRedo$ = new BehaviorSubject<boolean>(false)

  public readonly keyEventBus: KeyEventBus = new KeyEventBus(this)

  private _root!: EditorRoot

  constructor(
    public readonly config: IControllerConfig,
    public readonly injector: Injector
  ) {
    const {historyConfig = {open: true, duration: 300}} = config
    this.readonly$.next(config.readonly || false)
    if (historyConfig.open) {
      this.historyManager = new Y.UndoManager(this.rootYModel,
        {captureTimeout: historyConfig.duration || 200, trackedOrigins: new Set([null, USER_CHANGE_SIGNAL])})
    }

    this.rootYModel.observe(this._rootYModelObserver)
  }

  attach(root: EditorRoot) {
    return new Promise(resolve => {
      root.ready$.pipe(take(2)).subscribe(v => {
        if (!v) return
        this._root = root
        root.setController(this)
        this.addPlugins(this.config.plugins || [])
        resolve(true)
      })
    })
  }

  addPlugins(plugins: IPlugin[]) {
    if (!plugins.length) return
    this.root.ready$.pipe(takeWhile(v => v)).subscribe(v => {
      if (!v) return
      plugins.forEach(plugin => plugin.init(this))
    })
    this.root.onDestroy.pipe(take(1)).subscribe(() => {
      plugins.forEach(plugin => {
        plugin.destroy()
      })
    })
  }

  toggleReadonly(bol = true) {
    this.readonly$.next(bol)
  }

  get schemas() {
    return this.config.schemas
  }

  get root() {
    return this._root
  }

  get rootElement() {
    return this.root.rootElement
  }

  get rootId() {
    return this.config.rootId
  }

  toJSON() {
    return this.rootYModel.toJSON() as IBlockModel[]
  }

  /**
   * Just store block instance when it rendered
   * @param blockRef block instance
   */
  storeBlockRef<B extends BaseBlock>(blockRef: B) {
    this.blockRefStore.set(blockRef.id, blockRef)
    for (const key in this.blocksWaiting) {
      if (key === blockRef.id) this.blocksWaiting[key] = true
      if (!this.blocksWaiting[key]) return
    }
    this.blocksReady$.next(true)
  }

  /** ---------------history---------------- start **/
  transact(fn: () => void, origin: any = null) {
    this.yDoc.transact(fn, origin)
  }

  stopCapturing() {
    this.historyManager?.stopCapturing()
  }

  observeUndoRedo(type: 'stack-item-added' | 'stack-item-popped', fn: (stackItem: StackItemEvent) => void) {
    if (!this.historyManager) throw new Error('History manager not initialized')
    this.historyManager.on(type, fn)
  }

  undo() {
    if (!this.historyManager?.canUndo()) return
    if (this.undoRedo$.value) return
    this.undoRedo$.next(true)
    this.historyManager!.undo()
    Promise.resolve().then(() => {
      this.undoRedo$.next(false)
      // 临时方案，解决撤销后焦点丢失问题
      requestAnimationFrame(() => {
        if (!this.activeElement || document.activeElement === document.body) this.rootElement.focus({preventScroll: true})
      })
    })
  }

  redo() {
    if (!this.historyManager?.canRedo()) return
    if (this.undoRedo$.value) return
    this.undoRedo$.next(true)
    this.historyManager!.redo()
    Promise.resolve().then(() => this.undoRedo$.next(false))
  }

  /** ---------------history---------------- end **/

  /** ---------------block operation---------------- start **/
  getBlockModel(id: string) {
    return this.getBlockRef(id)?.model
  }

  createBlock(flavour: IBlockFlavour, params?: any[]) {
    const b = this.config.schemas.create(flavour, params)
    b.meta = {
      ...b.meta,
      createdTime: Date.now(),
      lastModified: {
        time: Date.now(),
        ...this.config.localUser
      }
    }
    return BlockModel.fromModel(b)
  }

  insertBlocks(index: number, blocks: BlockModel[], parentId: string = this.rootId, unRecord = false) {
    blocks.forEach(b => {
      this.blocksWaiting[b.id] = false
    })
    return new Promise((resolve, reject) => {
      if (parentId === this.rootId) {
        this.transact(() => {
          this.rootModel.splice(index, 0, ...blocks)
          this.rootYModel.insert(index, blocks.map(b => b.yModel))
        }, unRecord ? NO_RECORD_CHANGE_SIGNAL : USER_CHANGE_SIGNAL)
      } else {
        const parentModel = this.getBlockRef(parentId)?.model
        if (!parentModel) return reject(new Error(`Parent block ${parentId} not found`))

        this.transact(() => {
          parentModel.insertChildren(index, blocks)
        }, unRecord ? NO_RECORD_CHANGE_SIGNAL : USER_CHANGE_SIGNAL)

      }

      const olIndex = blocks.findIndex(b => b.flavour === 'ordered-list')
      if (olIndex >= 0) this.updateOrderAround(blocks[olIndex] as any)

      this.blocksReady$.pipe(take(1)).subscribe(v => requestAnimationFrame(resolve))
    })
  }

  deleteBlocks(index: number, count: number, parentId: string = this.rootId) {
    if (count <= 0) return
    if (parentId === this.rootId) {
      this.transact(() => {
        const items = this.rootModel.splice(index, count)
        this.rootYModel.delete(index, count)

        if (items.some(b => b.flavour === 'ordered-list')) {
          const olIndex = this.rootModel.findIndex((b, i) => i >= index && b.flavour === 'ordered-list')
          if (olIndex >= 0) this.updateOrderAround(this.rootModel[olIndex] as any)
        }

      }, USER_CHANGE_SIGNAL)

      return
    }
    const parentModel = this.getBlockModel(parentId)
    if (!parentModel) throw new Error(`Parent block ${parentId} not found`)
    parentModel.deleteChildren(index, count)

  }

  deleteBlockById(id: string) {
    const path = this.getBlockPosition(id)
    const {index, parentId} = path
    return this.deleteBlocks(index, 1, parentId)
  }

  replaceWith(id: string, newBlock: BlockModel) {
    const {index, parentId} = this.getBlockPosition(id)!
    // console.log('replaceWith', index, parentId, id, newBlock)
    return new Promise((resolve) => {
      this.transact(() => {
        this.deleteBlocks(index, 1, parentId)
        this.insertBlocks(index, [newBlock], parentId).then(resolve)
      }, USER_CHANGE_SIGNAL)
    })
  }

  moveBlock(origin: string, target: string, position: 'before' | 'after') {
    const originModel = this.getBlockRef(origin)!.model
    const targetModel = this.getBlockRef(target)!.model

    const originPos = originModel.getPosition()
    const targetPos = targetModel.getPosition()

    if (originPos.parentId === targetPos.parentId &&
      ((originPos.index === targetPos.index) ||
        (position === 'before' && originPos.index === targetPos.index - 1) ||
        (position === 'after' && originPos.index === targetPos.index + 1))
    ) return

    // console.log(originModel, targetModel)

    // const originParent = originModel.yModel.parent as Y.Array<YBlockModel>
    // const targetParent = targetModel.yModel.parent as Y.Array<YBlockModel>

    const insertIndex = position === 'before'
      ? (originPos.index < targetPos.index ? targetPos.index - 1 : targetPos.index)
      : (originPos.index < targetPos.index ? targetPos.index : targetPos.index + 1)

    const ym = originModel.toJSON() as IBlockModel
    ym.id = genUniqueID()

    // TODO: 优化，允许跨父级移动
    this.deleteBlocks(originPos.index, 1)
    this.insertBlocks(insertIndex, [BlockModel.fromModel(ym)])
  }

  /** ---------------block operation---------------- end **/

  /** ---------------query block---------------- start **/
  get firstBlock() {
    return this.rootModel[0]
  }

  get lastBlock() {
    return this.rootModel[this.rootModel.length - 1]
  }


  getBlockPosition(id: string) {
    const bRef = this.getBlockRef(id)
    if (!bRef) throw new Error(`Block ${id} not found`)
    const position = bRef.model.getPosition()
    return {parentId: position.parentId || this.rootId, index: position.index}
  }

  getBlockRef(id: string) {
    return this.blockRefStore.get(id)
  }

  findPrevEditableBlockModel(id: string) {
    const {index, parentId} = this.getBlockPosition(id)!
    const mc = parentId === this.rootId ? this.rootModel : this.getBlockModel(parentId)!.children as BlockModel[]
    let p = index - 1
    while (p >= 0) {
      const prev = mc[p]
      if (this.isEditableBlock(prev)) return prev
      p--
    }
    return null
  }

  findPrevEditableBlock(id: string): EditableBlock | null {
    const prev = this.findPrevEditableBlockModel(id)
    if (!prev) return null
    return this.getBlockRef(prev.id) as EditableBlock
  }

  findNextBlockModel(id: string) {
    const {index, parentId} = this.getBlockPosition(id)!
    const mc = parentId === this.rootId ? this.rootModel : this.getBlockModel(parentId)!.children as BlockModel[]
    if (index >= mc.length - 1) return null
    return mc[index + 1]
  }

  findNextEditableBlockModel(id: string) {
    const {index, parentId} = this.getBlockPosition(id)!
    const mc = parentId === this.rootId ? this.rootModel : this.getBlockModel(parentId)!.children as BlockModel[]
    let p = index + 1
    while (p <= mc.length - 1) {
      const next = mc[p]
      if (this.isEditableBlock(next)) return next
      p++
    }
    return null
  }

  findNextEditableBlock(id: string): EditableBlock | null {
    const next = this.findNextEditableBlockModel(id)
    if (!next) return null
    return this.getBlockRef(next.id) as EditableBlock
  }

  /** ---------------query block---------------- end **/


  /** ---------------focus , selection---------------- start **/
  get activeElement() {
    return this.root.activeElement
  }

  isEditableBlock(b: string | BlockModel | BaseBlock | EditableBlock) {
    return typeof b === 'string' ? this.getBlockModel(b)?.nodeType === 'editable' : b.nodeType === 'editable'
  }

  getSelection(): IBlockFlowRange | null {
    if (!this.root.activeElement) return null
    if (this.root.activeElement === this.rootElement) {
      return {
        rootRange: this.root.selectedBlockRange,
        isAtRoot: true,
        rootId: this.rootId
      }
    }
    return {
      blockRange: getCurrentCharacterRange(),
      isAtRoot: false,
      blockId: this.getFocusingBlockId()!
    }
  }

  getFocusingBlockId() {
    return this.root.getActiveBlockId()
  }

  getFocusingBlockRef() {
    const id = this.getFocusingBlockId()
    if (!id) return null
    return this.getBlockRef(id) as EditableBlock
  }

  setSelection(target: string | EditableBlock, from: CharacterIndex, to?: CharacterIndex) {
    if (target === this.rootId) {
      this.root.selectBlocks(from, to ?? from)
    } else {
      const bRef = typeof target === 'string' ? this.getBlockRef(target) : target
      if (!bRef || !(bRef instanceof EditableBlock)) return
      bRef.setSelection(from, to ?? from)
    }
  }

  deleteSelectedBlocks() {
    if (!this.root.selectedBlockRange) return
    const {start, end} = this.root.selectedBlockRange
    this.deleteBlocks(start, end - start + 1)
    this.root.clearSelectedBlocks()
  }

  /** ---------------focus , selection---------------- end **/

  /** ---------------For ordered-list block---------------- start **/
  updateOrderAround(block: BlockModel<IOrderedListBlockModel>) {
    this.transact(() => {
      updateOrderAround(block, this)
    }, USER_CHANGE_SIGNAL)
  }

  /** ---------------For ordered-list block---------------- end **/
}
