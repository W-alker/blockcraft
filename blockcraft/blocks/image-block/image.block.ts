import {ChangeDetectionStrategy, Component} from "@angular/core";
import {BaseBlockComponent} from "../../framework";
import {ImageBlockModel} from "./index";

@Component({
  selector: "div.image-block",
  template: `
<!--    <div class="img-block-wrapper" contenteditable="false">-->
      <img [src]="props.src" [style.width.px]="props.size.width" contenteditable="false"
           [style.height.px]="props.size.height"/>
<!--    </div>-->
    <ng-container #childrenContainer></ng-container>
  `,
  styles: [],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ImageBlockComponent extends BaseBlockComponent<ImageBlockModel>{

}
