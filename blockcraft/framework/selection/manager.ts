import {BaseSelection} from "./base";
import {BehaviorSubject, fromEvent, takeUntil} from "rxjs";
import {Controller} from "../../controller";
import {BlockSelection} from "./variants/block.selection";
import {TextSelection} from "./variants/text.selection";
import {CharacterIndex} from "./type";
import {BaseBlock, EditableBlock} from "../../block-std";
import {BlockSelector} from "../block-selector";
import {normalizeStaticRange} from "./utils";
import {BlockModel} from "../../yjs";

interface SelectionConstructor {
  type: string;

  new(args: any): BaseSelection;

  fromJSON(json: Record<string, unknown>): BaseSelection;

  renderToUI(this: { controller: Controller }, selection: BaseSelection): void;

  clearFromUI(this: { controller: Controller }, selection: BaseSelection): void;
}

export class SelectionManager {
  public readonly changed$ = new BehaviorSubject<BaseSelection | null>(null)
  private _selectionConstructors: Record<string, SelectionConstructor> = {}

  private _blockSelector!: BlockSelector

  constructor(public readonly controller: Controller) {
    this.register(BlockSelection)
    this.register(TextSelection)
  }

  listen() {
    this.initBlockSelector()

    fromEvent<FocusEvent>(this.controller.rootElement, 'focusin').pipe(takeUntil(this.controller.root.onDestroy)).subscribe(evt => {
      const target = evt.target as HTMLElement
      const blockContainer = target.closest('[bf-node-type="editable"]')
      if (!blockContainer) throw new Error('Focusing element is not a block')
      const block = this.controller.getBlockRef(blockContainer.id)
      if (!block || !this.controller.isEditableBlock(block)) throw new Error('Block not found')
      this._activeEditableBlock = block
      if (block.placeholder && !block.textLength) target.classList.add('placeholder-visible')
    })

    fromEvent<FocusEvent>(this.controller.rootElement, 'focusout').pipe(takeUntil(this.controller.root.onDestroy)).subscribe(evt => {
      if (this._activeEditableBlock) {
        this._activeEditableBlock.containerEle.classList.remove('placeholder-visible')
      }
      this._activeEditableBlock = null
    })

    // listen to text selection
    fromEvent(document, 'selectionchange').pipe(takeUntil(this.controller.root.onDestroy)).subscribe(() => {
      if (!this._activeEditableBlock) return this.next(null)
      const windowSelection = window.getSelection()!
      const range = windowSelection.getRangeAt(0)
      const chRange = normalizeStaticRange(this._activeEditableBlock.containerEle, range)
      const textSelection = this.create('text', {
        group: this._activeEditableBlock.flavour,
        groupId: this._activeEditableBlock.id,
        start: chRange.start,
        end: chRange.end
      })
      this.next(textSelection)
    })
  }

  register(ctor: SelectionConstructor) {
    this._selectionConstructors[ctor.type] = ctor
  }

  get currentSelection() {
    return this.changed$.value
  }

  next(selection: BaseSelection | null) {
    this.changed$.next(selection);
  }

  private _activeEditableBlock: EditableBlock | null = null
  get activeEditableBlock() {
    return this._activeEditableBlock
  }

  /**
   * Create a selection instance
   * @param type selection type
   * @param arg arguments for the selection constructor
   */
  create<T extends BlockFlow.SelectionType>(type: T, arg: ConstructorParameters<BlockFlow.Selection[T]>[0]) {
    const ctor = this._selectionConstructors[type]
    if (!ctor) {
      throw new Error(`Selection type ${type} not registered`)
    }
    return new ctor(arg) as BlockFlow.SelectionInstance[T]
  }

  /**
   * Render the selection to UI, then call the next selection
   * @param selection
   */
  render<T extends BlockFlow.SelectionType>(selection: BlockFlow.SelectionInstance[T]) {
    if (this.currentSelection) {
      this._selectionConstructors[this.currentSelection.type].clearFromUI.call(this, this.currentSelection)
    }
    this._selectionConstructors[selection.type].renderToUI.call(this, selection)
    this.next(selection)
  }

