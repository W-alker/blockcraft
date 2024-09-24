import {Overlay, OverlayRef, PositionStrategy} from "@angular/cdk/overlay";
import {IContextMenuItem} from "./contextmenu.type";
import {ComponentPortal} from "@angular/cdk/portal";
import {ContextMenuComponent} from "./contextmenu";
import {take} from "rxjs";
import {ComponentRef} from "@angular/core";


interface IContextMenuPosition {
  x: number
  y: number
}

/**
 * Target and position are optional but one of them must be provided.
 */
type config =  {
  target?: HTMLElement
  position?: IContextMenuPosition
  items: IContextMenuItem[]
}

/**
 * @param overlay - The OverlayRef.
 * @param config - The configuration of the context menu. {@link config}
 */
export class ContextmenuCreator {

  public readonly overlayRef!: OverlayRef
  public readonly contextmenu!: ComponentRef<ContextMenuComponent>

  constructor(
    private overlay: Overlay,
    public readonly config: config
  ) {

    const {target, items, position} = config
    const portal = new ComponentPortal(ContextMenuComponent)
    let positionStrategy: PositionStrategy
    if (position) {
      positionStrategy = this.overlay.position().global().left(`${position.x}px`).top(`${position.y}px`)
    } else {
      positionStrategy = this.overlay.position().flexibleConnectedTo(target!)
        .withPositions([{originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top'}])
        .withPush(true)
    }
    this.overlayRef = this.overlay.create({
      positionStrategy,
      hasBackdrop: true,
      backdropClass: 'cdk-overlay-transparent-backdrop'
    })
    this.overlayRef.backdropClick().pipe(take(1)).subscribe(() => {
      this.overlayRef.dispose()
    })

    this.contextmenu = this.overlayRef.attach(portal)
    this.contextmenu.setInput('items', items)
  }

  dispose() {
    this.overlayRef.dispose()
  }

}

