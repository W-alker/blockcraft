import {FlexibleConnectedPositionStrategy, OverlayRef} from '@angular/cdk/overlay'
import {fromEvent, Subject, Subscription, takeUntil} from 'rxjs'
import {DocPlugin, getPositionWithOffset} from '../../framework'
import {isSelectionAlive} from '../../framework/modules/selection/liveness'
import {MaterialToolbarComponent} from './material-toolbar.component'
import {closetBlockId} from '../../framework'
import {isObjectToolbarOwnedTarget} from '../object-layout/object-toolbar-interaction'

/** 日期、天气、人员共用的块外工具栏；单选、浮层与生命周期只有一个 owner。 */
export class MaterialToolbarPlugin extends DocPlugin {
  override name = 'material-toolbar'
  private readonly subscriptions = new Subscription()
  private readonly close$ = new Subject<void>()
  private overlay?: OverlayRef
  private active?: BlockCraft.BlockComponent
  private component?: MaterialToolbarComponent
  private timer?: ReturnType<typeof setTimeout>
  private frame?: number
  private resizeObserver?: ResizeObserver
  private ownedInteraction = false
  private releasePresentation?: () => void

  protected acceptsFlavour(flavour: string): boolean { return ['date-card', 'weather', 'person-card'].includes(flavour) }

  init(): void {
    this.subscriptions.add(this.doc.selection.selectionChange$.subscribe(selection => {
      this.clearTimer()
      if (!selection && this.active && this.isWritable(this.active) && this.ownsFocus()) return
      const block = selection && isSelectionAlive(selection as any, this.doc)
        && selection.isInSameBlock && selection.anchor.type === 'selected' && selection.head.type === 'selected'
        && this.acceptsFlavour(selection.firstBlock.flavour) ? selection.firstBlock as BlockCraft.BlockComponent : undefined
      if (!block || !this.isWritable(block) ||
        (block.flavour === 'person-card' && this.doc.placement.isInObjectGroup(block))) { this.close(); return }
      if (this.active === block) return
      this.close()
      this.timer = setTimeout(() => {
        this.timer = undefined
        const current = this.doc.selection.value
        if (current && isSelectionAlive(current as any, this.doc) && current.isInSameBlock
          && current.anchor.type === 'selected' && current.head.type === 'selected'
          && current.firstBlock === block && this.isWritable(block)) this.open(block)
      }, 120)
    }))
    this.subscriptions.add(this.doc.subscribeReadonlyChange(readonly => { if (readonly) this.close() }))
    this.subscriptions.add(this.doc.readonlyManager.stateChange$.subscribe(() => {
      if (this.active && !this.isWritable(this.active)) this.close()
    }))
    this.subscriptions.add(fromEvent<MouseEvent>(this.doc.root.hostElement, 'dblclick').subscribe(event => {
      const target = event.target
      if (!(target instanceof Element) || target.closest('[data-block-gap-side], mtl-scale-resizer, shape-resizer')) return
      const id = closetBlockId(target)
      const block = id ? this.doc.vm.get(id)?.instance : undefined
      if (!block || block.flavour !== 'date-card' || !this.acceptsFlavour(block.flavour) || !this.isWritable(block)) return
      event.preventDefault(); event.stopPropagation()
      this.clearTimer()
      if (this.active !== block) { this.close(); this.open(block) }
      this.component?.openSettings()
    }))
    const owner = this.doc.root.hostElement.ownerDocument
    this.subscriptions.add(fromEvent<PointerEvent>(owner, 'pointerdown', {capture:true}).subscribe(event => {
      const target = event.target
      this.ownedInteraction = target instanceof Element && isObjectToolbarOwnedTarget(this.overlay?.overlayElement,target)
      if (this.ownedInteraction) {
        this.beginInteraction()
      } else if (!(target instanceof Node) || !this.active?.hostElement.contains(target)) this.close()
    }))
    this.subscriptions.add(fromEvent<FocusEvent>(owner, 'focusin').subscribe(event => {
      if (!this.overlay) return
      const target = event.target
      if (target instanceof Element && isObjectToolbarOwnedTarget(this.overlay.overlayElement,target)) {
        this.ownedInteraction = true
        this.beginInteraction()
        return
      }
      if (target instanceof Node && this.active?.hostElement.contains(target)) return
      const selection = this.doc.selection.value
      if (target === this.doc.root.hostElement && selection?.isInSameBlock
        && selection.anchor.type === 'selected' && selection.head.type === 'selected'
        && selection.firstBlock === this.active) {
        this.ownedInteraction = false
        return
      }
      this.close()
    }))
    this.subscriptions.add(fromEvent<KeyboardEvent>(owner, 'keydown').subscribe(event => {
      if (event.key === 'Escape' && !event.defaultPrevented && this.overlay) {
        event.preventDefault()
        if (this.component?.settingsOpen) this.component.closeSettings(event)
        else this.close()
      }
    }))
  }

