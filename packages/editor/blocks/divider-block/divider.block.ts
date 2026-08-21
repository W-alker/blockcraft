import {ChangeDetectionStrategy, Component} from "@angular/core";
import {BaseBlockComponent} from "../../framework";
import {DividerBlockModel} from "./index";
import {DividerPresentation, resolveDividerPresentation} from "./divider-presentation";

@Component({
  selector: 'div.divider-block',
  template: `
    <!-- Gap-cursor PoC: content wrapped in .bc-block-content so the host becomes a
         flex [leading gap] / .bc-block-content / [trailing gap] column (see the
         uniform rule in base.scss). Gap fillers are prepended/appended to the HOST. -->
    <!-- @let: the resolver runs ONCE per change-detection pass instead of once
         per binding (~10 bindings below) — per-getter delegation allocated a
         fresh presentation object for every read. -->
    @let v = view;
    <div class="bc-block-content"
         [style.--bc-divider-line-color]="props.lineColor || null">
      @if (v.text) {
        @if (v.isTape) {
          <div [class]="['divide-line', 'divide-tape', v.style]"
               [attr.data-length]="v.length"
               [attr.data-thickness]="v.thickness"
               [attr.data-align]="v.align"
               [style.opacity]="v.opacity"
               contenteditable="false">
            <span class="divide-label"
                  [style.color]="props.color || null"
                  [style.font-size.px]="v.label.fontSize"
                  [style.font-weight]="v.label.fontWeight"
                  [style.font-style]="v.label.fontStyle"
                  [style.letter-spacing.px]="v.label.letterSpacing">{{ v.text }}</span>
          </div>
        } @else {
          <div class="divide-line-text"
               [attr.data-length]="v.length"
               [attr.data-thickness]="v.thickness"
               [attr.data-align]="v.align"
               [style.opacity]="v.opacity"
               contenteditable="false">
            <span [class]="['divide-seg', v.style]"></span>
            <span class="divide-label"
                  [style.color]="props.color || null"
                  [style.font-size.px]="v.label.fontSize"
                  [style.font-weight]="v.label.fontWeight"
                  [style.font-style]="v.label.fontStyle"
                  [style.letter-spacing.px]="v.label.letterSpacing">{{ v.text }}</span>
            <span [class]="['divide-seg', v.style]"></span>
          </div>
        }
      } @else {
        <div [class]="['divide-line', v.style]"
             [attr.data-length]="v.length"
             [attr.data-thickness]="v.thickness"
             [style.opacity]="v.opacity"
             contenteditable="false"></div>
      }
    </div>
  `,
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DividerBlockComponent extends BaseBlockComponent<DividerBlockModel> {
  // 画法（含 deprecated `size` 的回落与各项钳制）收在 resolveDividerPresentation 一处，
  // snapshot viewer 的 divider 渲染器吃同一份——两处各写一遍就会漂。
  // 模板经 @let 每轮只读一次；不缓存是刻意的（props 是稳定代理，按引用记忆化会失灵）。
  protected get view(): DividerPresentation {
    return resolveDividerPresentation(this.props);
  }
}
