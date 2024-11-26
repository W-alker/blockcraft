import {BehaviorSubject, fromEvent, Subject, take, takeUntil, takeWhile} from "rxjs";
import {BaseStore} from "../store";
import {SchemaStore} from "../schemas";
import {IPlugin} from "../plugins";
import {
  BaseBlock,
  BlockflowInline,
  deltaToString,
  EditableBlock,
  EmbedConverter,
  KeyEventBus,
  sliceDelta
} from "../block-std";
import {
  BlockModel,
  NO_RECORD_CHANGE_SIGNAL,
  syncBlockModelChildren,
  UpdateEvent,
  USER_CHANGE_SIGNAL,
  YBlockModel
} from "../yjs";
import Y from "../yjs";
import {EditorRoot} from "../block-render";
import {Injector} from "@angular/core";
import {StackItemEvent} from "yjs/dist/src/utils/UndoManager";
import {
  CharacterIndex,
  DeltaInsert,
  DeltaOperation,
  IBlockFlavour,
  IBlockFlowRange,
  IBlockModel,
} from "../types";
import {FILE_UPLOADER, IOrderedListBlockModel, updateOrderAround} from "../../blocks";
import {getCurrentCharacterRange, isUrl} from "../../core";
import {HtmlConverter} from "../modules/clipboard/htmlConverter";

export interface HistoryConfig {
  open: boolean
  duration?: number,
}

export interface IControllerConfig {
  rootId: string
  schemas: SchemaStore
  embeds?: [string, EmbedConverter][] // [flavour, converter]
  readonly?: boolean
  historyConfig?: HistoryConfig
  plugins?: IPlugin[],
  localUser?: {
    userId: string
    userName: string
  }
}

const DEFAULT_EMBED_CONVERTER_LIST: [string, EmbedConverter][] = [
  ['link', {
    toView: (data) => {
      const a = document.createElement('a')
      a.textContent = data.insert['link'] as string
      a.setAttribute('data-href', data.attributes!['d:href'] as string)
      return a
    },
    toDelta: (ele) => {
      return {
        insert: {link: ele.textContent!},
        attributes: {'d:href': ele.getAttribute('data-href')}
      }
    }
  }],
  ['image', {
    toView: (data) => {
      const span = document.createElement('span')
      const img = document.createElement('img')
      img.setAttribute('src', data.insert['image'] as string)
      img.setAttribute('draggable', 'false')
      span.style.width = data.attributes?.['d:width'] + 'px'
      span.appendChild(img)
      return span
    },
    toDelta: (ele) => {
      return {
        insert: {image: ele.getAttribute('src')!},
      }
    }
  }]
]

export class Controller {
  public readonly readonly$ = new BehaviorSubject(false)

  public readonly blockUpdate$ = new Subject<UpdateEvent & { block: BaseBlock }>()
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

  public clipboard!: BlockFlowClipboard
  public selection!: BlockFlowSelection
  public readonly keyEventBus: KeyEventBus = new KeyEventBus(this)

