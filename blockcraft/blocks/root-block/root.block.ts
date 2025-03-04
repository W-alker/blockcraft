import {ChangeDetectionStrategy, Component, HostListener} from "@angular/core";
import {BaseBlockComponent} from "../../framework";
import {RootBlockModel} from "./index";

@Component({
  selector: 'div.root-block[data-blockcraft-root="true"]',
  template: `<ng-container #childrenContainer></ng-container>`,
  styles: [`
    :host {
      margin: 20px;
      padding: 20px;
      outline: 1px solid red;
    }
  `],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RootBlockComponent extends BaseBlockComponent<RootBlockModel> {
  isActive = false

  @HostListener('blur', ['$event'])
  onBlur(event: FocusEvent) {
    this.isActive = false
  }

  @HostListener('focus', ['$event'])
  onFocus(event: FocusEvent) {
    this.isActive = true
  }

  override ngAfterViewInit() {
    super.ngAfterViewInit();
    this.hostElement.setAttribute('contenteditable', 'true')
  }

}