  private _jsonToSelection = (json: Record<string, unknown>) => {
    const ctor = this._selectionConstructors[json["type"] as string];
    if (!ctor) {
      throw new Error(`Unknown selection type: ${json["type"]}`);
    }
    return ctor.fromJSON(json);
  }

  fromJSON(json: Record<string, unknown>) {
    const selection = this._jsonToSelection(json);
    return this.next(selection);
  }

  /**
   * focus to block, if this is an editable block, it will focus to containerElement of the block as a TextSelection, otherwise it will select the block as a BlockSelection
   * @param block block id or block instance
   * @param start start character index, It will be ignored if block is a BlockSelection. Default is 0
   * @param end end character index, It will be ignored if block is a BlockSelection. Default is start
   */
  focusTo(block: string | BaseBlock, start: CharacterIndex = 0, end: CharacterIndex = start) {
    const _block = typeof block === 'string' ? this.controller.getBlockRef(block) : block
    if (!_block) throw new Error(`Block ${block} not found`)
    if (this.controller.isEditableBlock(_block)) {
      this.updateTextSelection({groupId: _block.id, group: _block.flavour, start, end})
      return
    }
    const pos = _block.getPosition()
    this.updateBlockSelection({start: pos.index, end: pos.index + 1})
  }

  focusPrevBlock(block: string | BaseBlock<any>, fn: (b: BlockModel) => boolean = () => true) {
    const _block = typeof block === 'string' ? this.controller.getBlockRef(block) : block
    if (!_block) throw new Error(`Block ${block} not found`)
    const prevBlock = this.controller.findPrevBlockBy(_block, fn)
    if (prevBlock) {
      this.focusTo(prevBlock.id, 'end')
    }
  }

  focusPrevEditableBlock(block: string | BaseBlock<any>) {
    this.focusPrevBlock(block, (b) => this.controller.isEditable(b))
  }

  focusNextBlock(block: string | BaseBlock<any>, fn: (b: BlockModel) => boolean = () => true) {
    const _block = typeof block === 'string' ? this.controller.getBlockRef(block) : block
    if (!_block) throw new Error(`Block ${block} not found`)
    const nextBlock = this.controller.findNextBlockBy(_block, fn)
    if (nextBlock) {
      this.focusTo(nextBlock.id, 0)
    }
  }

  focusNextEditableBlock(block: string | BaseBlock<any>) {
    this.focusNextBlock(block, (b) => this.controller.isEditable(b))
  }

  updateTextSelection(params: { group?: string, groupId: string, start: CharacterIndex, end?: CharacterIndex }) {
    let {groupId, start, end, group} = params

    if (!group) {
      if (groupId === this.controller.rootId) {
        group = 'root'
      } else {
        const block = this.controller.getBlockRef(groupId)
        if (!block) throw new Error(`Block ${groupId} not found`)
        group = block.flavour
      }
    }

    const selection = this.create('text', {groupId, group, start, end: end ?? start})
    this.render(selection)
  }

  private initBlockSelector() {
    this._blockSelector = new BlockSelector({
      host: this.controller.rootElement,
      document: document,
      enable: false,
      onlyLeftButton: true,
      selectable: "[bf-block-wrap]",
      selectionAreaClass: "blockflow-selector-area",
      sensitivity: 40,
      onItemSelect: (element) => {
        element.firstElementChild!.classList.add('selected')
      },
      onItemUnselect: (element) => {
        element.firstElementChild!.classList.remove('selected')
      }
    })

    this._blockSelector.on('end', (blocks) => {
      if (!blocks?.size) return
      const blockIdxList = [...blocks].map(block => this.controller.rootModel.findIndex(b => b.id === block.getAttribute('data-block-id')!))
      const selection = this.create('block', {
        group: 'root',
        groupId: this.controller.rootId,
        start: Math.min(...blockIdxList),
        end: Math.max(...blockIdxList) + 1
      })
      this.next(selection)
    })
  }

  updateBlockSelection(params: { start: number, end: number, groupId?: string, group?: string }) {
    let {start, end, groupId = this.controller.rootId, group = 'root'} = params
    const selection = this.create('block', {group, groupId, start, end})
    this.render(selection)
  }
}
