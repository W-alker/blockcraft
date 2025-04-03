import {ChangeDetectionStrategy, Component, EventEmitter, HostListener, Input, Output} from "@angular/core";
import {BUILTIN_BG_COLOR_LIST, BUILTIN_COLOR_LIST, IColorItem} from "./const";
import {NgForOf} from "@angular/common";

export interface ColorGroup {
  title: string
  type: string
  list: IColorItem[] | readonly IColorItem[]
  templateUse: 'font' | 'fill'
}

@Component({
  selector: 'color-picker',
  template: `
    @for (colorGroup of colorGroups; track colorGroup.title) {
      <div class="color-group">
        <div class="color-group-title">{{ colorGroup.title }}</div>
        <div class="color-group-list">
          @if (colorGroup.templateUse == 'font') {

            @for (item of colorGroup.list; track item.value) {
              <span class="color-group-list__item" [class.active]="item.value === activeList[colorGroup.type]"
                    (mousedown)="pickColor(colorGroup.type, item.value, colorGroup)"
                    [style.color]="item.value || 'var(--bc-color)'"
                    style="border: 1px solid #eee;">
                A
              </span>
            }

          } @else {

            @for (item of colorGroup.list; track item.value) {
              @if (item.value == 'transparent') {
                <span class="color-group-list__item" [class.active]="activeList[colorGroup.type] === 'transparent'"
                      style="border: 1px solid #eee; background: linear-gradient(-45deg, transparent 49%, black 50%, transparent 51%);"
                      (mousedown)="pickColor(colorGroup.type, item.value, colorGroup)">
                </span>
              } @else {
                <span class="color-group-list__item"
                      [class.active]="item.value === activeList[colorGroup.type]" [style.background-color]="item.value"
                      (mousedown)="pickColor(colorGroup.type, item.value, colorGroup)">
                </span>
              }
            }

          }
        </div>
      </div>
    }
  `,
  styles: [`
    :host {
      display: block;
      background: var(--bf-bg);
      box-shadow: 0 0 20px 0 rgba(0, 0, 0, 0.10);
      overflow: hidden;
      padding: 8px;
      border-radius: 4px;
    }

    .color-group {
      margin-bottom: 8px;

      &:last-child {
        margin-bottom: 0;
      }

      &-title {
        margin: 0 0 4px;
        color: #999;
        font-size: 14px;
        font-style: normal;
        font-weight: 600;
        line-height: 20px;
      }

      &-list {
        width: 224px;
        display: flex;
        justify-content: space-around;
        flex-wrap: wrap;

        &__item {
          width: 20px;
          height: 20px;
          border-radius: 4px;
          cursor: pointer;
          text-align: center;
          line-height: 20px;

          &:hover {
            outline: 2px solid rgba(72, 87, 226, 0.6);
          }

          &.active {
            outline: 2px solid #4857E2;
          }
        }
      }
    }
  `],
  standalone: true,
  imports: [NgForOf],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ColorPickerComponent {
  @Input()
  colorGroups: ColorGroup[] = [
    {
      title: '字体颜色',
      type: 'color',
      list: BUILTIN_COLOR_LIST,
      templateUse: 'font'
    },
    {
      title: '背景颜色',
      type: 'backColor',
      list: BUILTIN_BG_COLOR_LIST,
      templateUse: 'fill'
    }
  ]

  activeList: Record<string, string | null> = {
    color: null,
    backColor: null
  }

  @Input()
  set activeColors(list: typeof this.activeList) {
    this.activeList = list
  }

  @Output()
  colorPicked = new EventEmitter<{ type: string, color: string | null, group: ColorGroup }>()

  pickColor(type: string, color: string | null, group: ColorGroup) {
    this.colorPicked.emit({type, color, group})
  }

  @HostListener('mousedown', ['$event'])
  onMouseDown(event: MouseEvent) {
    event.preventDefault()
    event.stopPropagation()
  }

}
