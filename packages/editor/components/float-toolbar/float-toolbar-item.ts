import {ChangeDetectionStrategy, Component, ElementRef, HostBinding, Input} from '@angular/core';

@Component({
  selector: 'bc-float-toolbar-item',
  template: `
    @if (svgIcon) {
      <svg class="bc-toolbar-svg-icon" aria-hidden="true">
        <use [attr.href]="'#' + svgIcon" [attr.xlink:href]="'#' + svgIcon"></use>
      </svg>
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
