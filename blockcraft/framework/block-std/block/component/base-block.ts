import {
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  EventEmitter,
  HostBinding,
  inject,
  Input,
  Output,
} from "@angular/core";
import {NativeBlockModel, Obj2YMap, proxyMap, YBlock, yBlock2Native} from "../../reactive";
import {BlockCraftError, ErrorCode} from "../../../../global";
import {BlockChildrenRenderRef, ORIGIN_NO_RECORD, ORIGIN_SKIP_SYNC} from "../../../doc";
import {BlockNodeType, IBlockProps, IBlockSnapshot} from "../../types";
import {Subject} from "rxjs";
import {createBlockGapSpace} from "../../../utils";
import * as Y from 'yjs'
import {STR_LINE_BREAK} from "../../inline";
import {EditorEventName} from "../../event";

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
    this._native = native
  }

  private _yBlock!: YBlock<Model>

  @Input()
  set yBlock(yBlock: YBlock<Model>) {
    this._yBlock = yBlock
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
    oldValue: Partial<Model["props"]>
  }>>();

  @HostBinding('style.margin-left')
  get marginLeft() {
    return `${(this._native.props.depth || 0) * 2 * 16}px`
  }

  childrenRenderRef?: BlockChildrenRenderRef

  hostElement: HTMLElement = inject(ElementRef).nativeElement
  changeDetectorRef = inject(ChangeDetectorRef)
  destroyRef = inject(DestroyRef)

  parentId: string | null = null

  protected _yProps!: Obj2YMap<Model['props']>
  protected _yMeta!: Obj2YMap<Model['meta']>

  private _props!: Model['props']
  get props() {
    return this._props as Model['props'] & IBlockProps
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
    this.hostElement.setAttribute('data-block-id', this.id)
    this.hostElement.setAttribute('data-node-type', this.nodeType)
    if (this.nodeType === BlockNodeType.void
      // || this.nodeType === BlockNodeType.block
    ) {
      this.hostElement.prepend(createBlockGapSpace())
      this.hostElement.appendChild(createBlockGapSpace())
    }
    this.changeDetectorRef.markForCheck()
    this.onViewInit$.next(true)
  }

  ngOnDestroy() {
    this.onDestroy$.next(true)
  }

  /**
   * 组件内部数据初始化
   * @protected
   */
  protected _init() {
    this._yProps = this._yBlock.get('props')
    this._yMeta = this._yBlock.get('meta')
    this._props = proxyMap(this._native.props, this._yProps)
    this._meta = proxyMap(this._native.meta, this._yMeta)
    this.nodeType !== BlockNodeType.editable &&
    (this._childrenIds = (this._yBlock.get('children') as Y.Array<string>).toArray())
  }

  /**
   * 设置初始化数据，不会产生历史数据
   * @param props
   * @protected
   */
  protected setInitProps(props: Partial<Model['props']>) {
    this.doc.crud.transact(() => {
      for (const [key, value] of Object.entries(props)) {
        if (value == null) {
          this._yProps.delete(key)
          Reflect.deleteProperty(this._native.props, key)
        } else {
          this._yProps.set(key, value)
          Reflect.set(this._native.props, key, value)
        }
      }
    }, ORIGIN_NO_RECORD)
  }

  /**
   * 从页面卸载，但不会即时销毁
   */
  detach() {
    this.changeDetectorRef.detach()
    this.onDestroy$.next(true)
  }

  /**
   * 重新挂载，会重新初始化
   */
  reattach() {
    this.yBlock = this.doc.crud.getYBlock(this.id)!
    this._init()
    this.changeDetectorRef.reattach()
  }

  bindEvent(name: EditorEventName, handler: BlockCraft.EventHandler, options?: {
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

  get id() {
    return this._native.id
  }

  get flavour() {
    return this._native.flavour
  }

  get nodeType() {
    return this._native.nodeType
  }

  get parentBlock(): BlockCraft.BlockComponent | null {
    return this.parentId ? this.doc.getBlockById(this.parentId) : null
  }

  get childrenLength() {
    if (this.nodeType === BlockNodeType.editable) return 0
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
    return this._childrenIds = (this.yBlock.get('children') as Y.Array<string>).toArray()
  }

  getChildrenBlocks() {
    if (this.nodeType === BlockNodeType.editable) {
      throw new BlockCraftError(ErrorCode.ModelCRUDError, `${this.id} block has no children`)
    }

    return this.childrenIds.map(id => this.doc.getBlockById(id)) as BaseBlockComponent<any>[]
  }

  get firstChildren(): BaseBlockComponent<any> | null {
    if (this.nodeType === BlockNodeType.editable) return null
    const yChildren = this.yBlock.get('children') as Y.Array<string>
    if (!yChildren.length) return null
    const id = yChildren.get(0)
    if (!id) return null
    return this.doc.getBlockById(id) as any
  }

  get lastChildren(): BaseBlockComponent<any> | null {
    if (this.nodeType === BlockNodeType.editable) return null
    const yChildren = this.yBlock.get('children') as Y.Array<string>
    if (!yChildren.length) return null
    const id = yChildren.get(yChildren.length - 1)
    if (!id) return null
    return this.doc.getBlockById(id) as any
  }

  getChildrenByIndex(index: number) {
    if (this.nodeType === BlockNodeType.editable) {
      throw new BlockCraftError(ErrorCode.ModelCRUDError, `${this.id} block has no children`)
    }
    return this.doc.getBlockById(this.getChildrenIdByIndex(index))
  }

  getChildrenIdByIndex(index: number) {
    if (this.nodeType === BlockNodeType.editable) {
      throw new BlockCraftError(ErrorCode.ModelCRUDError, `${this.id} block has no children`)
    }
    return (this.yBlock.get('children') as Y.Array<string>).get(index)
  }

  // getFlatBlocks(): BlockCraft.BlockComponent[] {
  //   const children: any[] = [this.doc.getBlockById(this.id)]
  //   if (this.nodeType !== BlockNodeType.block) {
  //     return children
  //   }
  //   for (const child of this.getChildrenBlocks()) {
  //     children.push(...child.getFlatBlocks())
  //   }
  //   return children
  // }

  getPath() {
    return this.doc.getBlockPath(this.id)
  }

  getIndexOfParent() {
    return this.parentBlock?.childrenIds.indexOf(this.id) ?? -1
  }

  updateProps(props: Partial<Model['props']>) {
    if (this.doc.isReadonly) return
    this.doc.crud.transact(() => {
        for (const key in props) {
          if (this._native.props[key] == props[key]) continue
          if (props[key] === null) {
            this._yProps.delete(key)
            continue
          }
          this._yProps.set(key, props[key]!)
        }
      }
    )
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

  toSnapshot(deep = true): IBlockSnapshot {
    return {
      id: this.id,
      flavour: this.flavour,
      nodeType: this.nodeType,
      props: JSON.parse(JSON.stringify(this._native.props)),
      meta: JSON.parse(JSON.stringify(this._native.meta)),
      children: this.nodeType === BlockNodeType.editable
        ? (this._yBlock.get('children') as Y.Text).toDelta()
        : (deep ? this.childrenIds.map(v => {
          const block = this.doc.getBlockById(v)
          return block.toSnapshot()
        }) : []),
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
