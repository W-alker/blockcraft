import {Component, ComponentRef, InjectionToken} from "@angular/core";
import {ComponentType, ConnectedPosition, Overlay} from "@angular/cdk/overlay";
import {ComponentPortal} from "@angular/cdk/portal";
import {BehaviorSubject, fromEvent, Observable, Subject, take, takeUntil} from "rxjs";

// export const DOC_OVERLAY_SERVICE_TOKEN = new InjectionToken<OverlayService>('DOC_OVERLAY_SERVICE');

export const POSITION_MAP: Record<OverlayPosition, ConnectedPosition> = {
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

// 根据位置和offset计算位置，确保offset合适
export const getPositionWithOffset = (position: OverlayPosition, offsetX = 0, offsetY = 0): ConnectedPosition => {
  const pos = POSITION_MAP[position];
  if (position.includes('top')) {
    offsetY = -offsetY;
  }
  if (position.includes('left')) {
    offsetX = -offsetX;
  }
  return {...pos, offsetX, offsetY};
}

export type OverlayPosition =
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

export interface IOverlayCreateOptions {
  target: HTMLElement
  component: ComponentType<any>
  positions?: ConnectedPosition[]
  backdrop?: boolean
}

export class DocOverlayService {

  public readonly overlay = this.doc.injector.get(Overlay)

  constructor(private readonly doc: BlockCraft.Doc) {
  }

  createConnectedOverlay<T>(params: IOverlayCreateOptions, close$: Subject<any>, onDestroy: () => void) {
    const portal = new ComponentPortal(params.component, null, this.doc.injector)

    const overlayRef = this.overlay.create({
      positionStrategy: this.overlay.position().flexibleConnectedTo(params.target).withPositions(params.positions || [
        getPositionWithOffset('top-center', 0, 0),
        getPositionWithOffset('bottom-center', 0, 0),
      ]),
      scrollStrategy: this.overlay.scrollStrategies.close(),
      hasBackdrop: params.backdrop,
      backdropClass: 'cdk-overlay-transparent-backdrop',
    })

    const componentRef: ComponentRef<T> = overlayRef.attach(portal)

    params.backdrop && overlayRef.backdropClick().pipe(takeUntil(close$)).subscribe(() => {
      close$.next(true)
    })

    fromEvent(this.doc.scrollContainer!, 'scroll').pipe(takeUntil(close$))
      .subscribe(() => {
        overlayRef && overlayRef.updatePosition()
      })

    const observer = new MutationObserver((mutationsList) => {
      for (const mutation of mutationsList) {
        mutation.removedNodes.forEach((node) => {
          if (node === params.target) {
            close$.next(true)
          }
        })
      }
    })
    observer.observe(params.target.parentElement!, {childList: true})

    this.doc.readonlySwitch$.pipe(takeUntil(close$)).subscribe(v => {
      v && close$.next(true)
    })

    params.backdrop && overlayRef.backdropClick().pipe(takeUntil(close$)).subscribe(() => {
      close$.next(true)
    })

    close$.pipe(take(1)).subscribe(() => {
      onDestroy?.()
      overlayRef.dispose()
      observer.disconnect()
    })

    return {
      overlayRef,
      componentRef
    }
  }

}
