import {ChangeDetectionStrategy, Component, input, output} from "@angular/core";
import {ClipboardPasteFormatType, ClipboardPasteSessionView} from "../../../framework";

@Component({
  selector: 'bc-paste-format-selector',
  template: `
    <label class="paste-format-label" for="bc-paste-format-select">粘贴为</label>
    <select
      id="bc-paste-format-select"
      class="paste-format-select"
      [value]="session().selectedType"
      (change)="onChange($event)">
      @for (option of session().options; track option.type) {
        <option [value]="option.type">{{ option.label }}</option>
      }
    </select>
  `,
  styles: [`
    :host {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 10px;
      border-radius: 12px;
      border: 1px solid var(--bc-border-color-light);
      background: color-mix(in srgb, var(--bc-bg-elevated) 92%, white 8%);
      color: var(--bc-color);
      box-shadow: var(--bc-shadow-lg);
      backdrop-filter: blur(8px);
      user-select: none;
    }

    .paste-format-label {
      font-size: 12px;
      color: var(--bc-text-color-secondary, rgba(0, 0, 0, 0.55));
      white-space: nowrap;
    }

    .paste-format-select {
      min-width: 112px;
      padding: 4px 8px;
      border-radius: 8px;
      border: 1px solid var(--bc-border-color-light);
      background: var(--bc-bg-primary);
      color: inherit;
      outline: none;
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

  onChange(event: Event) {
    const target = event.target as HTMLSelectElement
    this.formatChange.emit(target.value as ClipboardPasteFormatType)
  }
}
