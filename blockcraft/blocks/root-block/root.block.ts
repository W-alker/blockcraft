import {ChangeDetectionStrategy, Component, HostListener} from "@angular/core";
import {BaseBlockComponent} from "../../framework";
import {RootBlockModel} from "./index";
import {takeUntil} from "rxjs";

@Component({
  selector: 'div.root-block[data-blockcraft-root="true"]',
  template: ``,
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[style.font-family]': 'props.ff',
  }
})
export class RootBlockComponent extends BaseBlockComponent<RootBlockModel> {
  @HostListener('contextmenu', ['$event'])
  onContextMenu(event: MouseEvent) {
    event.preventDefault()
  }

  @HostListener('mousedown', ['$event'])
  onSelectStart(event: MouseEvent) {
    if (event.target === this.hostElement) {
      event.preventDefault()
    }
  }

  override ngAfterViewInit() {
    super.ngAfterViewInit();

    this.doc.readonlySwitch$.pipe(takeUntil(this.onDestroy$)).subscribe(v => {
      this.hostElement.setAttribute('contenteditable', v ? 'false' : 'true')
      v ? this.hostElement.classList.add('readonly') : this.hostElement.classList.remove('readonly')
    })
  }

}
