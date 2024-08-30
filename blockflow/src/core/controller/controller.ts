import {BlockFlowDoc} from "@core/yjs";
import {IBlockFlowRange} from "@core/controller/type";
import {DeltaOperation, IBlockModel} from "@core/types";
import {
    CharacterIndex,
    genUniqueID, getCurrentCharacterRange,
    ICharacterRange, setSelection,
} from "@core/utils";
import {BaseBlock, EditableBlock, KeyEventBus} from "@core/block-std";
import {BaseStore} from "@core/store";
import {BehaviorSubject, take} from "rxjs";
import {StackItemEvent} from "yjs/dist/src/utils/UndoManager";
import Y from "@core/yjs";
import {IPlugin} from "@core/plugins";
import {BlockSelection} from "@core/modules";
import {EditorRoot} from "@core/block-render";
import {SchemaStore} from "@core/schemas";

export interface HistoryConfig {
    open: boolean
    duration?: number,
}

export interface IControllerConfig {
    rootId: string
    schemas: SchemaStore<any>
    historyConfig?: HistoryConfig
    plugins?: IPlugin[]
}

export class Controller {
    public readonly readonly$ = new BehaviorSubject(false)

    private blockRefStore = new BaseStore<BaseBlock>()
    private blocksWaiting: Record<string, boolean> = {}
    private blocksReady$ = new BehaviorSubject(false)

    private readonly historyManager?: Y.UndoManager
    public readonly undoRedo$ = new BehaviorSubject<boolean>(false)

    public readonly docManager: BlockFlowDoc = new BlockFlowDoc({rootId: this.config.rootId})
    public readonly keyEventBus: KeyEventBus = new KeyEventBus(this)

    private blockSelection!: BlockSelection
    private selectedBlockRange: ICharacterRange | undefined = undefined
    private _root!: EditorRoot

    constructor(
        private readonly config: IControllerConfig,
    ) {
        const {historyConfig = {open: true, duration: 500}} = config
        if (historyConfig.open) {
            this.historyManager = new Y.UndoManager(this.docManager.rootYModel,
                {captureTimeout: historyConfig.duration || 300, trackedOrigins: new Set([null])})

            this.docManager.rootYModel.observeDeep((e) => {
                console.log('YEvent=============', e.map(ev => ev.target))
                if (!this.undoRedo$.value) return
                this.syncYEventUpdate(e, true)
                this.undoRedo$.next(false)
            })
        }
    }

    attach(root: EditorRoot) {
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
            // selectable: "[bf-block-wrap]",
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
            if (!blocks?.size) return
            const blockIdxList = [...blocks].map(block => this.rootModel.findIndex(b => b.id === block.getAttribute('data-block-id')!))
            this.selectedBlockRange = {start: Math.min(...blockIdxList), end: Math.max(...blockIdxList)}
            console.log('selectedBlockRange', this.selectedBlockRange, this.blockSelection.selectedElements)
        })
    }

    syncYEventUpdate(e: Y.YEvent<any>[], setSelection = false) {
        e.forEach(event => {
            if (event.target instanceof Y.Text) {
                const parentId = (event.target.parent as Y.Map<any>).get('id')
                const blockRef = this.getBlockRef(parentId) as EditableBlock
                blockRef.applyDeltaToView(event.changes.delta as DeltaOperation[], setSelection)
            } else {
                this.docManager.applyYChangeToModel(event)
            }
        })
    }

    toggleReadonly(bol = true) {
        this.readonly$.next(bol)
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

    get firstBlock() {
        return this.rootModel[0]
    }

    get lastBlock() {
        return this.rootModel[this.rootModel.length - 1]
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

    getEditableBlockYText(id: string) {
        const ym = this.docManager.queryYBlockModel(id)?.get('children')
        if (!ym || !(ym instanceof Y.Text)) throw new Error(`Can not find Y.Text for block ${id}`)
        return ym
    }

    getBlockPosition(id: string) {
        return this.docManager.queryBlockIndexAndParentId(id)
    }

    applyDeltaToEditableBlock(target: string | EditableBlock, delta: DeltaOperation[]) {
        const blockRef = typeof target === 'string' ? this.getBlockRef(target) : target
        if (!blockRef || !(blockRef instanceof EditableBlock)) return
        blockRef.applyDeltaToView(delta)
        blockRef.applyDeltaToModel(delta)
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
        this.docManager.deleteBlocks(index, count, parentId)
        if (!this.rootModel.length) {
            const p = this.schemaStore.createBlock('p')
            this.insertBlocks(0, [p]).then(() => {
                this.focusTo(this.getBlockRef(p.id) as EditableBlock, 'start')
            })
        }
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

    isEditableBlock(b: string | IBlockModel | BaseBlock) {
        return typeof b === 'string' ? this.docManager.queryBlockModel(b)?.nodeType === 'editable' : b.nodeType === 'editable'
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

    getCurrentRange(): IBlockFlowRange | null {
        if (this.readonly$.value) return null
        if (document.activeElement === this.rootElement) {
            return {
                rootRange: this.selectedBlockRange,
                isAtRoot: true,
                rootId: this.rootId
            }
        }
        const blockId = this.getFocusingBlockId()
        if (!blockId) return null
        return {
            blockRange: getCurrentCharacterRange(),
            isAtRoot: false,
            blockId
        }
    }

    getFocusingBlockId() {
        const ele = document.activeElement
        if (!ele || ele.getAttribute('bf-node-type') !== 'editable' || !this.docManager.queryBlockModel(ele.id))
            return null;
        return ele.id
    }

    getFocusingBlockRef() {
        const id = this.getFocusingBlockId()
        if (!id) return null
        return this.getBlockRef(id) as EditableBlock
    }

    focusTo(blockRef: EditableBlock, from: CharacterIndex, to ?: CharacterIndex) {
        if (!this.isEditableBlock(blockRef)) return
        if (from === 'start' && to === 'end')
            document.getSelection()!.getRangeAt(0).selectNodeContents(blockRef.containerEle)
        else setSelection(blockRef.containerEle, from, to || from)
    }

    get selectedBlocksRange() {
        return this.selectedBlockRange
    }

    selectBlocks(from: number, to: number) {
        document.getSelection()!.removeAllRanges()
        this.rootElement.focus()
        this.clearSelectedBlocks()
        this.selectedBlockRange = {start: from, end: to}
        for (let i = from; i <= to; i++) {
            const ele = this.rootElement.children[i] as HTMLElement
            this.blockSelection.selectElement(ele)
        }
    }

    deleteSelectedBlocks() {
        if (!this.selectedBlockRange) return
        const {start, end} = this.selectedBlockRange
        this.transact(() => {
            this.deleteBlocks(start, end - start + 1)
            this.clearSelectedBlocks()
        })
    }

    clearSelectedBlocks() {
        this.blockSelection.storeSize && this.blockSelection.selectedElements.forEach(ele => ele.classList.remove('bf-block-selected'))
        this.selectedBlockRange = undefined
    }

}
