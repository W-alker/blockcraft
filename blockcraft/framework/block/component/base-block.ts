import {
  ChangeDetectorRef,
  Component, DestroyRef,
  ElementRef,
  EventEmitter,
  HostBinding,
  inject,
  Input,
  Output,
  ViewChild,
  ViewContainerRef
} from "@angular/core";
import {native2YBlock, NativeBlockModel, Obj2YMap, proxyMap, YBlock, yBlock2Native} from "../../reactive";
import {BlockCraftError, ErrorCode} from "../../../global";
import {ORIGIN_SKIP_SYNC} from "../../doc";
import {BlockNodeType, IBlockSnapshot} from "../../types";
import {Subject} from "rxjs";
import {createBlockGapSpace} from "../../utils";
import * as Y from 'yjs'
import {STR_LINE_BREAK} from "../../inline";
import {EventNames} from "../../event";

@Component({
  selector: 'base-block',
  template: ``,
  styles: [``],
  standalone: true
})
export class BaseBlockComponent<Model extends NativeBlockModel = NativeBlockModel> {

  protected _native!: Model

  @Input()
  set model(native: Model) {
    this._yBlock = native2YBlock(this._native = native)
  }

  private _yBlock!: YBlock<Model>

  @Input()
  set yBlock(yBlock: YBlock<Model>) {
    this._native = yBlock2Native(this._yBlock = yBlock)
  }

  get yBlock() {
    return this._yBlock
  }

  @Input({required: true})
  readonly doc!: BlockCraft.Doc

  readonly onViewInit$ = new Subject<boolean>();
  public readonly onDestroy$ = new Subject<boolean>()

  @Output()
  readonly onPropsChange = new EventEmitter<Map<keyof Model['props'], {
    action: "add" | "update" | "delete",
    oldValue: Model["props"][keyof Model['props']]
  }>>();

  @ViewChild('childrenContainer', {read: ViewContainerRef})
  childrenContainer?: ViewContainerRef

  hostElement: HTMLElement = inject(ElementRef).nativeElement
  changeDetectorRef = inject(ChangeDetectorRef)
  destroyRef = inject(DestroyRef)

  parentId: string | null = null

  protected _yProps!: Obj2YMap<Model['props']>
  protected _yMeta!: Obj2YMap<Model['meta']>

  private _props!: Model['props']
  get props() {
    return this._props as Model['props']
  }

  private _meta!: Model['meta']
  get meta() {
    return this._meta as Model['meta']
  }

  constructor() {
  }

  ngOnInit() {
    this._init()
  }

  ngAfterViewInit() {
    this.onViewInit$.next(true)
    if (this.nodeType === BlockNodeType.void
      // || this.nodeType === BlockNodeType.block
    ) {
      this.hostElement.prepend(createBlockGapSpace())
      this.hostElement.appendChild(createBlockGapSpace())
    }
    this.changeDetectorRef.markForCheck()
  }

  ngOnDestroy() {
    this.onDestroy$.next(true)
  }

  detach() {
    this.changeDetectorRef.detach()
    this.onDestroy$.next(true)
  }

  reattach() {
    this.yBlock = this.doc.crud.getYBlock(this.id)!
    this._init()
    this.changeDetectorRef.reattach()
  }

  bindEvent(name: EventNames, handler: BlockCraft.EventHandler, options?: {
    global?: boolean;
    flavour?: boolean
  }) {
    this.doc.event.add(name, handler, {
      flavour: options?.global
        ? undefined
        : options?.flavour
          ? this?.flavour
          : undefined,
      blockId: options?.global || options?.flavour ? undefined : this.id,
    })
  }

  @HostBinding('attr.data-block-id')
  get id() {
    return this._native.id
  }

  get flavour() {
    return this._native.flavour
  }

  @HostBinding('attr.data-node-type')
  get nodeType() {
    return this._native.nodeType
  }

  get parentBlock(): BlockCraft.BlockComponent | null {
    return this.parentId ? this.doc.getBlockById(this.parentId) : null
  }

  protected _init() {
    this._yProps = this._yBlock.get('props')
    this._yMeta = this._yBlock.get('meta')
    this._props = proxyMap(this._native.props, this._yProps)
    this._meta = proxyMap(this._native.meta, this._yMeta)
    this.nodeType !== BlockNodeType.editable &&
    (this._childrenIds = (this._yBlock.get('children') as Y.Array<string>).toArray())
  }

