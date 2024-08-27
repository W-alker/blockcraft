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
import {ModelController} from "@core/controller/model-controller";

export interface HistoryConfig {
  open: boolean
  duration?: number,
}

export interface IControllerConfig {
  rootId: string
  schemas: SchemaStore
  historyConfig?: HistoryConfig
  plugins?: IPlugin[]
  initModel?: IBlockModel[]
}

export class Controller<BMap extends IBlockModelMap = IBlockModelMap> {
  public readonly readonly$ = new BehaviorSubject(false)

  private blockRefStore = new BaseStore<BaseBlock>()
  private blocksWaiting: Record<string, boolean> = {}
  private blocksReady$ = new BehaviorSubject(false)

  private readonly historyManager?: Y.UndoManager
  private readonly undoRedo$ = new BehaviorSubject<boolean>(false)

  public readonly keyEventBus: KeyEventBus = new KeyEventBus(this)

  public readonly modelController = new ModelController(this.config.initModel || [], this.rootId)

  private blockSelection!: BlockSelection
  private selectedBlockRange: ICharacterRange | undefined = {start: 0, end: 0}
  private _root!: EditorRoot<BMap>

  constructor(
    protected readonly config: IControllerConfig,
  ) {
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

  get root() {
    return this._root
  }

  get rootElement() {
    return this.root.elementRef?.nativeElement as HTMLElement
  }

  get rootId() {
    return this.config.rootId
  }

  get rootModel() {
    return this.modelController.rootModel
  }

  get schemaStore() {
    return this.config.schemas
  }

  transact(fn: () => void, origin: any = null) {
    this.modelController.transact(fn, origin)
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

  getBlockAt(index: number, parentId: string = this.rootId) {
    if (parentId === this.rootId) return this.getBlockRef(this.rootModel[index].id)
    const parent = this.getBlockRef(parentId) as BaseBlock
    return this.getBlockRef((parent.children![index] as IBlockModel).id)
  }

  applyDeltaToEditableBlock(id: string, delta: DeltaOperation[]) {
    const blockRef = this.getBlockRef(id)
    if (!blockRef || !(blockRef instanceof EditableBlock)) return
    blockRef.applyDeltaToView(delta, true)
    blockRef.deltaText.applyDelta(delta)
  }

  createBlock<K extends keyof BMap>(flavour: K, ...params: any[]) {
    return createBlock<BMap, K>(flavour, this.schemaStore, params)
  }

  insertBlocks(index: number, blocks: IBlockModel[], parentId: string = this.rootId) {
    this.blocksReady$.next(false)
    this.blocksWaiting = blocks.map(b => ({[b.id]: false})).reduce((a, b) => ({...a, ...b}), {})

    return new Promise((resolve, reject) => {
      this.transact(()=>{
        if(parentId === this.rootId) {
            this.rootModel.splice(index, 0, ...blocks)
            return
        }
        else {
          const parent = this.modelController.blockModelStore.get(parentId)
          if (!parent) return
          parent.children!.splice(index, 0 ,...blocks)
        }
      })
      this.blocksReady$.subscribe(ready => {
        if (ready) resolve(this.blocksWaiting = {})
      })
    })
  }

  deleteBlocks(index: number, count: number, parentId: string = this.rootId) {
  }

  deleteBlockById(id: string) {
  }

  duplicateBlockById(id: string) {

  }

  observeUndoRedo(type: 'stack-item-added' | 'stack-item-popped', fn: (stackItem: StackItemEvent) => void) {
    if (!this.historyManager) return
    this.historyManager.on(type, fn)
  }

  undo() {
    this.modelController.undo()
  }

  redo() {
    if (!this.historyManager?.canRedo()) return
    if (this.undoRedo$.value) return
    this.undoRedo$.next(true)
    this.historyManager!.redo()
  }

  findPrevEditableBlockId(id: string): string | null {
    const {index, parentId} = {index: 0, parentId: this.rootId}
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
    const {index, parentId} = {index: 0, parentId: this.rootId}
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
