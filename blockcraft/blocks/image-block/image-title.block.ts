import {Component} from "@angular/core";
import {EditableBlockComponent} from "../../framework";
import {ImageTitleBlockModel} from "./index";

@Component({
  selector: 'p.image-title-block',
  template: ``,
  standalone: true,
  host: {
    '[class.edit-container]': 'true'
  },
})
export class ImageTitleBlockComponent extends EditableBlockComponent<ImageTitleBlockModel> {
}
