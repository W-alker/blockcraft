import {ChangeDetectionStrategy, Component} from "@angular/core";
import {ParagraphBlockModel} from "./index";
import {EditableBlockComponent} from "../../framework";

@Component({
  selector: 'p.paragraph-block',
  template: ``,
  standalone: true,
  host: {
    '[class.edit-container]': 'true'
  },
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ParagraphBlockComponent extends EditableBlockComponent<ParagraphBlockModel> {

}
