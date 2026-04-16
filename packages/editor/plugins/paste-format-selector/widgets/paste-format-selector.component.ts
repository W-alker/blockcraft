import {ChangeDetectionStrategy, Component, input, output} from "@angular/core";
import {BcFloatToolbarComponent, BcFloatToolbarItemComponent, BcOverlayTriggerDirective} from "../../../components";
import {ClipboardPasteFormatType, ClipboardPasteSessionView} from "../../../framework";

@Component({
  selector: 'bc-paste-format-selector',
  template: `
    <bc-float-toolbar>
      <span class="paste-format-label">粘贴为:</span>
      <bc-float-toolbar-item
        [expandable]="true"
        [bcOverlayTrigger]="formatOptionsTpl"
        [positions]="['bottom-right', 'top-right', 'bottom-left', 'top-left']"
        [offsetY]="8">
        {{ currentLabel() }}
      </bc-float-toolbar-item>
    </bc-float-toolbar>

    <ng-template #formatOptionsTpl>
      <bc-float-toolbar direction="column" (onItemClick)="onItemClicked($event)">
        @for (option of session().options; track option.type) {
          <bc-float-toolbar-item
            [name]="option.type"
            [active]="option.type === session().selectedType">
            {{ option.label }}
          </bc-float-toolbar-item>
        }
      </bc-float-toolbar>
    </ng-template>
  `,
  standalone: true,
  imports: [
    BcFloatToolbarComponent,
    BcFloatToolbarItemComponent,
    BcOverlayTriggerDirective
  ],
  styles: [`
    :host {
      display: block;
      user-select: none;
    }

    .paste-format-label {
      display: flex;
      align-items: center;
      color: var(--bc-text-color-secondary, rgba(0, 0, 0, 0.55));
      font-size: 12px;
      white-space: nowrap;
      padding: 0 2px;
    }
  `],
  host: {
    '(mousedown)': '$event.stopPropagation()',
    '(click)': '$event.stopPropagation()'
  },
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PasteFormatSelectorComponent {
  readonly session = input.required<ClipboardPasteSessionView>()
  readonly formatChange = output<ClipboardPasteFormatType>()

  currentLabel() {
    return this.session().options.find(option => option.type === this.session().selectedType)?.label ?? '保留格式'
  }

  onItemClicked(item: BcFloatToolbarItemComponent) {
    this.formatChange.emit(item.name as ClipboardPasteFormatType)
  }
}
