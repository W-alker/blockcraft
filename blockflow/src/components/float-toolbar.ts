import {Component, EventEmitter, HostListener, Input, Output} from "@angular/core";
import {NgForOf, NgIf} from "@angular/common";

export interface IToolbarItem {
  name: string | '|'
  icon?: string
  value?: string
  title?: string
  text?: string
  active?: boolean
}

@Component({
  selector: 'div.bf-float-toolbar',
  template: `
    <ng-container *ngFor="let item of toolbarList">
      <ng-container *ngIf="item.name !== '|'; else lineTpl">
        <div class="bf-float-toolbar__item" [title]="item.title" (click)="onItemClick($event, item)"
             [class.active]="item.active">
          <i [class]="item.icon"></i><span *ngIf="item.text">{{item.text}}</span>
        </div>
      </ng-container>

      <ng-template #lineTpl>
        <div class="bf-float-toolbar__line"></div>
      </ng-template>
    </ng-container>
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
          box-shadow: 0px 0px 20px 0px rgba(0, 0, 0, 0.10);
      }

      .bf-float-toolbar__line {
          width: 1px;
          height: 100%;
          background: #E6E6E6;
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
      }

      .bf-float-toolbar__item > span {
          font-size: 14px;
      }

      .bf-float-toolbar__item > i {
        font-size: inherit;
        color: inherit;
      }

      .bf-float-toolbar__item:hover {
          background: rgba(215, 215, 215, 0.6);
      }

      .bf-float-toolbar__item.active {
          background: rgba(95, 111, 255, 0.08);
          color: #4857E2;
      }

  `],
  standalone: true,
  imports: [
    NgForOf,
    NgIf
  ]
})
export class FloatToolbar {
  @Input({required: true}) toolbarList: IToolbarItem[] = []
  @Output() itemClick = new EventEmitter<IToolbarItem>

  @HostListener('mousedown', ['$event'])
  onMouseEvent(event: MouseEvent) {
    event.stopPropagation()
    event.preventDefault()
  }

  onItemClick(event: MouseEvent, item: IToolbarItem) {
    event.stopPropagation()
    this.itemClick.emit(item)
  }
}
