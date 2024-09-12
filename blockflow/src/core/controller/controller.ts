import {BlockFlowDoc, ModelSyncer, YBlockModel} from "@core/yjs";
import {IBlockFlowRange} from "@core/controller/type";
import {DeltaOperation, IBlockFlavour, IBlockModel} from "@core/types";
import {
  CharacterIndex,
  genUniqueID, getCurrentCharacterRange,
  setSelection,
} from "@core/utils";
import {BaseBlock, EditableBlock, KeyEventBus} from "@core/block-std";
import {BaseStore} from "@core/store";
import {BehaviorSubject, take} from "rxjs";
import {StackItemEvent} from "yjs/dist/src/utils/UndoManager";
import Y from "@core/yjs";
import {IPlugin} from "@core/plugins";
import {EditorRoot} from "@core/block-render";
import {SchemaStore} from "@core/schemas";
import {ApplicationRef, ComponentFactoryResolver, Injector, ViewContainerRef} from "@angular/core";

export interface HistoryConfig {
  open: boolean
  duration?: number,
}

export interface IControllerConfig {
  rootId: string
  schemas: SchemaStore
  historyConfig?: HistoryConfig
  plugins?: IPlugin[],
}

export const USER_INPUT_ORIGIN = Symbol('user-input-origin')

export class Controller {
  public readonly readonly$ = new BehaviorSubject(false)

  private blockRefStore = new BaseStore<string, BaseBlock>()
  private blocksWaiting: Record<string, boolean> = {}
  private blocksReady$ = new BehaviorSubject(false)

  private readonly historyManager?: Y.UndoManager
  public readonly undoRedo$ = new BehaviorSubject<boolean>(false)

  public readonly docManager: BlockFlowDoc = new BlockFlowDoc({rootId: this.config.rootId})
  public readonly keyEventBus: KeyEventBus = new KeyEventBus(this)

  private _root!: EditorRoot
  private _componentFactory = this.injector.get(ComponentFactoryResolver)
  private _appRef = this.injector.get(ApplicationRef)

  constructor(
    private readonly config: IControllerConfig,
    public readonly injector: Injector
  ) {
    const {historyConfig = {open: true, duration: 500}} = config
    if (historyConfig.open) {
      this.historyManager = new Y.UndoManager(this.docManager.rootYModel,
        {captureTimeout: historyConfig.duration || 300, trackedOrigins: new Set([null, USER_INPUT_ORIGIN])})
    }

    this.docManager.rootYModel.observeDeep((e, tr) => {
      // console.log('YEvent=============', e.map(ev => ev.target))
      // console.log('YEvent=============', tr)
      if (!this.undoRedo$.value) return
      this.syncYEventUpdate(e, tr)
      this.undoRedo$.next(false)

      requestAnimationFrame(() => {
        if (!this.activeElement || document.activeElement === document.body) this.rootElement.focus()
      })
    })
  }

  attach(root: EditorRoot) {
    return new Promise(resolve => {
      root.onDestroy.pipe(take(1)).subscribe(() => {
        this.config.plugins?.forEach(plugin => {
          plugin.destroy()
        })
      })

      root.ready$.pipe(take(2)).subscribe(v => {
        if (!v) return
        this._root = root
        root.setController(this)
        this.config.plugins?.forEach(plugin => {
          plugin.init(this)
        })
        resolve(true)
      })
    })
  }

  private getBlockRefByYText(yText: Y.Text) {
    const parentId = (yText.parent as Y.Map<any>).get('id')
    console.log('parentId', parentId, this.blockRefStore)
    return this.getBlockRef(parentId) as EditableBlock | undefined
  }

