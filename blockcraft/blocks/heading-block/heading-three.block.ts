import {ChangeDetectionStrategy, Component} from "@angular/core";
import {EditableBlockComponent} from "../../framework";
import {HeadingThreeBlockModel} from "./index";

@Component({
  selector: 'h4.heading-three-block',
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
export class HeadingThreeBlockComponent extends EditableBlockComponent<HeadingThreeBlockModel> {

}
