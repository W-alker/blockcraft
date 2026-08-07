import {ChangeDetectionStrategy, Component, ElementRef, HostBinding, Input} from '@angular/core';
import {MatIcon} from '@angular/material/icon';

@Component({
  selector: 'bc-float-toolbar-item',
  template: `
    @if (svgIcon) {
      <mat-icon class="bc-toolbar-svg-icon" [svgIcon]="svgIcon"></mat-icon>
    } @else if (icon) {
      <i [class]="['bc_icon',icon]"></i>
    }
    <ng-content></ng-content>
    @if (expandable) {
      <i class="bc_icon bc_xiajaintou dropdown"></i>
    }
  `,
  styles: [`
    .bc-toolbar-svg-icon {
      width: 1em;
      height: 1em;
      flex: none;
      overflow: visible;
    }
  `],
  imports: [MatIcon],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BcFloatToolbarItemComponent {
  @Input()
  name!: string;

  @Input()
  value!: any;

  @Input() icon?: string;
  @Input() svgIcon?: string;

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
