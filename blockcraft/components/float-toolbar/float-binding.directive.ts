import {
  Directive,
  ElementRef,
  Input,
  TemplateRef,
  ViewContainerRef,
  HostListener,
  HostBinding,
  Output, EventEmitter
} from '@angular/core';
import {Overlay, OverlayRef, ConnectedPosition} from '@angular/cdk/overlay';
import {TemplatePortal} from '@angular/cdk/portal';
import {fromEvent} from "rxjs";
import {generateId} from "../../framework";

export const POSITION_MAP: Record<Position, ConnectedPosition> = {
  'top-left': {originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom'},
  'top-center': {originX: 'center', originY: 'top', overlayX: 'center', overlayY: 'bottom'},
  'top-right': {originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom'},
  'bottom-left': {originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top'},
  'bottom-center': {originX: 'center', originY: 'bottom', overlayX: 'center', overlayY: 'top'},
  'bottom-right': {originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top'},
  'left-top': {originX: 'start', originY: 'top', overlayX: 'end', overlayY: 'top'},
  'left-center': {originX: 'start', originY: 'center', overlayX: 'end', overlayY: 'center'},
  'left-bottom': {originX: 'start', originY: 'bottom', overlayX: 'end', overlayY: 'bottom'},
  'right-top': {originX: 'end', originY: 'top', overlayX: 'start', overlayY: 'top'},
  'right-center': {originX: 'end', originY: 'center', overlayX: 'start', overlayY: 'center'},
  'right-bottom': {originX: 'end', originY: 'bottom', overlayX: 'start', overlayY: 'bottom'}
}

type Position =
  'top-left'
  | 'top-center'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right'
  | 'left-top'
  | 'left-center'
  | 'left-bottom'
  | 'right-top'
  | 'right-center'
  | 'right-bottom';

@Directive({
  selector: '[bcOverlayTrigger]',
  standalone: true,
  host: {
    '[attr.data-float-binding]': 'true',
  }
})
export class BcOverlayTriggerDirective {
  @Input('bcOverlayTrigger') contentTemplate!: TemplateRef<any>;
  @Input() position: Position = 'bottom-center';
  @Input() offsetX: number = 0;
  @Input() offsetY: number = 0;

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

  @HostBinding('attr.data-float-index')
  private _dataFloatIndex = 0

  @HostBinding('attr.data-float-id')
  private _dataFloatBindingId = generateId()

  @HostListener('mouseenter')
  showOverlay() {
    if (this.overlayRef || !this.contentTemplate) {
      return;
    }

    const closetBind = this.elementRef.nativeElement.parentElement?.closest('[data-float-binding]')
    this._dataFloatIndex = closetBind ? Number(closetBind.getAttribute('data-float-index')!) + 1 : 0

    const positionStrategy = this.overlay.position()
      .flexibleConnectedTo(this.elementRef)
      .withPositions([{
        ...POSITION_MAP[this.position],
        offsetX: this.offsetX,
        offsetY: this.offsetY
      } || POSITION_MAP['bottom-center']]);

    this.overlayRef = this.overlay.create({positionStrategy});

    const templatePortal = new TemplatePortal(this.contentTemplate, this.viewContainerRef);
    this.overlayRef.attach(templatePortal);

    this.overlayRef.overlayElement.setAttribute('data-float-binding', 'true')
    this.overlayRef.overlayElement.setAttribute('data-float-id', this._dataFloatBindingId)
    this.overlayRef.overlayElement.setAttribute('data-float-index', this._dataFloatIndex + '')

    this.overlayRef.overlayElement.addEventListener('mouseleave', this.hideOverlay);

    this.open.emit(true)
    this.elementRef.nativeElement.classList.add('float-children-opened')
  }

  @HostListener('mouseleave', ['$event'])
  hideOverlay = () => {
    if (!this.overlayRef) return

    let curTarget: HTMLElement
    const sub = fromEvent<MouseEvent>(document, 'mouseover').subscribe(evt => {
      const target = evt.target as Node
      curTarget = target instanceof HTMLElement ? target : target?.parentElement as HTMLElement
    })

    setTimeout(() => {
      sub.unsubscribe()
      if (!curTarget) {
        this.closeOverlay();
        return;
      }

      const closetBinding = curTarget.closest('[data-float-binding]')
      if (!closetBinding) {
        this.closeOverlay();
        return;
      }
      const bid = closetBinding?.getAttribute('data-float-id')
      const curIndex = Number(closetBinding.getAttribute('data-float-index')!)
      if (bid !== this._dataFloatBindingId || this._dataFloatIndex > curIndex) {
        this.closeOverlay();
      }

      return;
    }, 100)
  }

  private closeOverlay() {
    if (!this.overlayRef) return
    this.overlayRef.dispose();
    this.overlayRef = null;
    this.close.emit(true)
    this.elementRef.nativeElement.classList.remove('float-children-opened')
  }

}
