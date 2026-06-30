import {ChangeDetectionStrategy, Component} from "@angular/core";
import {BaseBlockComponent} from "../../framework";
import {DividerBlockModel} from "./index";

@Component({
  selector: 'div.divider-block',
  template: `
    <!-- Gap-cursor PoC: content wrapped in .bc-block-content so the host becomes a
         flex [leading gap] / .bc-block-content / [trailing gap] column (see the
         uniform rule in base.scss). Gap fillers are prepended/appended to the HOST. -->
    <div class="bc-block-content">
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
    </div>
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
