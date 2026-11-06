import {
  Directive,
  ElementRef,
  Input,
  TemplateRef,
  ViewContainerRef,
  HostListener,
  Output, EventEmitter, OnDestroy, NgZone
} from '@angular/core';
import {Overlay, OverlayRef} from '@angular/cdk/overlay';
import {TemplatePortal} from '@angular/cdk/portal';
import {generateId, getPositionWithOffset, OverlayPosition} from "../../framework";
import {nextTick} from "../../global";
import {fromEvent, Subscription, takeUntil} from "rxjs";

@Directive({
  selector: '[bcOverlayTrigger]',
  standalone: true,
  exportAs: 'bcOverlayTrigger',
  host: {
    '[attr.data-float-binding]': 'true',
  }
})
export class BcOverlayTriggerDirective implements OnDestroy {
  @Input('bcOverlayTrigger') contentTemplate!: TemplateRef<any>;
  // 默认值： ['bottom-center', 'top-center']
  @Input() positions: OverlayPosition[] = ['bottom-center', 'top-center'];
  @Input() offsetX: number = 0;
  @Input() offsetY: number = 0;
  @Input() activeClass = 'float-children-opened';
  @Input() withBackdrop = false;
  @Input() delay = 0;

  private _overlayDisabled = false;
  @Input('bcOverlayDisabled')
  set overlayDisabled(disabled: boolean) {
    this._overlayDisabled = disabled
    if (disabled) this.closePanel()
  }

  get overlayDisabled() {
    return this._overlayDisabled
  }

  @Output()
  close = new EventEmitter<boolean>();

  @Output()
  open = new EventEmitter<boolean>();

  private overlayRef: OverlayRef | null = null
  private persistentListeners?: Subscription
  private scrollSubscription?: Subscription

  constructor(
    private overlay: Overlay,
    private elementRef: ElementRef<HTMLElement>,
    private viewContainerRef: ViewContainerRef,
    private ngZone: NgZone,
  ) {
  }

  ngAfterViewInit() {

    nextTick().then(() => {
      const closetBind = this.elementRef.nativeElement.parentElement?.closest('[data-float-binding]')
      if (closetBind) {
        this._dataFloatIndex = Number(closetBind.getAttribute('data-float-index')!) + 1
        this._dataFloatBindingId = closetBind.getAttribute('data-float-id')!
      }
      this.elementRef.nativeElement.setAttribute('data-float-index', this._dataFloatIndex + '')
      this.elementRef.nativeElement.setAttribute('data-float-id', this._dataFloatBindingId)
    })

  }

  private _dataFloatIndex = 0
  private _dataFloatBindingId: string = generateId()

  @HostListener('mouseenter')
  showOverlay() {
    if (this.overlayRef || this._openDelayTimer || !this.contentTemplate || this.overlayDisabled) {
      return;
    }

    this._openDelayTimer = setTimeout(() => {
      this._openDelayTimer = undefined
      this.openOverlay()
    }, this.delay)

    this.elementRef.nativeElement.addEventListener('mouseleave', () => {
      this.clearOpenDelayTimer()
    }, {once: true})
  }

  private _openDelayTimer?: number

  openOverlay(persistent = false) {
    if (
      this.overlayDisabled ||
      !this.elementRef.nativeElement.isConnected
    ) return
    this.clearOpenDelayTimer()
    if (persistent) this.retainOverlay()
    if (this.overlayRef) return
    const positionStrategy = this.overlay.position()
      .flexibleConnectedTo(this.elementRef)
      .withPositions(this.positions.map(position => getPositionWithOffset(position, this.offsetX, this.offsetY)))

    this.overlayRef = this.overlay.create({
      positionStrategy,
      hasBackdrop: this.withBackdrop,
      backdropClass: 'cdk-overlay-transparent-backdrop',
      scrollStrategy: this.overlay.scrollStrategies.noop()
    });

    const templatePortal = new TemplatePortal(this.contentTemplate, this.viewContainerRef);
    this.overlayRef.attach(templatePortal);

    this.overlayRef.overlayElement.setAttribute('data-float-binding', 'true')
    this.overlayRef.overlayElement.setAttribute('data-float-id', this._dataFloatBindingId)
    this.overlayRef.overlayElement.setAttribute('data-float-index', this._dataFloatIndex + 1 + '')

    this.open.emit(true)
    this.elementRef.nativeElement.classList.add(this.activeClass)

    this.observeScroll()
    fromEvent(document, 'pointerover', {capture: true}).pipe(takeUntil(this.close)).subscribe(this.hideOverlay)
  }

