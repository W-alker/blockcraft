import {ChangeDetectionStrategy, Component} from "@angular/core";
import {BaseBlockComponent} from "../../framework";
import {MatIcon} from "@angular/material/icon";
import {AttachmentBlockModel} from "./index";
import {FileSizePipe} from "./file-size.pipe";

@Component({
  selector: 'div.attachment-block',
  template: `
    <div class="attachment-block__prefix">
      <i class="bc_icon bc_wenjian-color"></i>
    </div>
    <div class="attachment-block__info">
      <div class="attachment-block__name" spellcheck="false">{{ props.name }}</div>
      <div class="attachment-block__size">{{ props.size | fileSize }}</div>
    </div>
    <div class="attachment-block__icon-wrapper">
      <mat-icon [svgIcon]="props.icon"></mat-icon>
    </div>
  `,
  standalone: true,
  imports: [
    MatIcon,
    FileSizePipe
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AttachmentBlockComponent extends BaseBlockComponent<AttachmentBlockModel>{

}