  /**
   * special method for sync yjs change event to model
   * @param e YEvent
   * @param tr Transaction
   */
  syncYEventUpdate(e: Y.YEvent<any>[], tr: Y.Transaction) {
    e.forEach(event => {
      // editable-block is not view-model, need to update view manually
      if (event.target instanceof Y.Text) {
        console.log('event.target', event.target)
        // if (tr.origin === USER_INPUT_ORIGIN) return  // user input
        this.getBlockRefByYText(event.target)!.applyDeltaToView(event.changes.delta as DeltaOperation[], this.undoRedo$.value)  // Just set selection when undo/redo
      }
      this.docManager.applyYChangeToModel(event)
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
    return this.docManager.rootId
  }

  get rootModel() {
    return this.docManager.rootModel
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
    this.docManager.transact(fn, origin)
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
  }

  redo() {
    if (!this.historyManager?.canRedo()) return
    if (this.undoRedo$.value) return
    this.undoRedo$.next(true)
    this.historyManager!.redo()
  }

  /** ---------------history---------------- end **/

  /** ---------------block operation---------------- end **/
  applyDeltaToEditableBlock(target: string | EditableBlock, delta: DeltaOperation[], setSelection = true) {
    const blockRef = typeof target === 'string' ? this.getBlockRef(target) : target
    if (!blockRef || !(blockRef instanceof EditableBlock)) return
    blockRef.applyDeltaToModel(delta)
    blockRef.applyDeltaToView(delta, setSelection)
  }

  createBlock(flavour: IBlockFlavour, params?: any[]) {
    return this.config.schemas.create(flavour, params)
  }

  createBlockView(vcr: ViewContainerRef, block: IBlockModel) {
    const schema = this.config.schemas.get(block.flavour)
    if (!schema) throw new Error(`Schema not found for flavour ${block.flavour}`)
    const cpr = vcr.createComponent(schema.render)
    cpr.setInput('model', block)
    cpr.setInput('controller', this)
    cpr.changeDetectorRef.detectChanges()
    return cpr
  }

  insertBlocks(index: number, blocks: IBlockModel[], parentId: string = this.rootId) {
    this.blocksReady$.next(false)
    this.blocksWaiting = blocks.map(b => ({[b.id]: false})).reduce((a, b) => ({...a, ...b}), {})

    return new Promise((resolve, reject) => {
      this.docManager.insertBlocks(index, blocks, parentId)
      this.blocksReady$.subscribe(ready => {
        if (ready) resolve(this.blocksWaiting = {})
      })
    })
  }

  deleteBlocks(index: number, count: number, parentId: string = this.rootId) {
    return this.docManager.deleteBlocks(index, count, parentId)
  }

  deleteBlockById(id: string) {
    const path = this.getBlockPosition(id)
    if (!path) throw new Error(`Block ${id} not found`)
    const {index, parentId} = path
    return this.deleteBlocks(index, 1, parentId)
  }

  replaceWith(id: string, newBlock: IBlockModel) {
    const {index, parentId} = this.getBlockPosition(id)!
    console.log('replaceWith', index, parentId, id, newBlock)
    return new Promise((resolve) => {
      this.transact(() => {
        this.deleteBlocks(index, 1, parentId)
        this.insertBlocks(index, [newBlock], parentId).then(resolve)
      })
    })
  }

  moveBlock(origin: string, target: string, position: 'before' | 'after') {
    const originPos = this.getBlockPosition(origin)!
    const targetPos = this.getBlockPosition(target)!
    console.log(targetPos, originPos)

    // const originParentChildren = this.getBlockChildren(originPos.parentId)
    // const targetParentChildren = this.getBlockChildren(targetPos.parentId)

    const insertIndex = position === 'before'
      ? (originPos.index < targetPos.index ? targetPos.index - 1 : targetPos.index)
      : (originPos.index < targetPos.index ? targetPos.index : targetPos.index + 1)

    this.transact(() => {
      const m = this.docManager.queryYBlockModel(origin)!.toJSON() as IBlockModel
      console.log(m)
      this.deleteBlockById(origin)
      this.insertBlocks(insertIndex, [m], targetPos.parentId).then(() => {
        this.root.cdr.detectChanges()
      })
      // const originBlock = originParentChildren.m.slice(originPos.index, originPos.index + 1)[0]
      // const yOriginBlock = originParentChildren.y.get(originPos.index).clone()
      // console.log('originBlock+++++++++++', originBlock, yOriginBlock, targetParentChildren)
      // originParentChildren.y.delete(originPos.index, 1)
      // originParentChildren.m.splice(originPos.index, 1)
      //
      // targetParentChildren.y.insert(insertIndex, [yOriginBlock])
      // targetParentChildren.m.splice(insertIndex, 0, originBlock)
    })
  }

  private getBlockChildren(id: string) {
    const res = {} as { m: IBlockModel[], y: Y.Array<YBlockModel> }
    if (id === this.rootId) {
      res.m = this.rootModel
      res.y = this.docManager.rootYModel
    } else {
      const parent = this.docManager.queryModel(id)!
      res.m = parent.m.children as IBlockModel[]
      res.y = parent.y.get('children') as Y.Array<YBlockModel>
    }
    return res
  }

  duplicateBlockById(id: string) {
    const bm = JSON.parse(JSON.stringify(this.docManager.queryBlockModel(id))) as IBlockModel
    bm.id = genUniqueID()
    const {parentId, index} = this.getBlockPosition(id)!
    // @ts-ignore
    return this.insertBlocks(index + 1, [bm], parentId)
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
    return this.docManager.queryBlockIndexAndParentId(id)
  }

  getBlockRef(id: string) {
    return this.blockRefStore.get(id)
  }

  getEditableBlockYText(id: string) {
    const ym = this.docManager.queryYBlockModel(id)?.get('children')
    if (!ym || !(ym instanceof Y.Text)) throw new Error(`Can not find Y.Text for block ${id}`)
    return ym
  }

  findPrevBlockModel(id: string): IBlockModel | null {
    const {index, parentId} = this.getBlockPosition(id)!
    if (index <= 0) return null
    const mc = parentId === this.rootId ? this.rootModel : this.docManager.queryBlockModel(parentId)!.children as IBlockModel[]
    return mc[index - 1]
  }

  findPrevEditableBlockModel(id: string): IBlockModel | null {
    const {index, parentId} = this.getBlockPosition(id)!
    const mc = parentId === this.rootId ? this.rootModel : this.docManager.queryBlockModel(parentId)!.children as IBlockModel[]
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

  findNextBlockModel(id: string): IBlockModel | null {
    const {index, parentId} = this.getBlockPosition(id)!
    const mc = parentId === this.rootId ? this.rootModel : this.docManager.queryBlockModel(parentId)!.children as IBlockModel[]
    if (index >= mc.length - 1) return null
    return mc[index + 1]
  }

  findNextEditableBlockModel(id: string): IBlockModel | null {
    const {index, parentId} = this.getBlockPosition(id)!
    const mc = parentId === this.rootId ? this.rootModel : this.docManager.queryBlockModel(parentId)!.children as IBlockModel[]
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

  isEditableBlock(b: string | IBlockModel | BaseBlock) {
    return typeof b === 'string' ? this.docManager.queryBlockModel(b)?.nodeType === 'editable' : b.nodeType === 'editable'
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
      if (!bRef || !this.isEditableBlock(bRef)) return
      if (from === 'start' && to === 'end')
        document.getSelection()!.getRangeAt(0).selectNodeContents((bRef as EditableBlock).containerEle)
      else setSelection((bRef as EditableBlock).containerEle, from, to || from)
    }
  }

  deleteSelectedBlocks() {
    if (!this.root.selectedBlockRange) return
    const {start, end} = this.root.selectedBlockRange
    this.transact(() => {
      this.deleteBlocks(start, end - start + 1)
      this.root.clearSelectedBlocks()
    })
  }

  /** ---------------focus , selection---------------- end **/

}
