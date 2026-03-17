import {ChangeDetectionStrategy, Component} from "@angular/core";
import {EditableBlockComponent} from "../../framework";
import {BlockquoteBlockModel} from "./index";

@Component({
  selector: 'blockquote.blockquote-block',
  template: ``,
  standalone: true,
  host: {
    '[class.edit-container]': 'true'
  },
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BlockQuoteBlockComponent extends EditableBlockComponent<BlockquoteBlockModel> {

}
