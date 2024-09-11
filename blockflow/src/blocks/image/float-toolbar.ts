import {Component, EventEmitter, Input, Output} from "@angular/core";
import {NgForOf, NgIf} from "@angular/common";
import {IImageBlockProps} from "@blocks/image/type";

export interface IToolbarItem {
  name: string
  icon?: string
  value?: string
  title?: string
}

const TOOLBAR_LIST: IToolbarItem[] = [
  // {
  //   name: 'caption',
  //   icon: 'editor editor-wenben',
  //   title: '添加标题',
  // },
  {
    name: 'line',
  },
  {
    name: 'align',
    icon: 'editor editor-xuqiuwendang_wenzhongzuoduiqi',
    value: 'start',
    title: '居左'
  },
  {
    name: 'align',
    icon: 'editor editor-xuqiuwendang_wenzhongyouduiqi',
    value: 'center',
    title: '居中'
  },
  {
    name: 'align',
    icon: 'editor editor-align_the_text_to_the_center',
    value: 'end',
    title: '居右'
  },
  {
    name: 'line',
  },
  {
    name: 'copy-link',
    icon: 'editor editor-xuqiuwendang_fuzhi',
    title: '复制图片链接'
  },
  {
    name: 'download',
    icon: 'editor editor-download_pictures',
    title: '下载图片'
  }
]

@Component({
  selector: 'div.img-block__toolbar',
  template: `
    <div class="img-block__toolbar__item" title="添加图片标题" (click)="onItemClick('caption')">
      <i class="editor editor-wenben"></i>
    </div>
    <ng-container *ngFor="let item of toolbarList">
      <ng-container *ngIf="item.name !== 'line'; else lineTpl">
        <div class="img-block__toolbar__item" [title]="item.title" (click)="onItemClick(item.name, item.value)"
             [class.active]="item.value && props[item.name] === item.value">
          <i [class]="item.icon"></i>
        </div>
      </ng-container>

      <ng-template #lineTpl>
        <div class="img-block__toolbar__line"></div>
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

      .img-block__toolbar__line {
          width: 1px;
          height: 100%;
          background: #E6E6E6;
      }

      .img-block__toolbar__item {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 24px;
          height: 24px;
          cursor: pointer;
          border-radius: 4px;
      }

      .img-block__toolbar__item > i {
          font-size: 16px;
          color: #333;
      }

      .img-block__toolbar__item:hover {
          background: rgba(215, 215, 215, 0.6);
      }

      .img-block__toolbar__item.active {
          background: rgba(95, 111, 255, 0.08);
      }
  `],
  standalone: true,
  imports: [
    NgForOf,
    NgIf
  ]
})
export class ImageBlockFloatToolbar {
  @Input({required: true}) props!: IImageBlockProps

  @Output() itemClick = new EventEmitter<Pick<IToolbarItem, 'name' | 'value'>>

  onItemClick(name: string, value?: string) {
    this.itemClick.emit({name, value})
  }

  protected readonly toolbarList = TOOLBAR_LIST

}
