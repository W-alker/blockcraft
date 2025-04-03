import {Component, ElementRef, HostBinding, Input} from '@angular/core';
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
  styles: [`
    :host {
      display: flex;
      gap: 4px;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      border-radius: 4px;
      color: #333;
      white-space: nowrap;

      &.active {
        background: rgba(95, 111, 255, 0.08);
        color: var(--bc-active-color);
      }

      &:hover {
        background: rgba(215, 215, 215, 0.6);
      }

      > i {
        font-size: inherit;
        color: inherit;
      }

      i.dropdown {
        transition: transform 0.2s ease-in-out;
      }

      &.float-children-opened {
        background: rgba(215, 215, 215, 0.6);

        i.dropdown {
          transform: rotate(180deg);
        }
      }
    }
  `]
  // changeDetection: ChangeDetectionStrategy.OnPush
})
export class BcFloatToolbarItemComponent {
  @Input()
  name!: string;

  @Input()
  value!: any;

  @Input() icon?: string;

  @Input()
  @HostBinding('class.active')
  active = false

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
