import {ChangeDetectionStrategy, Component} from "@angular/core";
import {BaseBlockComponent} from "../../framework";
import {MatIcon} from "@angular/material/icon";
import {AttachmentBlockModel} from "./index";

@Component({
  selector: 'div.attachment-block',
  template: `
    <div class="attachment-block__info">
      <div class="attachment-block__name">{{ props.name }}</div>
      <div class="attachment-block__size">{{ props.size }}</div>
    </div>
    <div class="attachment-block__icon-wrapper">
      <mat-icon [svgIcon]="props.icon"></mat-icon>
    </div>
  `,
  styles: [``],
  standalone: true,
  imports: [
    MatIcon
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AttachmentBlockComponent extends BaseBlockComponent<AttachmentBlockModel>{

}