  get childrenLength() {
    return (this.yBlock.get('children') as Y.Array<string>).length
  }

  /**
   * 这个childrenIds带缓存
   * @protected
   */
  protected _childrenIds: string[] = []

  get childrenIds() {
    if (this.nodeType === BlockNodeType.editable) {
      throw new BlockCraftError(ErrorCode.ModelCRUDError, `${this.id} block has no children`)
    }
    return (this.yBlock.get('children') as Y.Array<string>).toArray()
  }

  getChildrenBlocks() {
    if (this.nodeType === BlockNodeType.editable) {
      throw new BlockCraftError(ErrorCode.ModelCRUDError, `${this.id} block has no children`)
    }

    return this.childrenIds.map(id => this.doc.getBlockById(id)) as BaseBlockComponent<any>[]
  }

  get firstChildren(): BaseBlockComponent<any> | null {
    if (this.nodeType === 'block') {
      const yChildren = this.yBlock.get('children') as Y.Array<string>
      if (!yChildren.length) return null
      const id = yChildren.get(0)
      if (!id) return null
      return this.doc.getBlockById(id) as any
    }
    return null
  }

  get lastChildren(): BaseBlockComponent<any> | null {
    if (this.nodeType === 'block') {
      const yChildren = this.yBlock.get('children') as Y.Array<string>
      if (!yChildren.length) return null
      const id = yChildren.get(yChildren.length - 1)
      if (!id) return null
      return this.doc.getBlockById(id) as any
    }
    return null
  }

  getChildrenByIndex(index: number) {
    if (this.nodeType === BlockNodeType.editable) {
      throw new BlockCraftError(ErrorCode.ModelCRUDError, `${this.id} block has no children`)
    }
    return this.doc.getBlockById(this.childrenIds[index])
  }

  getFlatBlocks(): BlockCraft.IBlockComponents[] {
    const children: any[] = [this.doc.getBlockById(this.id)]
    if (this.nodeType !== BlockNodeType.block) {
      return children
    }
    for (const child of this.childrenIds) {
      const ref = this.doc.getBlockById(child)
      children.push(...ref.getFlatBlocks())
    }
    return children
  }

  getPath() {
    return this.doc.getBlockPath(this.id)
  }

  getIndexOfParent() {
    return this.parentBlock?.childrenIds.indexOf(this.id) ?? -1
  }

  updateProps(props: Partial<Model['props']>) {
    this.doc.crud.transact(() => {
      for (const key in props) {
        if (props[key] === null) {
          delete this._native.props[key]
          this._yProps.delete(key)
          continue
        }
        this.props[key] !== props[key] && this._yProps.set(key, this._native.props[key] = props[key]!)
      }
      this.changeDetectorRef.markForCheck()
    }, ORIGIN_SKIP_SYNC)
  }

  updateMeta(meta: Partial<Model['meta']>) {
    this.doc.crud.transact(() => {
      for (const key in meta) {
        if (meta[key] === null) {
          delete this._native.meta[key]
          this._yMeta.delete(key)
          continue
        }
        this.meta[key] !== meta[key] && this._yMeta.set(key, this._native.meta[key] = meta[key]!)
      }
    }, ORIGIN_SKIP_SYNC)
  }

  toSnapshot(): IBlockSnapshot {
    return {
      id: this.id,
      flavour: this.flavour,
      nodeType: this.nodeType,
      props: JSON.parse(JSON.stringify(this._native.props)),
      meta: JSON.parse(JSON.stringify(this._native.meta)),
      children: this.nodeType === BlockNodeType.editable
        ? (this._yBlock.get('children') as Y.Text).toDelta()
        : this.nodeType === BlockNodeType.void
          ? []
          : this.childrenIds.map(v => {
            const block = this.doc.getBlockById(v)
            return block.toSnapshot()
          }),
    }
  }

  textContent() {
    let text = ''
    if (this.nodeType === BlockNodeType.editable) {
      text += (this._yBlock.get('children') as Y.Text).toJSON()
    } else if (this.nodeType !== BlockNodeType.void) {
      const blocks = this.getChildrenBlocks()
      text += blocks.map(block => block.textContent()).join(STR_LINE_BREAK)
    }
    return text
  }

}
