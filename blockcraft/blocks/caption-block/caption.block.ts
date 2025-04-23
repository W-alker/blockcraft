import {Component} from "@angular/core";
import {EditableBlockComponent} from "../../framework";
import {CaptionBlockModel} from "./index";

@Component({
  selector: 'p.caption-block',
  template: ``,
  standalone: true,
  host: {
    '[class.edit-container]': 'true'
  },
})
export class CaptionBlockComponent extends EditableBlockComponent<CaptionBlockModel> {
}
