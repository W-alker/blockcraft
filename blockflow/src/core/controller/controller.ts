import {BlockFlowDoc} from "@core/yjs";
import {IBlockFlowRange, IBlockModelMap} from "@core/controller/type";
import {DeltaOperation, IBlockModel} from "@core/types";
import {createBlock} from "./createBlock";
import {
  CharacterIndex,
  characterIndex2Number,
  genUniqueID,
  getRange, ICharacterRange,
  replaceSelectionInView,
  setRange
} from "@core/utils";
import {BaseBlock, EditableBlock, KeyEventBus} from "@core/block-std";
import {BaseStore} from "@core/store";
import {BehaviorSubject, take} from "rxjs";
import {StackItemEvent} from "yjs/dist/src/utils/UndoManager";
import Y from "@core/yjs";
import {IPlugin} from "@core/plugin";
import {BlockSelection} from "@core/modules";
import {EditorRoot} from "@core/block-render";
import {SchemaStore} from "@core/schemas";
import {WebsocketProvider} from "y-websocket";

export interface HistoryConfig {
  open: boolean
  duration?: number,
}

export interface IControllerConfig {
  rootId: string
  schemas: SchemaStore
  initModel?: IBlockModel[]
  historyConfig?: HistoryConfig
  plugins?: IPlugin[]
}

// A hack to check correct view when NG100 error happened.
export const markCheck = () => requestAnimationFrame(() => {
})

export class Controller<BMap extends IBlockModelMap = IBlockModelMap> {
  public readonly readonly$ = new BehaviorSubject(false)

  private blockRefStore = new BaseStore<BaseBlock>()
  private blocksWaiting: Record<string, boolean> = {}
  private blocksReady$ = new BehaviorSubject(false)

  private readonly historyManager?: Y.UndoManager
  public readonly undoRedo$ = new BehaviorSubject<boolean>(false)

  public readonly docManager: BlockFlowDoc = new BlockFlowDoc({
    rootId: this.config.rootId,
    stopSyncSign: this.undoRedo$
  })

  public readonly keyEventBus: KeyEventBus = new KeyEventBus(this)

  private blockSelection!: BlockSelection
  private selectedBlockRange: ICharacterRange | undefined = {start: 0, end: 0}
  private _root!: EditorRoot<BMap>

  constructor(
    private readonly config: IControllerConfig,
  ) {
    const {historyConfig = {open: true, duration: 500}, initModel} = config
    if (historyConfig.open) {
      this.historyManager = new Y.UndoManager(this.docManager.rootYModel,
        {captureTimeout: historyConfig.duration || 300, trackedOrigins: new Set([null])})

      this.docManager.rootYModel.observeDeep((e) => {
        // console.log('observeDeep', e.length)
        if (!this.undoRedo$.value) return
        this.transact(() => {
          e.forEach((ev) => this.syncYEventUpdate(ev))
          this.undoRedo$.next(false)
        }, Symbol('undo'))
      })
    }

    // if (initModel?.length) {
    //   this.transact(() => {
    //     this.insertBlocks(0, initModel as any)
    //   }, Symbol('init'))
    // }
  }

  attach(root: EditorRoot<BMap>) {
    root.ready$.pipe(take(2)).subscribe(v => {
      if (!v) return
      this._root = root
      root.setController(this)
      this.initBlockSelection()
      this.initPlugins()
    })
  }

  private initPlugins() {
    this.config.plugins?.forEach(plugin => {
      plugin.init(this)
    })
  }

  private initBlockSelection() {
    this.blockSelection = new BlockSelection({
      host: this.rootElement,
      document: document,
      enable: this.readonly$.value,
      onlyLeftButton: true,
      selectable: "[bf-block-wrap]",
      selectionAreaClass: "selection-area",
      sensitivity: 40,
      onItemSelect: (element) => {
        element.classList.add('bf-block-selected')
      },
      onItemUnselect: (element) => {
        element.classList.remove('bf-block-selected')
      }
    })

    this.blockSelection.on('end', (blocks) => {
      if (!blocks?.length) return
      const blockIdxList = blocks.map(block => this.rootModel.findIndex(b => b.id === block.getAttribute('data-block-id')!))
      console.log('blockIdxList', blockIdxList)
      this.selectBlocks(Math.min(...blockIdxList), Math.max(...blockIdxList))
    })
  }

  syncYEventUpdate(event: Y.YEvent<any>) {
    if (event.target instanceof Y.Text) {
      const parentId = (event.target.parent as Y.Map<any>).get('id')
      const blockRef = this.getBlockRef(parentId) as EditableBlock
      blockRef.applyDeltaToView(event.changes.delta as DeltaOperation[], true)
    } else {
      this.docManager.applyYChangeToModel(event)
    }
  }

  get root() {
    return this._root
  }

  get rootElement() {
    return this.root.elementRef?.nativeElement as HTMLElement
  }

  get rootId() {
    return this.docManager.rootId
  }

  get rootModel() {
    return this.docManager.rootModel
  }

  get schemaStore() {
    return this.config.schemas
  }

  transact(fn: () => void, origin: any = null) {
    this.docManager.transact(fn, origin)
  }

