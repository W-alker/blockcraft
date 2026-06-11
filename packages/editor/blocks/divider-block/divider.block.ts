import {ChangeDetectionStrategy, Component} from "@angular/core";
import {BaseBlockComponent} from "../../framework";
import {DividerBlockModel} from "./index";

@Component({
  selector: 'div.divider-block',
  template: `
    @if (props.text) {
      @if (isTape) {
        <div [class]="['divide-line', 'divide-tape', resolvedStyle]"
             [attr.data-size]="props.size"
             [attr.data-align]="align"
             contenteditable="false">
          <span class="divide-label" [style.color]="props.color || null">{{ props.text }}</span>
        </div>
      } @else {
        <div class="divide-line-text"
             [attr.data-size]="props.size"
             [attr.data-align]="align"
             contenteditable="false">
          <span [class]="['divide-seg', resolvedStyle]"></span>
          <span class="divide-label" [style.color]="props.color || null">{{ props.text }}</span>
          <span [class]="['divide-seg', resolvedStyle]"></span>
        </div>
      }
    } @else {
      <div [class]="['divide-line', props.style]" [attr.data-size]="props.size" contenteditable="false"></div>
    }
  `,
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DividerBlockComponent extends BaseBlockComponent<DividerBlockModel> {
  get resolvedStyle(): string {
    return this.props.style || 'solid';
  }

  get isTape(): boolean {
    return this.resolvedStyle.startsWith('tape');
  }

  get align(): string {
    return this.props.align ?? 'center';
  }
}