  public readonly inlineManger = new BlockflowInline(new Map(DEFAULT_EMBED_CONVERTER_LIST.concat(this.config.embeds || [])))
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
      this.historyManager.on('stack-item-added', (e) => {
        if (e.type === 'undo') {
          e.stackItem.meta.set('selection', this.selection.getSelection())
        }
      })
      this.historyManager.on('stack-item-popped', (e) => {
        requestAnimationFrame(() => {
          this.selection.applyRange(e.stackItem.meta.get('selection') as any)
        })
      })
    }

    this.rootYModel.observe(this._rootYModelObserver)
  }

  attach(root: EditorRoot) {
    return new Promise(resolve => {
      root.ready$.pipe(take(2)).subscribe(v => {
        if (!v) return
        this._root = root
        root.setController(this)
        this.clipboard = new BlockFlowClipboard(this)
        this.selection = new BlockFlowSelection(this)
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
      if (olIndex >= 0 && !unRecord) this.updateOrderAround(blocks[olIndex] as any)

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

  replaceWith(id: string, newBlocks: BlockModel[]) {
    const {index, parentId} = this.getBlockPosition(id)!
    return new Promise((resolve) => {
      this.transact(() => {
        this.deleteBlocks(index, 1, parentId)
        this.insertBlocks(index, newBlocks, parentId).then(resolve)
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
      if (this.isEditable(prev)) return prev
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
      if (this.isEditable(next)) return next
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

  isEditableBlock(block: BaseBlock<any>): block is EditableBlock {
    return block instanceof EditableBlock
  }

  isEditable(b: string | BlockModel | BaseBlock | EditableBlock) {
    return typeof b === 'string' ? this.getBlockModel(b)?.nodeType === 'editable' : b.nodeType === 'editable'
  }

  getFocusingBlockId() {
    return this.root.getActiveBlockId()
  }

  getFocusingBlockRef() {
    const id = this.getFocusingBlockId()
    if (!id) return null
    return this.getBlockRef(id) as EditableBlock
  }

  deleteSelectedBlocks() {
    const rootRange = this.root.selectedBlockRange
    if (!rootRange) return
    const {start, end} = rootRange
    this.deleteBlocks(start, end - start)
    this.root.clearSelectedBlockRange()
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

export class BlockFlowSelection {
  constructor(
    public readonly controller: Controller
  ) {
  }

  get activeElement() {
    return this.controller.activeElement
  }

  get root() {
    return this.controller.root
  }

  getSelection(): IBlockFlowRange | null {
    if (!this.activeElement) return null
    if (this.activeElement === this.root.rootElement) {
      return {
        rootRange: this.root.selectedBlockRange,
        isAtRoot: true,
        rootId: this.controller.rootId,
      }
    }
    return {
      blockRange: getCurrentCharacterRange(this.activeElement),
      isAtRoot: false,
      blockId: this.root.getActiveBlockId()!,
    }
  }

  setSelection(target: string, from: CharacterIndex, to?: CharacterIndex) {
    if (target === this.controller.rootId) {
      this.root.selectBlocks(from, to ?? from)
    } else {
      const bRef = this.controller.getBlockRef(target)
      if (!bRef || bRef.nodeType !== 'editable') return
      // @ts-ignore
      bRef.setSelection(from, to ?? from)
    }
  }

  applyRange(range: IBlockFlowRange) {
    if (!range) return
    if (range.isAtRoot) {
      if (!range.rootRange) this.root.rootElement.focus({preventScroll: true})
      else this.setSelection(range.rootId, range.rootRange!.start, range.rootRange!.end)
    } else {
      this.setSelection(range.blockId, range.blockRange!.start, range.blockRange!.end)
    }
  }

  getCurrentCharacterRange() {
    if(!this.controller.activeElement || this.controller.activeElement === this.controller.rootElement) throw new Error('Unexpected active element')
    return getCurrentCharacterRange(this.controller.activeElement)
  }
}

class BlockFlowClipboard {
  public static CLIPBOARD_DATA_TYPE = '@bf/json'
  public static SIGN_CLIPBOARD_JSON_DELTA = '@bf-delta/json: '
  public static SIGN_CLIPBOARD_JSON_BLOCKS = '@bf-blocks/json: '

  protected readonly htmlConverter = new HtmlConverter(this.controller.schemas)

  constructor(
    public readonly controller: Controller
  ) {
    fromEvent<ClipboardEvent>(document, 'copy').pipe(takeUntil(controller.root.onDestroy)).subscribe(this.onCopy)
    fromEvent<ClipboardEvent>(document, 'cut').pipe(takeUntil(controller.root.onDestroy)).subscribe(this.onCut)
    fromEvent<DragEvent>(controller.rootElement, 'drop').pipe(takeUntil(controller.root.onDestroy)).subscribe(this.onDrop)
    fromEvent<ClipboardEvent>(controller.rootElement, 'paste').pipe(takeUntil(controller.root.onDestroy)).subscribe(this.onPaste)
  }

  execCommand(command: 'cut' | 'copy', range?: IBlockFlowRange) {
    if (range) {
      const selection = this.controller.selection.getSelection()
      this.controller.selection.applyRange(range)
      document.execCommand(command)
      selection && this.controller.selection.applyRange(selection)
      return
    }
    document.execCommand(command)
  }

  copy(range?: IBlockFlowRange) {
    this.execCommand('copy', range)
  }

  cut(range?: IBlockFlowRange) {
    this.execCommand('cut', range)
  }

  writeText(text: string) {
    return navigator.clipboard.writeText(text)
  }

  private _data_write: { data: DeltaInsert[] | IBlockModel[], type: 'delta' | 'block' } | null = null

  writeBlockFlowData(data: DeltaInsert[] | IBlockModel[], type: 'delta' | 'block') {
    console.log()
    this._data_write = {data, type}
    document.execCommand('copy')
  }

  private onCopy = (event: ClipboardEvent) => {
    if (this._data_write) {
      event.preventDefault()
      const clipboardData = event.clipboardData!
      const {data, type} = this._data_write
      type === 'delta' && clipboardData.setData('text/plain', deltaToString(data as DeltaInsert[]))
      clipboardData.setData(BlockFlowClipboard.CLIPBOARD_DATA_TYPE,
        type === 'delta' ? BlockFlowClipboard.SIGN_CLIPBOARD_JSON_DELTA : BlockFlowClipboard.SIGN_CLIPBOARD_JSON_BLOCKS + JSON.stringify(data)
      )
      this._data_write = null
      return
    }

    const curRange = this.controller.selection.getSelection()
    if (!curRange) return null
    event.preventDefault()
    const clipboardData = event.clipboardData!
    if (!curRange.isAtRoot) {
      const {blockRange: range, blockId} = curRange
      if (range.start === range.end) throw new Error('The range is collapsed')
      const bRef = this.controller.getBlockRef(blockId)
      if (!bRef || !this.controller.isEditableBlock(bRef)) throw new Error('The block is not editable')

      if (this.controller.activeElement?.classList.contains('bf-plain-text-only')) {
        clipboardData.setData('text/plain', bRef.getTextContent().slice(range.start, range.end))
        return {range: curRange, clipboardData}
      }

      const deltaConcat = sliceDelta(bRef.getTextDelta(), range.start, range.end)
      clipboardData.setData('text/plain', deltaToString(deltaConcat))
      clipboardData.setData(BlockFlowClipboard.CLIPBOARD_DATA_TYPE, BlockFlowClipboard.SIGN_CLIPBOARD_JSON_DELTA + JSON.stringify(deltaConcat))
      return {range: curRange, clipboardData}
    }

    const {rootRange} = curRange
    if (!rootRange) throw new Error('No range selected')
    const blocks = this.controller.rootModel.slice(rootRange.start, rootRange.end + 1).map((block) => block.toJSON())
    clipboardData.setData(BlockFlowClipboard.CLIPBOARD_DATA_TYPE, BlockFlowClipboard.SIGN_CLIPBOARD_JSON_BLOCKS + JSON.stringify(blocks))
    return {range: curRange, clipboardData}
  }

  private onCut = (event: ClipboardEvent) => {
    const res = this.onCopy(event)
    if (!res) return
    const {range} = res
    if (!range.isAtRoot) {
      const {blockRange, blockId} = range
      const bRef = this.controller.getBlockRef(blockId)
      if (!bRef || !this.controller.isEditableBlock(bRef)) throw new Error('The block is not editable')

      const deltas = [{retain: blockRange.start}, {delete: blockRange.end - blockRange.start}]
      bRef.applyDelta(deltas)
      return;
    }

    const rootRange = range.rootRange!
    this.controller.deleteBlocks(rootRange.start, rootRange.end - rootRange.start)
  }

  private uploadImg = async (file: File) => {
    const imgUploader = this.controller.injector.get(FILE_UPLOADER)
    if (!imgUploader) throw new Error('imgUploader is required')
    return await imgUploader.uploadImg(file)
  }

  private onPaste = async (event: ClipboardEvent) => {
    if (this.controller.readonly$.value) return
    event.preventDefault()
    const clipboardData = event.clipboardData!
    console.log(clipboardData.types)
    const curRange = this.controller.selection.getSelection()
    if (!curRange) return

    // files
    if (clipboardData.types.includes('Files')) {
      if (curRange.isAtRoot || !clipboardData.files.length) return;

      const imgFiles = Array.from(clipboardData.files).filter(file => file.type.startsWith('image'))
      if (!imgFiles.length) return
      const fileUri = await this.uploadImg(imgFiles[0])

      const bRef = this.controller.getBlockRef(curRange.blockId)
      if (!bRef || !this.controller.isEditableBlock(bRef)) throw new Error('The block is not editable')

      const {parentId, index} = bRef.getPosition()
      if (bRef.containerEle.classList.contains('bf-plain-text-only')) return
      if (bRef.containerEle.classList.contains('bf-multi-line')) {
        bRef.applyDelta([{retain: curRange.blockRange.start}, {insert: {image: fileUri}}])
        return
      }
      if (parentId === this.controller.rootId) {
        const block = this.controller.createBlock('image', [fileUri])
        this.controller.insertBlocks(index, [block], this.controller.rootId)
        return
      }
    }

    if (clipboardData.types.includes(BlockFlowClipboard.CLIPBOARD_DATA_TYPE)) {
      const data = clipboardData.getData(BlockFlowClipboard.CLIPBOARD_DATA_TYPE)
      if (data.startsWith(BlockFlowClipboard.SIGN_CLIPBOARD_JSON_DELTA)) {
        const deltas = JSON.parse(data.slice(BlockFlowClipboard.SIGN_CLIPBOARD_JSON_DELTA.length)) as DeltaInsert[]
        if (curRange.isAtRoot) return
        const bRef = this.controller.getBlockRef(curRange.blockId)
        if (!bRef || !this.controller.isEditableBlock(bRef)) throw new Error('The block is not editable')
        applyPasteDeltaToBlock(bRef, deltas, curRange.blockRange)
        return;
      }

      if (data.startsWith(BlockFlowClipboard.SIGN_CLIPBOARD_JSON_BLOCKS)) {
        const json = JSON.parse(data.slice(BlockFlowClipboard.SIGN_CLIPBOARD_JSON_BLOCKS.length)) as IBlockModel[]
        let index: number
        if (curRange.isAtRoot) {
          index = curRange.rootRange!.end
        } else {
          index = this.controller.getBlockPosition(curRange.blockId)!.index + 1
        }
        this.controller.insertBlocks(index, json.map(BlockModel.fromModel))
        return
      }
      return;
    }

    if (!curRange.isAtRoot && clipboardData.types.includes('text/html')) {

      if (!this.controller.activeElement?.classList.contains('bf-plain-text-only')) {
        const html = clipboardData.getData('text/html')
        console.log(html)
        const position = this.controller.getBlockPosition(curRange.blockId)!

        if (position.parentId === this.controller.rootId && !this.controller.activeElement?.classList.contains('bf-multi-line')) {
          const parseModels = this.htmlConverter.convertToBlocks(html)
          if (parseModels.length) {
            this.controller.insertBlocks(position.index + 1, parseModels.map(BlockModel.fromModel))
            return
          }
        } else {
          const deltas = this.htmlConverter.convertToDeltas(html)
          if (deltas.length) {
            const bRef = this.controller.getBlockRef(curRange.blockId)
            if (!bRef || !this.controller.isEditableBlock(bRef)) throw new Error('The block is not editable')
            applyPasteDeltaToBlock(bRef, deltas, curRange.blockRange)
          }
          return
        }
      }
    }

    const text = clipboardData.getData('text/plain')
    if (!text) return;
    if (curRange.isAtRoot) return;
    const bRef = this.controller.getBlockRef(curRange.blockId)
    if (!bRef || !this.controller.isEditableBlock(bRef)) throw new Error('The block is not editable')
    let deltaInsert: DeltaInsert[]
    if (isUrl(text) && !bRef.containerEle.classList.contains('bf-plain-text-only')) {
      deltaInsert = [{insert: {link: text}, attributes: {'d:href': text}}]
    } else {
      deltaInsert = [{insert: text}]
    }
    applyPasteDeltaToBlock(bRef, deltaInsert, curRange.blockRange)
  }

  private onDrop = async (event: DragEvent) => {
    event.preventDefault()
    if (!event.dataTransfer) return

    event.dataTransfer.types.forEach(type => console.log(type, event.dataTransfer!.getData(type)))
    const types = event.dataTransfer!.types

    if (event.dataTransfer.files) {
      const imgFiles = Array.from(event.dataTransfer.files).filter(file => file.type.startsWith('image'))
      if (!imgFiles.length) return
      const target = event.target as HTMLElement
      const blockId = target.closest('[bf-block-wrap]')?.getAttribute('data-block-id')
      if (!blockId) return
      const fileUri = await this.uploadImg(imgFiles[0])
      const bPos = this.controller.getBlockPosition(blockId)!
      const imgBlock = this.controller.createBlock('image', [fileUri])
      this.controller.insertBlocks(bPos.index + 1, [imgBlock])
    }

  }
}

const applyPasteDeltaToBlock = (blockRef: any, deltaInsert: DeltaInsert[], range: {
  start: number,
  end: number
}) => {
  let deltas: DeltaOperation[]
  if (blockRef.containerEle.classList.contains('bf-plain-text-only')) {
    deltas = [{retain: range.start}, {insert: deltaToString(deltaInsert)}]
  } else deltas = [{retain: range.start}, ...deltaInsert]
  if (range.start !== range.end) {
    deltas.splice(1, 0, {delete: range.end - range.start})
  }
  blockRef.applyDelta(deltas, true)
}
