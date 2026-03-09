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
      @for (item of defaultMenuList; track item.name + item.value) {
        <bc-float-toolbar-item [name]="item.name" [value]="activeAttrs.has(item.name) ? null : true"
                               [icon]="item.icon" [title]="item.intro" [active]="activeAttrs.has(item.name)">
        </bc-float-toolbar-item>
      }

      <span class="bc-float-toolbar__divider"></span>
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
      position: absolute;
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
    if (!selection || selection.kind === 'block' || selection.kind === 'table') return

    const {from} = selection
    if (from.type === 'text') {
      this.utils.formatText(attrs, selection)
    }
  }

  onColorPicked(evt: { type: string; color: string | null; group: ColorGroup }) {
    switch (evt.type) {
      case 'color':
        this.formatText({'s:color': evt.color})
        break
      case 'backColor':
        this.formatText({'s:background': evt.color})
        break
    }
    this.doc.selection.recalculate()
  }
}
