import {ChangeDetectionStrategy, Component, EventEmitter, Input, Output, signal} from '@angular/core'
import {CsButtonComponent, CsOptionComponent, CsSelectComponent} from '@cses/ui'
import type {DeltaInsertEmbed} from '../../framework/block-std/types'
import {
  INLINE_PERSON_FORMAT_LABELS, INLINE_PERSON_FORMATS, InlinePersonFormat,
  isInlinePersonFormat,
} from '../../embeds/person'

@Component({
  selector: 'div.bc-inline-person-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {role: 'dialog', 'aria-label': '行内人员格式'},
  imports: [CsButtonComponent, CsOptionComponent, CsSelectComponent],
  template: `
    <label>显示格式</label>
    <cs-select aria-label="显示格式" csSize="sm" [csValue]="format()" (csValueChange)="selectFormat($event)">
      @for (option of options; track option.value) {
        <cs-option [csValue]="option.value" [csLabel]="option.label" />
      }
    </cs-select>
    <div class="actions">
      <button cs-button csType="secondary" csSize="sm" (click)="close.emit()">取消</button>
      <button cs-button csSize="sm" csType="primary" (click)="update.emit(format())">确定</button>
    </div>
  `,
  styles: [`
    :host {
      display: grid; gap: 8px; width: 280px; max-width: calc(100vw - 24px);
      box-sizing: border-box; padding: 12px; font-size: var(--bc-fs, 14px);
      color: var(--bc-color); background: var(--bc-bg-primary);
      border: 1px solid var(--bc-border-color); border-radius: var(--bc-radius-lg);
      box-shadow: var(--bc-shadow-md);
    }
    .actions { display: flex; justify-content: flex-end; gap: 8px; }
  `],
})
export class InlinePersonFormatDialog {
  protected readonly format = signal<InlinePersonFormat>('name')
  protected options: {value: InlinePersonFormat; label: string}[] = []
  @Output() close = new EventEmitter<void>()
  @Output() update = new EventEmitter<InlinePersonFormat>()

  @Input({required: true}) set delta(delta: DeltaInsertEmbed) {
    const format = delta.attributes?.['personFormat']
    this.format.set(isInlinePersonFormat(format) ? format : 'name')
    this.options = INLINE_PERSON_FORMATS.map(value => ({
      value,
      label: INLINE_PERSON_FORMAT_LABELS[value],
    }))
  }

  protected selectFormat(value: unknown): void {
    if (isInlinePersonFormat(value)) this.format.set(value)
  }
}
