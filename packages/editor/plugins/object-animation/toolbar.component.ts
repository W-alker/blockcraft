import {ChangeDetectionStrategy, Component, EventEmitter, Input, Output} from '@angular/core';
import {CsButtonComponent, CsTooltipDirective} from '@cses/ui';
import {ObjectAnimationSettingsComponent} from './settings.component';
import {OBJECT_FORMAT_POPUP_STYLES} from '../object-format-toolbar/object-format-popup';

/** Animation rail for placeable blocks without the shape/text format tabs. */
@Component({
  selector: 'bc-object-animation-toolbar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CsButtonComponent, CsTooltipDirective, ObjectAnimationSettingsComponent],
  template: `
    <div class="object-format" [class.object-format--left]="side === 'left'" contenteditable="false">
      <nav class="object-format__rail" aria-label="对象快捷工具">
        <button cs-button csType="text" csSize="sm" aria-label="动画" csTooltip="动画"
          [class.active]="opened" [attr.aria-expanded]="opened" (click)="toggle()">
          <i class="bc_icon bc_donghua" aria-hidden="true"></i>
        </button>
      </nav>
      @if (opened) {
        <aside class="object-format__panel"><div class="object-format__scroll">
          <bc-object-animation-settings [doc]="doc" [blockIds]="blockIds" [embedded]="true" (dismiss)="dismissAnimation($event)"/>
        </div></aside>
      }
    </div>
  `,
  styles: [OBJECT_FORMAT_POPUP_STYLES],
})
export class ObjectAnimationToolbarComponent {
  @Input({required: true}) doc!: BlockCraft.Doc;
  @Input({required: true}) blockIds: readonly string[] = [];
  @Input() side: 'left' | 'right' = 'right';
  @Output() readonly panelChange = new EventEmitter<void>();
  @Output() readonly confirmed = new EventEmitter<void>();
  dismissAnimation(reason: 'confirm' | undefined): void {
    if (reason === 'confirm') this.confirmed.emit();
    else this.toggle();
  }
  opened = false;
  toggle(): void { this.opened = !this.opened; this.panelChange.emit(); }
}
