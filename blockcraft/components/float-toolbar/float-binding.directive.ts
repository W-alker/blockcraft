import {
  Directive,
  ElementRef,
  Input,
  TemplateRef,
  ViewContainerRef,
  HostListener,
  Output, EventEmitter
} from '@angular/core';
import {Overlay, OverlayRef} from '@angular/cdk/overlay';
import {TemplatePortal} from '@angular/cdk/portal';
import {generateId, getPositionWithOffset, OverlayPosition} from "../../framework";
import {nextTick} from "../../global";
import {fromEvent, takeUntil} from "rxjs";

@Directive({
  selector: '[bcOverlayTrigger]',
  standalone: true,
  host: {
    '[attr.data-float-binding]': 'true',
  }
})
export class BcOverlayTriggerDirective {
  @Input('bcOverlayTrigger') contentTemplate!: TemplateRef<any>;
  // 默认值： ['bottom-center', 'top-center']
  @Input() positions: OverlayPosition[] = ['bottom-center', 'top-center'];
  @Input() offsetX: number = 0;
  @Input() offsetY: number = 0;
  @Input() activeClass = 'float-children-opened';
  @Input() withBackdrop = false;
  @Input() delay = 0;

  private _disabled = false;
  @Input()
  set disabled(disabled: boolean) {
    this._disabled = disabled
    if (disabled) this.closeOverlay()
  }

  get disabled() {
    return this._disabled
  }

  @Output()
  close = new EventEmitter<boolean>();

  @Output()
  open = new EventEmitter<boolean>();

  private overlayRef: OverlayRef | null = null

  constructor(
    private overlay: Overlay,
    private elementRef: ElementRef<HTMLElement>,
    private viewContainerRef: ViewContainerRef
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
    if (this.overlayRef || !this.contentTemplate || this.disabled) {
      return;
    }

    this._openDelayTimer = setTimeout(() => {
      this.openOverlay()
      this._openDelayTimer = undefined
    }, this.delay)

    this.elementRef.nativeElement.addEventListener('mouseleave', () => {
      if (this._openDelayTimer) {
        clearTimeout(this._openDelayTimer)
        this._openDelayTimer = undefined
      }
    }, {once: true})
  }

  private _openDelayTimer?: number

  openOverlay() {
    if(this.disabled || !this.elementRef.nativeElement.isConnected) return
    const positionStrategy = this.overlay.position()
      .flexibleConnectedTo(this.elementRef)
      .withPositions(this.positions.map(position => getPositionWithOffset(position, this.offsetX, this.offsetY)))

    this.overlayRef = this.overlay.create({
      positionStrategy,
      hasBackdrop: this.withBackdrop,
      backdropClass: 'cdk-overlay-transparent-backdrop',
      scrollStrategy: this.overlay.scrollStrategies.reposition()
    });

    const templatePortal = new TemplatePortal(this.contentTemplate, this.viewContainerRef);
    this.overlayRef.attach(templatePortal);

    this.overlayRef.overlayElement.setAttribute('data-float-binding', 'true')
    this.overlayRef.overlayElement.setAttribute('data-float-id', this._dataFloatBindingId)
    this.overlayRef.overlayElement.setAttribute('data-float-index', this._dataFloatIndex + 1 + '')

    this.open.emit(true)
    this.elementRef.nativeElement.classList.add(this.activeClass)

    fromEvent(document, 'pointerover', {capture: true}).pipe(takeUntil(this.close)).subscribe(this.hideOverlay)
  }

  private _timer?: number
  hideOverlay = (evt: Event) => {
    if (!this.overlayRef) return

    if (this._timer) {
      clearTimeout(this._timer)
      this._timer = undefined
    }

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
    if (!this.overlayRef) return
    this.overlayRef.dispose();
    this.overlayRef = null;
    this.close.emit(true)
    this.elementRef.nativeElement.classList.remove(this.activeClass)
  }

}
