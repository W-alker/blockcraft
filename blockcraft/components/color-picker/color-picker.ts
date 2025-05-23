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
  selector: 'bc-color-picker',
  template: `
    @for (colorGroup of colorGroups; track colorGroup.title) {
      <div class="bc-color-group">
        <div class="bc-color-group-title">{{ colorGroup.title }}</div>
        <div class="bc-color-group-list">
          @if (colorGroup.templateUse == 'font') {

            @for (item of colorGroup.list; track item.value) {
              <span class="bc-color-group-list__item" [class.active]="item.value === activeList[colorGroup.type]"
                    (mousedown)="pickColor(colorGroup.type, item.value, colorGroup)"
                    [style.color]="item.value || 'var(--bc-color)'"
                    style="border: 1px solid #eee;">
                A
              </span>
            }

          } @else {

            @for (item of colorGroup.list; track item.value) {
              @if (item.value == 'transparent') {
                <span class="bc-color-group-list__item" [class.active]="activeList[colorGroup.type] === 'transparent'"
                      style="border: 1px solid #eee; background: linear-gradient(-45deg, transparent 49%, black 50%, transparent 51%);"
                      (mousedown)="pickColor(colorGroup.type, item.value, colorGroup)">
                </span>
              } @else {
                <span class="bc-color-group-list__item"
                      [class.active]="item.value === activeList[colorGroup.type]" [style.background-color]="item.value"
                      (mousedown)="pickColor(colorGroup.type, item.value, colorGroup)">
                </span>
              }
            }

          }
        </div>
      </div>
    }

    <ng-content></ng-content>
  `,
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
