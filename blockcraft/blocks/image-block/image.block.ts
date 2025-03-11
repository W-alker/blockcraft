import {ChangeDetectionStrategy, Component} from "@angular/core";
import {BaseBlockComponent} from "../../framework";
import {ImageBlockModel} from "./index";

@Component({
  selector: "div.image-block",
  template: `
    <img [src]="props.src" contenteditable="false" />
    <ng-container #childrenContainer></ng-container>
  `,
  styles: [],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ImageBlockComponent extends BaseBlockComponent<ImageBlockModel>{

}
