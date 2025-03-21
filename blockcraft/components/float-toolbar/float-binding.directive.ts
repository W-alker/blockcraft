import {Directive, ElementRef, Input, TemplateRef, ViewContainerRef, HostListener, HostBinding} from '@angular/core';
import {Overlay, OverlayRef, ConnectedPosition} from '@angular/cdk/overlay';
import {TemplatePortal} from '@angular/cdk/portal';
import {fromEvent} from "rxjs";

const POSITION_MAP: { [key: string]: ConnectedPosition } = {
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
};

@Directive({
  selector: '[bcOverlayTrigger]',
  standalone: true
})
export class BcOverlayTriggerDirective {
  @Input('bcOverlayTrigger') contentTemplate!: TemplateRef<any>;
  @Input() position: string = 'top-left';

  private overlayRef: OverlayRef | null = null

  constructor(
    private overlay: Overlay,
    private elementRef: ElementRef<HTMLElement>,
    private viewContainerRef: ViewContainerRef
  ) {
  }

  @HostBinding('attr.data-float-binding')
  private _dataFloatBinding = true

  @HostBinding('attr.data-float-index')
  private _dataFloatIndex = 0

  @HostListener('mouseenter')
  showOverlay() {
    if (this.overlayRef || !this.contentTemplate) {
      return;
    }

    const closetBind = this.elementRef.nativeElement.parentElement?.closest('[data-float-binding]')
    this._dataFloatIndex = closetBind ? Number(closetBind.getAttribute('data-float-index')!) + 1 : 0

    const positionStrategy = this.overlay.position()
      .flexibleConnectedTo(this.elementRef)
      .withPositions([POSITION_MAP[this.position] || POSITION_MAP['bottom-center']]);

    this.overlayRef = this.overlay.create({positionStrategy});

    const templatePortal = new TemplatePortal(this.contentTemplate, this.viewContainerRef);
    this.overlayRef.attach(templatePortal);

    // this.overlayRef.overlayElement.addEventListener('mouseenter', this.onOverlayMouseEnter);
    this.overlayRef.overlayElement.addEventListener('mouseleave', this.hideOverlay);
    this.overlayRef.overlayElement.setAttribute('data-float-binding', 'true')
    this.overlayRef.overlayElement.setAttribute('data-float-index', this._dataFloatIndex + '')
  }

  @HostListener('mouseleave', ['$event'])
  hideOverlay = () => {
    if (!this.overlayRef) return

    let curTarget: HTMLElement
    const sub = fromEvent<MouseEvent>(document, 'mouseover').subscribe(evt => {
      const target = evt.target as Node
      curTarget = target instanceof HTMLElement ? target : target.parentElement as HTMLElement
    })

    setTimeout(() => {
      sub.unsubscribe()

      const closetBinding = curTarget.closest('[data-float-binding]')
      if (!closetBinding) {
        this.closeOverlay();
        return;
      }

      const curIndex = Number(closetBinding.getAttribute('data-float-index')!)
      if (this._dataFloatIndex > curIndex) {
        this.closeOverlay();
      }

      return;
    }, 300)
  }

  private onOverlayMouseLeave = (event: MouseEvent) => {
    const relatedTarget = event.relatedTarget as HTMLElement;
    if (this.elementRef.nativeElement.contains(relatedTarget)) {
      return;
    }

    this.closeOverlay();
  };

  private closeOverlay() {
    if (this.overlayRef) {
      this.overlayRef.dispose();
      this.overlayRef = null;
    }
  }
}
