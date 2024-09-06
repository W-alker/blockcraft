import {Component, EventEmitter, HostListener, Input, Output,} from "@angular/core";
import {NgForOf, NgIf} from "@angular/common";
import {BaseBlock} from "@core";
import {ISparkEvent, ISparkItem} from "./spark-item.type";

@Component({
  selector: 'div.spark-popover',
  standalone: true,
  template: `
      <div class="spark-popover__gap"></div>
      <div class="spark-popover__container">
          <ng-container *ngIf="activeBlock.nodeType === 'editable' ">
              <h4 class="title">基础</h4>
              <ul class='base-list'>
                  <li class="base-list__item" *ngFor="let item of baseBlockList" [title]="item.description"
                      (mousedown)="onMouseDown($event, item, 'block')" [class.active]="activeBlock.flavour === item.flavour" >
                      <i [class]="item.icon"></i>
                  </li>
              </ul>
          </ng-container>

          <ng-container *ngIf="hasContent">
              <div class="line"></div>
              <ul class="common-list">
                  <li class="common-list__item" *ngFor="let item of toolList"
                      (mousedown)="onMouseDown($event, item, 'tool')">
                      <i [class]="item.icon"></i>
                      <span>{{ item.label }}</span>
                  </li>
              </ul>
              <div class="line"></div>
          </ng-container>

          <h4 class="title">常用</h4>
          <ul class='common-list'>
              <li class="common-list__item" *ngFor="let item of commonBlockList"
                  (mousedown)="onMouseDown($event, item, 'block')">
                  <i [class]="item.icon"></i>
                  <span>{{ item.label }}</span>
              </li>
          </ul>
      </div>
      <div class="spark-popover__gap"></div>
  `,
  imports: [NgForOf, NgIf],
  styles: [`
    @keyframes bf_scale {
      from {
        transform: scale(0.3);
      }
      to {
        transform: scale(1);
      }
    }

    :host {
      position: absolute;
      animation: bf_scale 0.2s;
      transform-origin: top left;
    }

    .spark-popover__gap {
      height: 8px;
    }

    .spark-popover__container {
      padding: 8px 0;
      width: 224px;
      background: #fff;
      border-radius: 4px;
      border: 1px solid #E6E6E6;
      box-shadow: 0px 0px 20px 0px rgba(0, 0, 0, 0.10);
    }

    .title {
      margin: 8px 16px 0 16px;
      color: #999;
      font-size: 14px;
      font-weight: 600;
      line-height: 140%; /* 19.6px */
    }

    .line {
      height: 1px;
      background: #f3f3f3;
      width: 100%;
    }

    .base-list {
      display: flex;
      flex-wrap: wrap;
      padding: 8px 12px;
      gap: 8px;
    }

    .base-list__item {
      width: 24px;
      height: 24px;
      border-radius: 4px;
      display: flex;
      justify-content: center;
      align-items: center;
      cursor: pointer;
    }

    .base-list__item:hover, .base-list__item.active {
      background: #f3f3f3;
    }

    .base-list__item > i {
      font-size: 16px;
    }

    .common-list {
      padding: 8px;
    }

    .common-list__item {
      display: flex;
      align-items: center;
      gap: 8px;
      height: 36px;
      padding: 0 8px;
      border-radius: 4px;
      cursor: pointer;
    }

    .common-list__item:hover {
      background-color: #f5f5f5;
    }

    .common-list__item > i {
      font-size: 14px;
    }

    .common-list__item > span {
      color: #333;
      font-size: 14px;
      line-height: 20px;
    }
  `]
})
export class SparkPopover {
  @Input({required: true}) hasContent = false
  @Input({required: true}) activeBlock!: BaseBlock

  @Input({required: true}) baseBlockList: ISparkItem[] = []
  @Input({required: true}) commonBlockList: ISparkItem[] = []
  @Input({required: true}) toolList: ISparkItem[] = []

  @Output() itemClick = new EventEmitter<ISparkEvent>()

  @HostListener('click', ['$event'])
  onClick(event: MouseEvent) {
    event.stopPropagation()
  }

  onMouseDown(event: MouseEvent, item: ISparkItem, type: 'block' | 'tool') {
    event.preventDefault()
    event.stopPropagation()
    if(type === 'block' && this.activeBlock.flavour === item.flavour) return
    this.itemClick.emit({item, type})
  }

}