  private observeScroll() {
    const host = this.elementRef.nativeElement
    const ownerDocument = host.ownerDocument
    const view = ownerDocument.defaultView!
    // 子菜单位于独立 pane；打开时解析一次根触发器，滚动时不扫描 DOM。
    const familyHost = ownerDocument.querySelector<HTMLElement>(
      `[data-float-id="${this._dataFloatBindingId}"][data-float-index="0"]`,
    ) ?? host
    let frame: number | undefined
    this.ngZone.runOutsideAngular(() => {
      this.scrollSubscription = fromEvent(ownerDocument, 'scroll', {capture: true, passive: true})
        .subscribe(event => {
          const target = event.target
          if (!(target instanceof view.Node) || (!target.contains(host) && !target.contains(familyHost))) return
          if (frame !== undefined) return
          // 父菜单先注册，子菜单同帧在父菜单定位后更新。
          frame = view.requestAnimationFrame(() => {
            frame = undefined
            this.overlayRef?.updatePosition()
          })
        })
      this.scrollSubscription.add(() => {
        if (frame !== undefined) view.cancelAnimationFrame(frame)
      })
    })
  }

  private retainOverlay() {
    this.clearCloseDelayTimer()
    if (this.persistentListeners) return
    const host = this.elementRef.nativeElement
    const ownerDocument = host.ownerDocument
    const view = ownerDocument.defaultView!
    const listeners = this.persistentListeners = new Subscription()
    listeners.add(fromEvent<PointerEvent>(ownerDocument, 'pointerdown', {capture: true}).subscribe(event => {
      const target = event.target instanceof view.Element ? event.target : null
      const binding = target?.closest('[data-float-binding]')
      // 子菜单挂在独立 CDK pane 中，沿用同一 binding family 判断归属。
      const belongs = binding?.getAttribute('data-float-id') === this._dataFloatBindingId &&
        (binding === host || Number(binding.getAttribute('data-float-index')) > this._dataFloatIndex)
      if (!belongs) this.closePanel()
    }))
    listeners.add(fromEvent<KeyboardEvent>(ownerDocument, 'keydown', {capture: true}).subscribe(event => {
      if (event.key === 'Escape') this.closePanel()
    }))
    listeners.add(fromEvent(view, 'blur').subscribe(() => this.closePanel()))
  }

  private _timer?: number

  private clearOpenDelayTimer() {
    if (!this._openDelayTimer) return
    clearTimeout(this._openDelayTimer)
    this._openDelayTimer = undefined
  }

  private clearCloseDelayTimer() {
    if (!this._timer) return
    clearTimeout(this._timer)
    this._timer = undefined
  }

  hideOverlay = (evt: Event) => {
    if (!this.overlayRef || this.persistentListeners) return

    this.clearCloseDelayTimer()

    let curTarget = evt.target as Node | null

    this._timer = setTimeout(() => {
      if (!curTarget) {
        this.closeOverlay();
        return;
      }

      const targetEle = curTarget instanceof HTMLElement ? curTarget : curTarget.parentElement!
      const closetBinding = targetEle.closest('[data-float-binding]')

      if (!closetBinding) {
        this.closeOverlay();
        return;
      }

      const bid = closetBinding?.getAttribute('data-float-id')
      const curIndex = Number(closetBinding.getAttribute('data-float-index')!)

      if (bid !== this._dataFloatBindingId || this._dataFloatIndex > curIndex) {
        this.closeOverlay();
      }

      if (bid === this._dataFloatBindingId && this._dataFloatIndex === curIndex && closetBinding !== this.elementRef.nativeElement) {
        this.closeOverlay();
      }

      return;
    }, 20)
  }

  private closeOverlay() {
    this.clearOpenDelayTimer()
    this.clearCloseDelayTimer()
    this.persistentListeners?.unsubscribe()
    this.persistentListeners = undefined
    this.scrollSubscription?.unsubscribe()
    this.scrollSubscription = undefined
    if (!this.overlayRef) return
    this.overlayRef.dispose();
    this.overlayRef = null;
    this.close.emit(true)
    this.elementRef.nativeElement.classList.remove(this.activeClass)
  }

  closePanel() {
    this.closeOverlay()
  }

  ngOnDestroy() {
    this.closeOverlay()
  }

}
