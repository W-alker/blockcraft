import {ChangeDetectionStrategy, Component, ElementRef, HostBinding, Input} from '@angular/core';
import {BcFloatToolbarComponent} from "./float-toolbar";
import {NgIf, NgTemplateOutlet} from "@angular/common";

@Component({
  selector: 'bc-float-toolbar-item',
  template: `
    @if (icon) {
      <i [class]="['bc_icon',icon]"></i>
    }
    <ng-content></ng-content>
    @if (expandable) {
      <i class="bc_icon bc_xiajaintou dropdown"></i>
    }
  `,
  standalone: true,
  imports: [
    BcFloatToolbarComponent,
    NgTemplateOutlet,
    NgIf
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BcFloatToolbarItemComponent {
  @Input()
  name!: string;

  @Input()
  value!: any;

  @Input() icon?: string;

  @Input()
  @HostBinding('class.active')
  active?: boolean = false

  @Input()
  @HostBinding('class.disabled')
  disabled?: boolean = false

  @Input()
  expandable = false

  constructor(
    private readonly el: ElementRef<HTMLElement>,
  ) {
  }

  get hostEle() {
    return this.el.nativeElement
  }
}
