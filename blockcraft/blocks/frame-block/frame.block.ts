import {Component} from "@angular/core";
import {BaseBlockComponent} from "../../framework";
import {FrameBlockModel} from "./index";

@Component({
  selector: 'div.frame-block',
  template: `
    <ng-container #childrenContainer></ng-container>
  `,
  styles: [``],
  standalone: true
})
export class FrameBlockComponent extends BaseBlockComponent<FrameBlockModel> {

  override ngAfterViewInit() {
    super.ngAfterViewInit();
    this.hostElement.style.marginLeft = `${this.props.deep * 2}em`;
  }
}
