import {ChangeDetectionStrategy, Component} from '@angular/core';
import {CommonModule} from '@angular/common';
import {EditableBlock} from "@core/block-std";

@Component({
  selector: 'p',
  standalone: true,
  imports: [CommonModule],
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ParagraphBlock extends EditableBlock {

}
