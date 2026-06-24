import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  HostBinding,
  HostListener,
  Input,
  Output
} from "@angular/core";
import {
  BcFloatToolbarComponent,
  BcFloatToolbarItemComponent,
  BcOverlayTriggerDirective,
  ColorGroup,
  ColorPickerComponent
} from "../../../components";
import {SimpleValue} from "../../../global";
import {NgForOf, NgIf} from "@angular/common";
import {IInlineNodeAttrs} from "../../../framework";
import {TextToolbarUtils} from "../utils";

export interface IToolbarMenuItem {
  label?: string
  name: string
  value: SimpleValue
  active?: boolean
  icon?: string
  intro?: string
  divide?: boolean
}

const DEFAULT_MENU_LIST: IToolbarMenuItem[] = [
  {
    name: "bold",
    icon: "bc_jiacu",
    intro: "加粗",
    value: true,
  },
  {
    name: "strike",
    icon: "bc_shanchuxian",
    intro: "删除线",
    value: true,
  },
  {
    name: "underline",
    icon: "bc_xiahuaxian",
    intro: "下划线",
    value: true,
  },
  {
    name: "italic",
    icon: "bc_xieti",
    intro: "斜体",
    value: true,
  }
]

@Component({
  selector: "div.text-marker-toolbar",
  template: `
    <bc-float-toolbar (onItemClick)="onItemClicked($event)">
      @if (!colorOnly) {
        @for (item of defaultMenuList; track item.name + item.value) {
          <bc-float-toolbar-item [name]="item.name" [value]="activeAttrs.has(item.name) ? null : true"
                                 [icon]="item.icon" [title]="item.intro" [active]="activeAttrs.has(item.name)">
          </bc-float-toolbar-item>
        }
        <span class="bc-float-toolbar__divider"></span>
      }
      <bc-float-toolbar-item icon="bc_bianji" [bcOverlayTrigger]="colorPicker"
                             [style.color]="activeColors['color']"
                             [style.background-color]="activeColors['backColor']"/>
    </bc-float-toolbar>

    <ng-template #colorPicker>
      <bc-color-picker (colorPicked)="onColorPicked($event)" [gapAround]="8"
                       [activeColors]="activeColors"></bc-color-picker>
    </ng-template>
  `,
  styles: [`
    :host {
      z-index: 100;
      display: block;
      user-select: none;
      -webkit-user-select: none;

      ::ng-deep * {
        user-select: none;
        -webkit-user-select: none;
      }
    }
  `],
  imports: [
    BcFloatToolbarComponent,
    BcFloatToolbarItemComponent,
    BcOverlayTriggerDirective,
    NgForOf,
    ColorPickerComponent,
    NgIf
  ],
  standalone: true,
  host: {
    'contenteditable': 'false',
  },
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TextMarkerComponent {
  @Input({required: true})
  doc!: BlockCraft.Doc

  @Input({required: true})
  utils!: TextToolbarUtils

  @HostBinding('style')
  @Input()
  style: string = ''

  @Output()
  onDestroy: EventEmitter<void> = new EventEmitter<void>()

  defaultMenuList: IToolbarMenuItem[] = DEFAULT_MENU_LIST

  @Input({required: true})
  activeAttrs = new Map<string, any>()

  @Input({required: true})
  activeColors: Record<string, string | null> = {}

  @Input()
  colorOnly = false

  constructor() {
  }

  ngOnDestroy() {
    this.onDestroy.emit()
  }

  onItemClicked(evt: BcFloatToolbarItemComponent) {
    switch (evt.name) {
      case 'italic':
      case 'bold':
      case 'underline':
      case 'strike':
      case 'code':
      case 'sub':
      case 'sup':
        this.formatText({['a:' + evt.name]: evt.value})
        evt.value === true ? this.activeAttrs.set(evt.name, evt.value) : this.activeAttrs.delete(evt.name)
        break
    }
  }

  formatText(attrs: IInlineNodeAttrs) {
    const selection = this.doc.selection.value
    if (!selection) return

    if (selection.start.type === 'text') {
      const block = selection.firstBlock as any
      const s = selection.start, e = selection.end
      const len = selection.isInSameBlock && e.type === 'text' ? e.offset - s.offset : block.textLength - s.offset
      block.formatText(s.offset, len, attrs)
      // 格式化会拆分 blot 使原生选区塌缩；非折叠选区重新 setSelection 把 range 恢复回来，
      // 对齐 TextToolbarHelper.formatText（不要再 recalculate，否则会把塌缩后的 DOM 选区写回模型）。
      if (!selection.collapsed) {
        this.doc.selection.setSelection(s, e)
      }
    }
  }

  onColorPicked(evt: { type: string; color: string | null; group: ColorGroup }) {
    switch (evt.type) {
      case 'color':
        this.formatText({'s:color': evt.color})
        break
      case 'backColor':
        // 透明 = 清除背景：写 null 移除 attr，避免在 Y.Text 里留下 's:background':'transparent' 脏数据。
        // 对齐 fixed-toolbar 的处理。
        this.formatText({'s:background': evt.color === 'transparent' ? null : evt.color})
        break
    }
  }
}