  stopCapturing() {
    this.historyManager?.stopCapturing()
  }

  storeBlockRef<B extends BaseBlock>(blockRef: B) {
    this.blockRefStore.set(blockRef.id, blockRef)
    for (const key in this.blocksWaiting) {
      if (key === blockRef.id) this.blocksWaiting[key] = true
      if (!this.blocksWaiting[key]) return
    }
    this.blocksReady$.next(true)
  }

  getBlockRef(id: string) {
    return this.blockRefStore.get(id)
  }

  getBlockModel(id: string) {
    return this.docManager.queryBlockModel(id)
  }

  getYBlockModel(id: string) {
    return this.docManager.queryYBlockModel(id)
  }

  getBlockPosition(id: string) {
    return this.docManager.queryBlockIndexAndParentId(id)
  }

  getParentId(id: string) {
    return this.docManager.queryParentId(id)
  }

  getBlockAt(index: number, parentId: string = this.rootId) {
    if (parentId === this.rootId) return this.getBlockRef(this.rootModel[index].id)
    const parent = this.getBlockRef(parentId) as BaseBlock
    return this.getBlockRef((parent.children![index] as IBlockModel).id)
  }

  applyDeltaToEditableBlock(id: string, delta: DeltaOperation[]) {
    const blockRef = this.getBlockRef(id)
    if (!blockRef || !(blockRef instanceof EditableBlock)) return
    blockRef.applyDeltaToView(delta, true)
    blockRef.yText.applyDelta(delta)
  }

  createBlock<K extends keyof BMap>(flavour: K, ...params: any[]) {
    return createBlock<BMap, K>(flavour, this.schemaStore, params)
  }

  insertBlocks(index: number, blocks: BMap[keyof BMap][], parentId: string = this.rootId) {
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
    this.docManager.deleteBlocks(index, count, parentId)
  }

  deleteBlockById(id: string) {
    const path = this.getBlockPosition(id)
    if (!path) throw new Error(`Block ${id} not found`)
    const {index, parentId} = path
    this.deleteBlocks(index, 1, parentId)
  }

  duplicateBlockById(id: string) {
    const bm = JSON.parse(JSON.stringify(this.docManager.queryBlockModel(id))) as IBlockModel
    bm.id = genUniqueID()
    const {parentId, index} = this.getBlockPosition(id)!
    // @ts-ignore
    return this.insertBlocks(index + 1, [bm], parentId)
  }

  observeUndoRedo(type: 'stack-item-added' | 'stack-item-popped', fn: (stackItem: StackItemEvent) => void) {
    if (!this.historyManager) return
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

  findPrevEditableBlockId(id: string): string | null {
    const {index, parentId} = this.getBlockPosition(id)!
    if (parentId !== this.rootId) return null
    if (index === 0) return null
    const br = this.rootModel[index - 1]
    if (br.nodeType === 'editable') return br.id
    return this.findPrevEditableBlockId(br.id)
  }

  findPrevEditableBlock(id: string): EditableBlock | null {
    const prevId = this.findPrevEditableBlockId(id)
    if (!prevId) return null
    return this.getBlockRef(prevId) as EditableBlock
  }

  findNextEditableBlock(id: string): EditableBlock | null {
    const {index, parentId} = this.getBlockPosition(id)!
    if (parentId !== this.rootId) return null
    if (index === this.rootModel.length - 1) return null
    const br = this.getBlockRef(this.rootModel[index + 1].id)!
    if (br instanceof EditableBlock) return br
    return this.findNextEditableBlock(br.id)
  }

  getCurrentRange(): IBlockFlowRange | null {
    if (!document.activeElement || !this.rootElement.contains(document.activeElement)) {
      this.clearSelectedBlocks()
      return null
    }
    if (document.activeElement!.id === this.rootId) {
      return {
        rootRange: this.selectedBlockRange,
        isAtRoot: true,
        rootId: this.rootId
      }
    }
    const blockId = this.getFocusingBlockId()!
    return {
      blockRange: getRange(),
      isAtRoot: false,
      blockId
    }
  }

  getFocusingBlockId() {
    const ele = document.activeElement
    if (!ele
      || ele.getAttribute('bf-node-type') !== 'editable'
      || !this.rootElement.contains(ele)
    ) return null
    return ele.id
  }

  getFocusingBlockRef() {
    const id = this.getFocusingBlockId()
    if (!id) return null
    return this.getBlockRef(id) as EditableBlock
  }

  focusTo(blockRef: EditableBlock, from: CharacterIndex, to?: CharacterIndex) {
    const len = blockRef.getTextContent().length
    const start = characterIndex2Number(from, len)
    const _r = setRange({
      start,
      end: to ? characterIndex2Number(to, len) : start
    }, blockRef.containerEle)
    replaceSelectionInView(_r)
  }

  get selectedBlocksRange() {
    return this.selectedBlockRange
  }

  private selectBlocks(from: number, to: number) {
    this.selectedBlockRange = {start: from, end: to}
  }

  clearSelectedBlocks() {
    this.blockSelection.storeSize && this.blockSelection.storeElements.forEach(ele => ele.classList.remove('bf-block-selected'))
    this.selectedBlockRange = undefined
  }

}
