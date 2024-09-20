import {Overlay, OverlayRef} from "@angular/cdk/overlay";
import {IContextMenuItem} from "./contextmenu.type";
import {ComponentPortal} from "@angular/cdk/portal";
import {ContextMenuComponent} from "./contextmenu";
import {take} from "rxjs";
import {ComponentRef} from "@angular/core";

interface config {
  target: HTMLElement
  items: IContextMenuItem[]
}

export class ContextmenuCreator {

  public readonly overlayRef!: OverlayRef
  public readonly contextmenu!: ComponentRef<ContextMenuComponent>

  constructor(
    private overlay: Overlay,
    public readonly config: config
  ) {

    const {target, items} = config
    const portal = new ComponentPortal(ContextMenuComponent)
    const positionStrategy = this.overlay.position().flexibleConnectedTo(target)
      .withPositions([{originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top'}])
      .withPush(true)
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

