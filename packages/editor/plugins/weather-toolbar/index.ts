import {FlexibleConnectedPositionStrategy, OverlayRef} from '@angular/cdk/overlay'
import {fromEvent, Subject, Subscription, takeUntil} from 'rxjs'
import {DocPlugin, getPositionWithOffset} from '../../framework'
import {isSelectionAlive} from '../../framework/modules/selection/liveness'
import type {WeatherBlockComponent} from '../../blocks/dynamic-material-blocks/weather/weather-render.component'
import {WeatherToolbarComponent} from './weather-toolbar.component'
import {isObjectToolbarOwnedTarget} from '../object-layout/object-toolbar-interaction'

/** 天气块专属浮动设置；天气数据与设置写入仍归块组件所有。 */
export class WeatherToolbarPlugin extends DocPlugin {
  override name = 'weather-toolbar'
  private readonly subscriptions = new Subscription()
  private readonly close$ = new Subject<void>()
  private overlay?: OverlayRef
  private active?: WeatherBlockComponent
  private timer?: ReturnType<typeof setTimeout>
  private frame?: number
  private resizeObserver?: ResizeObserver
  private ownedInteraction = false
  private releasePresentation?: () => void

  init(): void {
    this.subscriptions.add(this.doc.selection.selectionChange$.subscribe(selection => {
      this.clearTimer()
      if (!selection && this.active && this.isWritable(this.active) && this.ownsFocus()) return
      const block = selection && isSelectionAlive(selection as any, this.doc)
        && selection.isInSameBlock && selection.anchor.type === 'selected' && selection.head.type === 'selected'
        && selection.firstBlock.flavour === 'weather' ? selection.firstBlock as WeatherBlockComponent : undefined
      if (!block || !this.isWritable(block)) { this.close(); return }
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
    const owner = this.doc.root.hostElement.ownerDocument
    this.subscriptions.add(fromEvent<PointerEvent>(owner, 'pointerdown', {capture:true}).subscribe(event => {
      const target = event.target
      this.ownedInteraction = target instanceof Element && isObjectToolbarOwnedTarget(this.overlay?.overlayElement,target)
      if (this.ownedInteraction) {
        this.releasePresentation ??= this.doc.selection.retainPresentation()
      } else if (!(target instanceof Node) || !this.active?.hostElement.contains(target)) this.close()
    }))
    this.subscriptions.add(fromEvent<FocusEvent>(owner, 'focusin').subscribe(event => {
      if (!this.overlay) return
      const target = event.target
      if (target instanceof Element && (isObjectToolbarOwnedTarget(this.overlay.overlayElement,target) || this.active?.hostElement.contains(target))) return
      this.close()
    }))
    this.subscriptions.add(fromEvent<KeyboardEvent>(owner, 'keydown').subscribe(event => {
      if (event.key === 'Escape' && !event.defaultPrevented && this.overlay) { event.preventDefault(); this.close() }
    }))
  }

  private isWritable(block: WeatherBlockComponent): boolean {
    return !this.doc.isReadonly && this.doc.model.exists(block.id)
      && this.doc.getBlockById(block.id) === block && !block.isReadonly
  }
  private ownsFocus(): boolean {
    return this.ownedInteraction || isObjectToolbarOwnedTarget(this.overlay?.overlayElement,this.overlay?.overlayElement.ownerDocument.activeElement ?? null)
  }
  private open(block: WeatherBlockComponent): void {
    this.active = block
    const {componentRef, overlayRef} = this.doc.overlayService.createConnectedOverlay<WeatherToolbarComponent>({
      target:block, component:WeatherToolbarComponent,
      positions:[{originX:'end',originY:'top',overlayX:'end',overlayY:'top',offsetX:-12,offsetY:4}],
    }, this.close$, this.close)
    this.overlay = overlayRef
    componentRef.setInput('block',block)
    componentRef.instance.layoutChange.pipe(takeUntil(this.close$)).subscribe(() => {
      // 入口在块右上角；展开后的配置卡沿块侧边定位，避免遮住卡面。
      const position = overlayRef.getConfig().positionStrategy as FlexibleConnectedPositionStrategy
      position.withPositions([getPositionWithOffset('right-top',8,0),getPositionWithOffset('left-top',8,0),getPositionWithOffset('bottom-left',0,8)])
      this.schedulePosition()
    })
    componentRef.instance.close.pipe(takeUntil(this.close$)).subscribe(this.close)
    this.resizeObserver = new ResizeObserver(this.schedulePosition)
    this.resizeObserver.observe(block.hostElement)
    this.resizeObserver.observe(overlayRef.overlayElement)
  }
  private schedulePosition = (): void => {
    if (this.frame !== undefined) return
    this.frame = requestAnimationFrame(() => { this.frame = undefined; this.overlay?.updatePosition() })
  }
  private clearTimer(): void { if (this.timer !== undefined) clearTimeout(this.timer); this.timer = undefined }
  private close = (): void => {
    this.clearTimer()
    const overlay = this.overlay
    this.overlay = undefined; this.active = undefined; this.ownedInteraction = false
    this.resizeObserver?.disconnect(); this.resizeObserver = undefined
    if (this.frame !== undefined) cancelAnimationFrame(this.frame)
    this.frame = undefined
    this.releasePresentation?.(); this.releasePresentation = undefined
    if (overlay) { this.close$.next(); overlay.dispose() }
  }
  destroy(): void { this.subscriptions.unsubscribe(); this.close(); this.close$.complete() }
}
