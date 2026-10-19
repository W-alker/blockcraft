import {ChangeDetectionStrategy, Component} from "@angular/core";
import {BaseBlockComponent} from "../../framework";
import {PageDividerBlockModel} from "./index";

/**
 * 手动分页符块（void）。在连续流编辑模式下渲染为一条「分页符」虚线标记；
 * 分页展示模式（`.bc-paginated` 祖先）下 `display:none`——断页由页框 + 块下推体现，
 * 且零流高度保证分页引擎对 manualBreak 的「不占高度」假设成立。
 *
 * 分页引擎通过 `flavour === 'page-divider'`（isManualBreak）识别它为强制分页点。
 */
@Component({
  selector: 'div.page-divider-block',
  template: `
    <div class="page-divider-inner" contenteditable="false">
      <span class="page-divider-seg"></span>
      <span class="page-divider-label"><i class="bc_icon bc_fenyefu"></i>分页符</span>
      <span class="page-divider-seg"></span>
    </div>
  `,
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host {
        display: block;
        margin: 8px 0;
        user-select: none;
      }

      /* 分页展示模式下隐藏标记本身（零流高度，不破坏引擎 manualBreak 零高度假设）。 */
      :host-context(.bc-paginated) {
        display: none;
      }

      .page-divider-inner {
        display: flex;
        align-items: center;
        gap: 8px;
        color: var(--bc-color-light, #8b9cad);
        font-size: 12px;
      }

      .page-divider-seg {
        flex: 1;
        border-top: 1px dashed var(--bc-divider-color, #dddddd);
      }

      .page-divider-label {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        white-space: nowrap;
      }

      .page-divider-label .bc_icon {
        font-size: 14px;
      }
    `,
  ],
})
export class PageDividerBlockComponent extends BaseBlockComponent<PageDividerBlockModel> {}
