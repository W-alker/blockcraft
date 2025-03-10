import {ChangeDetectionStrategy, Component} from "@angular/core";
import {EditableBlockComponent} from "../../framework";
import {HeadingFourBlockModel} from "./index";

@Component({
  selector: 'h5.heading-four-block',
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
export class HeadingFourBlockComponent extends EditableBlockComponent<HeadingFourBlockModel> {

}
