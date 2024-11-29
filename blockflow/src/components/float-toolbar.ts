import {ChangeDetectionStrategy, Component, EventEmitter, HostListener, Input, Output} from "@angular/core";
import {NgForOf, NgIf} from "@angular/common";

export interface IToolbarItem {
  id: string
  name: string
  icon?: string
  value?: string
  title?: string
  text?: string
  divide?: boolean
}

@Component({
  selector: 'div.bf-float-toolbar',
  template: `
    @for(item of toolbarList; track item.id) {
        <div class="bf-float-toolbar__item" [title]="item.title" (click)="onItemClick($event, item)"
             [class.active]="activeMenu?.has(item.id)" [class.divide]="item.divide">
          <i [class]="item.icon"></i><span *ngIf="item.text">{{ item.text }}</span>
        </div>
    }
  `,
  styles: [`
    :host {
      display: flex;
      height: 32px;
      padding: 0 8px;
      align-items: center;
      gap: 8px;
      background: #fff;
      border-radius: 4px;
      box-shadow: 0 0 20px rgba(0, 0, 0, 0.10);
    }

    .bf-float-toolbar__item {
      display: flex;
      gap: 4px;
      align-items: center;
      justify-content: center;
      padding: 0 4px;
      height: 24px;
      cursor: pointer;
      border-radius: 4px;
      font-size: 16px;
      color: #333;
      white-space: nowrap;

      &.divide {
        margin-right: 8px;
        position: relative;

        &::after {
          position: absolute;
          content: '';
          height: 32px;
          width: 1px;
          background: #e6e6e6;
          right: -8px;
          top: -4px;
        }
      }

      &.active {
        background: rgba(95, 111, 255, 0.08);
        color: #4857E2;
      }

      &:hover {
        background: rgba(215, 215, 215, 0.6);
      }
    }

    .bf-float-toolbar__item > span {
      font-size: 14px;
    }

    .bf-float-toolbar__item > i {
      font-size: inherit;
      color: inherit;
    }
  `],
  standalone: true,
  imports: [
    NgForOf,
    NgIf
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FloatToolbar {
  @Input() activeMenu?: Set<string>
  @Input({required: true}) toolbarList: IToolbarItem[] = []
  @Output() itemClick = new EventEmitter<{ item: IToolbarItem, event: MouseEvent }>

  @HostListener('mousedown', ['$event'])
  onMouseEvent(event: MouseEvent) {
    event.stopPropagation()
    event.preventDefault()
  }

  onItemClick(event: MouseEvent, item: IToolbarItem) {
    event.stopPropagation()
    this.itemClick.emit({item, event})
  }
}
