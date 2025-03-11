import {ChangeDetectionStrategy, Component} from "@angular/core";
import {HeadingOneBlockModel} from "./index";
import {EditableBlockComponent} from "../../framework";

@Component({
  selector: 'h2.heading-one-block',
  template: ``,
  styles: [`
    :host {
      margin: 0;
    }
  `],
  standalone: true,
  host: {
    '[class.edit-container]': 'true'
  },
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HeadingOneBlockComponent extends EditableBlockComponent<HeadingOneBlockModel> {

}
