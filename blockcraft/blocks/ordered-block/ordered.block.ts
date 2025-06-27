import {ChangeDetectionStrategy, Component} from "@angular/core";
import {EditableBlockComponent} from "../../framework";
import {OrderedBlockModel} from "./index";
import {getNumberPrefix} from "./utils";

@Component({
  selector: 'div.ordered-block',
  template: `
    <button class="ordered-block-prefix" contenteditable="false">{{ order }}.</button>
    <div class="edit-container"></div>
  `,
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class OrderedBlockComponent extends EditableBlockComponent<OrderedBlockModel> {

  get order() {
    return getNumberPrefix(this.props.order || 0, this.props.depth || 0);
  }
}
