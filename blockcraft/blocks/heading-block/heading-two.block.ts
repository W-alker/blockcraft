import {ChangeDetectionStrategy, Component} from "@angular/core";
import {EditableBlockComponent} from "../../framework";
import {HeadingTwoBlockModel} from "./index";

@Component({
  selector: 'h3.heading-two-block',
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
export class HeadingTwoBlockComponent extends EditableBlockComponent<HeadingTwoBlockModel> {

}
