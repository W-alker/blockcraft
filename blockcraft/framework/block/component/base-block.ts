import {
  ChangeDetectorRef,
  Component, ElementRef,
  EventEmitter, HostBinding,
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
import * as Y from 'yjs'
import {Subject} from "rxjs";

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

  parentId: string | null = null

  protected _yProps!: Obj2YMap<Model['props']>
  protected _yMeta!: Obj2YMap<Model['meta']>

  props: Model['props'] = {}
  meta: Model['meta'] = {}

  constructor() {
  }

  ngOnInit() {
  }

  ngAfterViewInit() {
    this.onViewInit$.next(true)
    this._init()
  }

  ngOnDestroy() {
    this.onDestroy$.next(true)
  }

  @HostBinding('attr.id')
  get id() {
    return this._native.id
  }

  get flavour() {
    return this._native.flavour
  }

  @HostBinding('attr.node-type')
  get nodeType() {
    return this._native.nodeType
  }

  get parentBlock(): BlockCraft.BlockComponent | null {
    return this.parentId ? this.doc.getBlockById(this.parentId) : null
  }

  protected _init() {
    this._yProps = this._yBlock.get('props')
    this._yMeta = this._yBlock.get('meta')
    this.props = proxyMap(this._native.props, this._yProps)
    this.meta = proxyMap(this._native.meta, this._yMeta)
  }

  get childrenIds() {
    if (this._native.nodeType !== BlockNodeType.block) {
      throw new BlockCraftError(ErrorCode.ModelCRUDError, `${this.id} block has no children`)
    }
    return (this.yBlock.get('children') as Y.Array<string>).toArray()
  }

  getChildrenBlocks() {
    if (!this.childrenContainer) {
      throw new BlockCraftError(ErrorCode.ModelCRUDError, `${this.id} block has no children`)
    }

    return this.childrenIds.map(id => this.doc.getBlockById(id))
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

  updateProps(props: Partial<Model['props']>) {
    this.doc.crud.transact(() => {
      for (const key in props) {
        if (props[key] === null) {
          delete this._native.props[key]
          this._yProps.delete(key)
          continue
        }
        this._yProps.set(key, this._native.props[key] = props[key]!)
      }
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
        this._yMeta.set(key, this._native.meta[key] = meta[key]!)
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
        : this.childrenIds.map(v => {
          const block = this.doc.getBlockById(v)
          return block.toSnapshot()
        }),
    }
  }

}
