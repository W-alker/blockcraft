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
import {
  BlockNodeType,
  BlockPlacementLayer,
  IBlockProps,
  IBlockSnapshot,
  ResolvedBlockPosition,
} from "../../types";
import { Subject, Subscription } from "rxjs";
import {createBlockGapSpace, generateId} from "../../../utils";
import * as Y from 'yjs'
import { STR_LINE_BREAK } from "../../inline";
import { EditorEventName } from "../../event";
import {
  BlockReadonlyOperation,
  BlockReadonlySource,
} from "../../../doc/block-readonly.types";
import {
  normalizeParagraphFontScale,
  resolveEditableBlockFontScale,
  normalizeParagraphSpacing,
  normalizeTypographyLineHeight,
  paragraphPointsToCss,
} from "../../typography";

export type BlockViewState = 'mounted' | 'retained' | 'destroyed'

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
  public readonly onDetach$ = new Subject<void>()
  public readonly onReattach$ = new Subject<void>()

  private _viewState: BlockViewState = 'mounted'
  private _releaseViewRetention: (() => void) | null = null
  private _releasePlacementRetention: (() => void) | null = null
  private _releasePlacementPicking: (() => void) | null = null
  private _placementRetentionSub: Subscription | null = null
  private _placementRetentionSyncQueued = false
  private _blockGapSub: Subscription | null = null
  private _blockGapFrame: number | null = null

  get viewState(): BlockViewState {
    return this._viewState
  }

  get isAttached(): boolean {
    return this._viewState === 'mounted'
  }

  @Output()
  readonly onPropsChange = new EventEmitter<Map<keyof Model['props'], {
    action: "add" | "update" | "delete",
    oldValue: Partial<Model["props"]>
  }>>();

  @HostBinding('style.margin-left')
  get marginLeft() {
    if (this.resolvedPlacement.mode === 'absolute') return '0'
    return `${(this._native.props.depth || 0) * 2 * 16}px`
  }

  @HostBinding('attr.data-bc-placement')
  get placementAttribute(): 'absolute' | null {
    return this.resolvedPlacement.mode === 'absolute' ? 'absolute' : null
  }

  @HostBinding('style.position')
  get placementPosition(): 'absolute' | null {
    return this.resolvedPlacement.mode === 'absolute' ? 'absolute' : null
  }

  @HostBinding('style.left.px')
  get placementLeft(): number | null {
    const placement = this.resolvedPlacement
    return placement.mode === 'absolute' ? placement.x : null
  }

  @HostBinding('style.top.px')
  get placementTop(): number | null {
    const placement = this.resolvedPlacement
    return placement.mode === 'absolute' ? placement.y : null
  }

  @HostBinding('attr.data-bc-placement-layer')
  get placementLayerAttribute(): BlockPlacementLayer | null {
    const placement = this.resolvedPlacement
    return placement.mode === 'absolute' ? placement.layer : null
  }

  @HostBinding('style.z-index')
  get placementZIndex(): number | null {
    const placement = this.resolvedPlacement
    if (placement.mode !== 'absolute') return null
    return placement.layer === 'under' ? 0 : 2
  }

  @HostBinding('style.margin')
  get placementMargin(): string | null {
    return this.resolvedPlacement.mode === 'absolute' ? '0' : null
  }

  /**
   * Schema 声明了 absolute 放置能力的块是「对象」。base.scss 以此实施对象
   * 宽度契约：浮动时宽度不设上限，落回文档流时渲染宽度收敛到内容列。
   */
  @HostBinding('attr.data-bc-object')
  get objectAttribute(): '' | null {
    const capability = this.doc?.schemas?.get(this.flavour, false)?.metadata.placement
    return capability?.modes.includes('absolute') ? '' : null
  }

  @HostBinding('attr.data-bc-revision-kind')
  get revisionKindAttribute(): string | null {
    return this.doc?.revisions?.getBlockPresentation(this.id).kind ?? null
  }

  @HostBinding('attr.data-bc-revision-state')
  get revisionStateAttribute(): string | null {
    return this.doc?.revisions?.getBlockPresentation(this.id).state ?? null
  }

  @HostBinding('attr.data-bc-revision-ids')
  get revisionIdsAttribute(): string | null {
    const ids = this.doc?.revisions?.getBlockPresentation(this.id).revisionIds ?? []
    return ids.length ? ids.join(',') : null
  }

  @HostBinding('attr.data-bc-revision-hidden')
  get revisionHiddenAttribute(): '' | null {
    return this.doc?.revisions?.getBlockPresentation(this.id).hidden ? '' : null
  }

  @HostBinding('attr.data-bc-revision-boundary-before')
  get revisionBoundaryAttribute(): string | null {
    return this.doc?.revisions?.getBlockPresentation(this.id).boundaryBefore ?? null
  }

  @HostBinding('attr.data-bc-revision-view')
  get revisionViewAttribute(): string | null {
    return this.nodeType === BlockNodeType.root
      ? this.doc?.revisions?.viewMode ?? null
      : null
  }

  /**
   * 对象所在的放置容器。组内成员以文档内容列为参照，根级对象取最近的
   * placement 容器；resizer 用它量视觉缩放，流内拉伸也以它的宽度封顶。
   */
  get placementContainer(): HTMLElement | undefined {
    if (this.doc.placement?.isInObjectGroup?.(this.id)) {
      const groupHost = this.hostElement.closest<HTMLElement>('[data-bc-object-group]')
      return this.doc.objectSizing.rootContentElement ?? groupHost?.parentElement ?? undefined
    }
    return this.hostElement.closest<HTMLElement>('[data-bc-placement-container]') ??
      this.hostElement.parentElement ??
      undefined
  }

  private _objectMaxWidthResolver?: () => number | null

  /**
   * 传给 resizer 的拉伸宽度上限求值器：浮动（absolute）时宽度完全归用户，
   * 返回 null 表示不设上限；流内收敛到内容列宽（编辑器 - 内边距）。
   *
   * 用求值器而不是绑定一个数字：它要读布局，只能在手势开始那一刻算。引用惰性
   * 创建后保持稳定，OnPush 下不会每轮变更检测都换一个新输入。
   */
  get objectMaxWidthResolver(): () => number | null {
    return this._objectMaxWidthResolver ??= () => {
      if (this.resolvedPlacement.mode === 'absolute') return null
      const width = this.placementContainer?.clientWidth
      return typeof width === 'number' && width > 0 ? width : null
    }
  }

  private get resolvedPlacement(): ResolvedBlockPosition {
    const capability = this.doc?.schemas?.get(this.flavour, false)?.metadata.placement
    if (!capability?.modes.includes('absolute')) {
      return {mode: 'relative' as const, x: 0, y: 0, layer: 'over' as const}
    }
    return this.doc?.placement?.getState?.(this.id) ??
      {mode: 'relative' as const, x: 0, y: 0, layer: 'over' as const}
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

  @HostBinding('style.--bc-block-background-color')
  get blockBackgroundColor(): string | null {
    return this.nodeType !== BlockNodeType.editable
      ? null
      : this._resolveBlockAppearanceColor(this._native?.props?.backColor)
  }

  @HostBinding('attr.data-bc-block-background')
  get blockBackgroundAttribute(): '' | null {
    return this.blockBackgroundColor ? '' : null
  }

  @HostBinding('style.--bc-block-border-color')
  get blockBorderColor(): string | null {
    return this.nodeType !== BlockNodeType.editable
      ? null
      : this._resolveBlockAppearanceColor(this._native?.props?.borderColor)
  }

  @HostBinding('attr.data-bc-block-border')
  get blockBorderAttribute(): '' | null {
    return this.blockBorderColor ? '' : null
  }

  @HostBinding('style.--bc-block-lh')
  get blockLineHeight(): string | null {
    if (this.nodeType !== BlockNodeType.editable) return null
    const lineHeight = normalizeTypographyLineHeight(
      this._native?.props?.['lh'],
    )
    return lineHeight === null ? null : `${lineHeight}`
  }

  @HostBinding('attr.data-bc-block-lh')
  get blockLineHeightAttribute(): '' | null {
    return this.blockLineHeight === null ? null : ''
  }

  @HostBinding('style.--bc-block-fs-scale')
  get blockFontScale(): string | null {
    if (this.nodeType !== BlockNodeType.editable) return null
    const scale = normalizeParagraphFontScale(this._native?.props?.['pfs'])
    return scale === null ? null : `${scale}`
  }

  @HostBinding('style.font-size')
  get blockFontSize(): string | null {
    if (this.nodeType !== BlockNodeType.editable) return null
    const props = this._native?.props as Record<string, unknown> | undefined
    if (normalizeParagraphFontScale(props?.['pfs']) === null) return null
    return `${resolveEditableBlockFontScale(props, this._native?.flavour) * 100}%`
  }

  @HostBinding('style.--bc-block-sb')
  get blockSpaceBefore(): string | null {
    if (this.nodeType !== BlockNodeType.editable) return null
    return this._paragraphPointCss(
      normalizeParagraphSpacing(this._native?.props?.['psb']),
    )
  }

  @HostBinding('style.--bc-block-sa')
  get blockSpaceAfter(): string | null {
    if (this.nodeType !== BlockNodeType.editable) return null
    return this._paragraphPointCss(
      normalizeParagraphSpacing(this._native?.props?.['psa']),
    )
  }

  /**
   * BlockCraft stores paragraph-before on the following paragraph, but lays
   * out one physical gap on the preceding sibling. This keeps pagination's
   * height stride (`border-box + margin-bottom`) authoritative and avoids
   * browser-dependent vertical-margin collapsing.
   */
  @HostBinding('style.--bc-next-block-sb')
  get nextBlockSpaceBefore(): string | null {
    const model = this.doc?.model
    const nextId = model?.getNextSiblingId?.(this.id)
    if (!nextId || model.getNodeType(nextId) !== BlockNodeType.editable) {
      return null
    }
    return this._paragraphPointCss(
      normalizeParagraphSpacing(model.getProps(nextId)?.['psb']),
    )
  }

  @HostBinding('style.--bc-block-leading-sb')
  get leadingBlockSpaceBefore(): string | null {
    if (this.nodeType !== BlockNodeType.editable) return null
    const model = this.doc?.model
    if (model?.getPreviousSiblingId?.(this.id)) return null
    return this.blockSpaceBefore
  }

  private _meta!: Model['meta']
  get meta() {
    return this._meta as Model['meta']
  }

  constructor() {
  }

  private _resolveBlockAppearanceColor(value: unknown): string | null {
    if (typeof value !== 'string') return null
    const color = value.trim()
    return color && color.toLowerCase() !== 'transparent' ? color : null
  }

  private _paragraphPointCss(value: number | null): string | null {
    return value === null ? null : paragraphPointsToCss(value)
  }

  ngOnInit() {
    this._init()
  }

  ngAfterViewInit() {
    this.hostElement.setAttribute('data-block-id', this.id)
    this.hostElement.setAttribute('data-node-type', this.nodeType)
    this._applyBaseReadonlyViewState()
    this._bindViewRetention()
    this._bindPlacementViewRetention()
    // Placement picking only tracks schemas that can actually become absolute
    // objects. Table row/cell/paragraph materialization is a very hot path; do
    // not route every newly-created nested block through the placement manager
    // just for it to reject the schema again.
    const placementCapability =
      this.doc.schemas?.get(this.flavour, false)?.metadata.placement
    if (placementCapability?.modes.includes('absolute')) {
      this._releasePlacementPicking =
        this.doc.placement?.registerBlockView?.(
          this as unknown as BlockCraft.BlockComponent,
        ) ?? null
    }
    this._bindBlockGapSpaces()
    this.changeDetectorRef.markForCheck()
    this.onViewInit$.next(true)
  }

  ngOnDestroy() {
    if (this._viewState === 'destroyed') return
    this._releaseViewRetention?.()
    this._releaseViewRetention = null
    this._placementRetentionSub?.unsubscribe()
    this._placementRetentionSub = null
    this._blockGapSub?.unsubscribe()
    this._blockGapSub = null
    if (this._blockGapFrame !== null) {
      const ownerWindow = this.hostElement?.ownerDocument?.defaultView
      ownerWindow?.cancelAnimationFrame(this._blockGapFrame)
      this._blockGapFrame = null
    }
    this._releasePlacementPicking?.()
    this._releasePlacementPicking = null
    this._releasePlacementRetention?.()
    this._releasePlacementRetention = null
    if (this._viewState === 'mounted') this.beforeDetach()
    this._viewState = 'destroyed'
    this.onDestroy$.next(true)
    this.onDestroy$.complete()
    this.onDetach$.complete()
    this.onReattach$.complete()
    this.onViewInit$.complete()
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

  /** Detach view-side resources without ending the component lifetime. */
  detach() {
    if (this._viewState !== 'mounted') return
    this.beforeDetach()
    this.changeDetectorRef.detach()
    this._viewState = 'retained'
    this.onDetach$.next()
  }

  /** Rebuild a retained view from the current Yjs block. */
  reattach() {
    if (this._viewState !== 'retained') return
    const yBlock = this.doc.crud.getYBlock(this.id)
    if (!yBlock) return
    this.yBlock = yBlock
    this._init()
    this.afterReattach()
    this.changeDetectorRef.reattach()
    this._viewState = 'mounted'
    this.applyReadonlyViewState()
    this.onReattach$.next()
  }

  /** Release resources that are meaningful only while the host is mounted. */
  protected beforeDetach(): void {}

  /** Recreate view-side resources before reattach is broadcast. */
  protected afterReattach(): void {}

  /** Bind view retention once for the full Angular component lifetime. */
  private _bindViewRetention(): void {
    const virtualization = this.doc.virtualization
    if (!virtualization?.enabled) return

    const schemaRetention =
      this.doc.schemas?.get(this.flavour, false)?.metadata.virtualization
        ?.viewRetention ?? 'virtual'
    this._releaseViewRetention = virtualization.bindBlockViewRetention({
      blockId: this.id,
      flavour: this.flavour,
      nodeType: this.nodeType,
      schemaRetention,
    })
  }

  /**
   * Gap spaces are a normal-flow editing affordance. Absolute objects and the
   * root placement-layout stay object-selected and must never expose editable
   * filler spans. The binding is dynamic because object layout can switch
   * between absolute and relative without remounting the component.
   */
  private _bindBlockGapSpaces(): void {
    // Leaf/container-internal blocks can never own the before/after editing
    // affordance. Previously they still scheduled one rAF each and only found
    // that out inside the callback. Inserting a column into a long table creates
    // one cell and one default paragraph per row, so that turned one model
    // transaction into hundreds/thousands of redundant frame callbacks.
    if (
      (
        this.nodeType !== BlockNodeType.void &&
        this.nodeType !== BlockNodeType.block
      ) ||
      this.doc.schemas?.get?.(this.flavour, false)?.metadata.isLeaf
    ) {
      return
    }

    const scheduleSync = () => {
      if (this._viewState === 'destroyed') return
      const ownerWindow = this.hostElement.ownerDocument.defaultView
      if (!ownerWindow) {
        this._syncBlockGapSpaces()
        return
      }
      if (this._blockGapFrame !== null) {
        ownerWindow.cancelAnimationFrame(this._blockGapFrame)
      }
      this._blockGapFrame = ownerWindow.requestAnimationFrame(() => {
        this._blockGapFrame = null
        this._syncBlockGapSpaces()
      })
    }

    this._blockGapSub = new Subscription()
    this._blockGapSub.add(this.onPropsChange.subscribe(changes => {
      if (changes.has('placement' as keyof Model['props'])) scheduleSync()
    }))
    this._blockGapSub.add(this.onReattach$.subscribe(scheduleSync))
    scheduleSync()
  }

  private _syncBlockGapSpaces(): void {
    const existing = Array.from(this.hostElement.querySelectorAll<HTMLElement>(
      ':scope > [data-block-zero-space="true"]',
    ))
    const wantsGap =
      (
        this.nodeType === BlockNodeType.void ||
        this.nodeType === BlockNodeType.block
      ) &&
      !this.doc.schemas?.get?.(this.flavour, false)?.metadata.isLeaf &&
      this.doc.placement?.allowsGapCursor?.(
        this as unknown as BlockCraft.BlockComponent,
      ) !== false

    if (!wantsGap) {
      existing.forEach(gap => gap.remove())
      return
    }
    const leading = existing.find(
      gap => gap.getAttribute('data-block-gap-side') === 'before',
    )
    const trailing = existing.find(
      gap => gap.getAttribute('data-block-gap-side') === 'after',
    )
    if (!leading) this.hostElement.prepend(createBlockGapSpace('before'))
    if (!trailing) this.hostElement.appendChild(createBlockGapSpace('after'))
  }

  /**
   * Legacy/custom absolute blocks outside the root placement layout still need
   * an individual root lease. Standard absolute objects are nested below the
   * model-projected placement-layout render unit and must not acquire
   * duplicate per-object leases.
   */
  private _bindPlacementViewRetention(): void {
    const capability = this.doc.schemas?.get(this.flavour, false)?.metadata.placement
    if (!capability?.modes.includes('absolute') || !this.doc.virtualization?.enabled) return

    const scheduleSync = () => {
      if (this._placementRetentionSyncQueued || this._viewState === 'destroyed') return
      this._placementRetentionSyncQueued = true
      queueMicrotask(() => {
        this._placementRetentionSyncQueued = false
        if (this._viewState === 'destroyed') return
        const needsIndividualLease =
          this.resolvedPlacement.mode === 'absolute' &&
          !this.doc.placement?.isInAbsoluteLayout?.(
            this as unknown as BlockCraft.BlockComponent,
          )
        if (needsIndividualLease && !this._releasePlacementRetention) {
          try {
            this._releasePlacementRetention =
              this.doc.virtualization.acquireBlockViewLease([this.id])
          } catch (error) {
            this.doc.logger.warn('blockPlacementRetentionLeaseError: ', error)
          }
        } else if (!needsIndividualLease && this._releasePlacementRetention) {
          try {
            this._releasePlacementRetention()
          } catch (error) {
            this.doc.logger.warn('blockPlacementRetentionLeaseReleaseError: ', error)
          }
          this._releasePlacementRetention = null
        }
      })
    }

    this._placementRetentionSub = this.onPropsChange.subscribe(changes => {
      if (changes.has('placement')) scheduleSync()
    })
    scheduleSync()
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
    return this.doc?.revisions?.viewMode === 'final' ||
      (this.doc.readonlyManager?.isReadonly(this) ?? !!this.doc.isReadonly)
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
    if (this.doc?.revisions?.viewMode === 'final') {
      this.hostElement.dataset['bcReadonly'] = 'revision-final'
      this.hostElement.removeAttribute('data-bc-lock-kind')
      return
    }
    if (!resolution?.readonly) {
      this.hostElement.removeAttribute('data-bc-readonly')
      this.hostElement.removeAttribute('data-bc-lock-kind')
      return
    }
    this.hostElement.dataset['bcReadonly'] =
      resolution.source?.kind === 'self' ? 'self' : 'inherited'
    if (resolution.lockKind) {
      this.hostElement.dataset['bcLockKind'] = resolution.lockKind
    } else {
      this.hostElement.removeAttribute('data-bc-lock-kind')
    }
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

  updateMeta(meta: {
    [Key in keyof Model['meta']]?: Model['meta'][Key] | null
  }) {
    const changedKeys = Object.keys(meta).filter(key => {
      const next = meta[key]
      return next === null
        ? Object.prototype.hasOwnProperty.call(this._native.meta, key)
        : this._native.meta[key] !== next
    })
    if (!changedKeys.length) return
    this.doc.mutationPolicy?.assert({
      operation: 'update-meta',
      blockIds: [this.id],
      metaKeys: changedKeys,
    })
    this.doc.crud.transact(() => {
      for (const key of changedKeys) {
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
