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
import { NativeBlockModel, Obj2YMap, proxyMap, YBlock, yBlock2Native } from "../../reactive";
import {BlockCraftError, ErrorCode, performanceTest} from "../../../../global";
// 直连叶子文件，避免经 `../../../doc` barrel 把 modules/chain/各 block 子类拖进基类闭包
// （否则 rollup 会把 BaseBlockComponent 排到子类之后 → 启动 TDZ / "superclass is not a constructor"）。
import { ORIGIN_NO_RECORD, ORIGIN_SKIP_SYNC } from "../../../doc/origins";
import type { BlockChildrenRenderRef } from "../../../doc/vm";
import { BlockNodeType, IBlockProps, IBlockSnapshot } from "../../types";
import { Subject } from "rxjs";
import {createBlockGapSpace, generateId} from "../../../utils";
import * as Y from 'yjs'
import { STR_LINE_BREAK } from "../../inline";
import { EditorEventName } from "../../event";
import {
  BlockReadonlyOperation,
  BlockReadonlySource,
} from "../../../doc/block-readonly.types";

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

  @Input({ required: true })
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
    this._applyBaseReadonlyViewState()
    // Gap spaces give the native Selection an editable text node to anchor on
    // when the block itself is treated as `selected`. Without them Safari refuses
    // to dispatch `beforeinput` (the Range start lands on a contenteditable=false
    // wrapper). Apply to both leaf voids and container blocks; CSS already
    // positions `[data-block-zero-space]` absolutely so layout is unaffected.
    // Skip `isLeaf` blocks — they're structural sub-blocks (table-row /
    // table-cell / column) that don't render independently or participate in
    // normal block-level selection.
    const wantsGap =
      this.nodeType === BlockNodeType.void ||
      this.nodeType === BlockNodeType.block
    const isLeaf =
      !!this.doc.schemas.get(this.flavour)?.metadata.isLeaf
    if (wantsGap && !isLeaf) {
      requestAnimationFrame(() => {
        this.hostElement.prepend(createBlockGapSpace('before'))
        this.hostElement.appendChild(createBlockGapSpace('after'))
      })
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
    const changedKeys = Object.keys(props).filter(key => {
      const value = props[key]
      return value == null
        ? Object.prototype.hasOwnProperty.call(this._native.props, key)
        : this._native.props[key] != value
    })
    if (!changedKeys.length) return
    this.doc.readonlyManager.assertPropsWritable(this, BlockReadonlyOperation.Props)
    this.doc.crud.transact(() => {
      for (const key of changedKeys) {
        const value = props[key]
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
    this.applyReadonlyViewState()
  }

  /**
   * 异步副作用安全护栏：块是否已「消失」——被移出 vm（本地/远端删除）或宿主
   * 视图已销毁。上传完成、语法高亮等 await 之后的回调应先查它再写：否则
   * setInitProps 会写入 detached Y.Map（undo 时复活孤儿块），detectChanges
   * 会在已销毁视图上抛错。
   *
   * 注意：虚拟化 detach() 只断开变更检测、块仍在 vm 中，此处返回 false（不算
   * 消失）——那种情况下 setInitProps 应正常写入、数据需要持久化。
   */
  protected _isGone(): boolean {
    const ref = this.doc.vm.get(this.id)
    return !ref || ref.hostView.destroyed
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

  // 当子块变化时会触发。可以选择是否提供该方法
  onChildrenChange?: (event: Y.YEvent<Y.Array<string>>['changes']['delta']) => void

  get id() {
    return this._native.id
  }

  get flavour() {
    return this._native.flavour
  }

  get nodeType() {
    return this._native.nodeType
  }

  get isReadonly(): boolean {
    return this.doc.readonlyManager?.isReadonly(this) ?? !!this.doc.isReadonly
  }

  get isExplicitReadonly(): boolean {
    return this.doc.readonlyManager?.isExplicitReadonly(this) ?? false
  }

  get readonlySource(): BlockReadonlySource {
    return this.doc.readonlyManager?.resolve(this).source
      ?? (this.doc.isReadonly ? {kind: 'document'} : null)
  }

  /** Apply the effective permission state without changing pointer selection. */
  applyReadonlyViewState() {
    this._applyBaseReadonlyViewState()
    this.changeDetectorRef.markForCheck()
  }

  private _applyBaseReadonlyViewState() {
    // Lightweight render/test hosts created before BlockReadonlyManager existed
    // may not provide it. A real BlockCraftDoc always does.
    const resolution = this.doc.readonlyManager?.resolve(this)
    if (!resolution?.readonly) {
      this.hostElement.removeAttribute('data-bc-readonly')
      return
    }
    this.hostElement.dataset['bcReadonly'] =
      resolution.source?.kind === 'self' ? 'self' : 'inherited'
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
    const changedKeys = Object.keys(props).filter(key =>
      this._native.props[key] != props[key]
    )
    if (!changedKeys.length) return
    this.doc.readonlyManager.assertPropsWritable(this, BlockReadonlyOperation.Props)
    this.doc.crud.transact(() => {
      for (const key of changedKeys) {
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