  private beginInteraction(): void {
    this.releasePresentation ??= this.doc.selection.retainPresentation()
    // Firefox 聚焦按钮后仍可能保留编辑器 Range；排序会把旧 Range 映射到相邻块。
    // 工具栏持有明确目标及选中外观，取焦时释放原生选区，避免误切换对象。
    if (this.doc.selection.value) this.doc.selection.blur()
  }
  private isWritable(block: BlockCraft.BlockComponent): boolean {
    return !this.doc.isReadonly && this.doc.model.exists(block.id)
      && this.doc.getBlockById(block.id) === block && !block.isReadonly
  }
  private ownsFocus(): boolean {
    return this.ownedInteraction || isObjectToolbarOwnedTarget(this.overlay?.overlayElement,this.overlay?.overlayElement.ownerDocument.activeElement ?? null)
  }
  private open(block: BlockCraft.BlockComponent): void {
    this.active = block
    const {componentRef, overlayRef} = this.doc.overlayService.createConnectedOverlay<MaterialToolbarComponent>({
      target:block, component:MaterialToolbarComponent,
      positions: this.toolbarPositions(),
      // 日期设置沿用视口边界，兼容窄窗口中横向溢出的正文；其余物料沿用编辑器边界。
      clampTo: block.flavour === 'date-card' ? block.hostElement.ownerDocument.documentElement : undefined,
    }, this.close$, this.close)
    this.overlay = overlayRef
    this.component = componentRef.instance
    componentRef.setInput('block',block)
    componentRef.changeDetectorRef.detectChanges()
    componentRef.instance.layoutChange.pipe(takeUntil(this.close$)).subscribe(() => {
      // 展开设置时保留同一个 owner，卡片与横向工具栏一起放到块外。
      const position = overlayRef.getConfig().positionStrategy as FlexibleConnectedPositionStrategy
      position.withPositions(componentRef.instance.settingsOpen
        ? [getPositionWithOffset('right-top',8,0),getPositionWithOffset('left-top',8,0),getPositionWithOffset('bottom-center',0,8)]
        : this.toolbarPositions())
      this.schedulePosition()
    })
    this.resizeObserver = new ResizeObserver(this.schedulePosition)
    this.resizeObserver.observe(block.hostElement)
    this.resizeObserver.observe(overlayRef.overlayElement)
  }
  private toolbarPositions() {
    return [getPositionWithOffset('top-center',0,8),getPositionWithOffset('top-left',0,8),getPositionWithOffset('top-right',0,8),
      getPositionWithOffset('bottom-center',0,8),getPositionWithOffset('bottom-left',0,8),getPositionWithOffset('bottom-right',0,8)]
  }
  private schedulePosition = (): void => {
    if (this.frame !== undefined) return
    this.frame = requestAnimationFrame(() => { this.frame = undefined; this.overlay?.updatePosition() })
  }
  private clearTimer(): void { if (this.timer !== undefined) clearTimeout(this.timer); this.timer = undefined }
  private close = (): void => {
    this.clearTimer()
    const overlay = this.overlay
    this.overlay = undefined; this.active = undefined; this.component = undefined; this.ownedInteraction = false
    this.resizeObserver?.disconnect(); this.resizeObserver = undefined
    if (this.frame !== undefined) cancelAnimationFrame(this.frame)
    this.frame = undefined
    this.releasePresentation?.(); this.releasePresentation = undefined
    if (overlay) { this.close$.next(); overlay.dispose() }
  }
  destroy(): void { this.subscriptions.unsubscribe(); this.close(); this.close$.complete() }
}
