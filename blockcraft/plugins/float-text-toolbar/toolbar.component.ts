import {
  ChangeDetectionStrategy, ChangeDetectorRef,
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
} from "../../components";
import {SimpleValue} from "../../global";
import {NgForOf, NgIf} from "@angular/common";
import {ORIGIN_SKIP_SYNC} from "../../framework";
import {IInlineNodeAttrs} from "../../framework/types";
import {Overlay} from "@angular/cdk/overlay";
import {ComponentPortal} from "@angular/cdk/portal";
import {merge} from "rxjs";
import {takeUntilDestroyed} from "@angular/core/rxjs-interop";
import {LinkInputPad} from "./link-input-pad";
import {TextToolbarUtils} from "./utils";

export interface IToolbarMenuItem {
  label?: string
  name: string
  value: SimpleValue
  active?: boolean
  icon?: string
  intro?: string
  divide?: boolean
}

const ALIGN_LIST: IToolbarMenuItem[] = [
  {
    name: "align",
    icon: "bc_zuoduiqi",
    intro: "左对齐",
    value: undefined,
  },
  {
    name: "align",
    value: "center",
    icon: "bc_juzhongduiqi",
    intro: "居中",
  },
  {
    name: "align",
    value: "right",
    icon: "bc_youduiqi",
    intro: "右对齐",
  }
]

const DEFAULT_MENU_LIST: IToolbarMenuItem[] = [
  // ...ALIGN_LIST,
  {
    name: "bold",
    icon: "bc_jiacu",
    intro: "加粗",
    value: true,
    divide: true
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
  },
  {
    name: "code",
    icon: "bc_daimakuai",
    intro: "代码",
    value: true,
  },
  {
    name: "sup",
    icon: "bc_shangbiao",
    intro: "上标",
    value: true,
  },
  {
    name: "sub",
    icon: "bc_xiabiao",
    intro: "代码",
    value: true,
  }
]

@Component({
  selector: "div.float-text-toolbar",
  template: `
    <bc-float-toolbar (onItemClick)="onItemClicked($event)">
      <bc-float-toolbar-item icon="bc_zuoduiqi" [expandable]="true"
                             [bcOverlayTrigger]="alignFloatBar" [positions]="['bottom-left']" [offsetY]="8"/>

      @for (item of defaultMenuList; track item.name + item.value) {
        @if (item.divide) {
          <span class="bc-float-toolbar__divider"></span>
        }

        <bc-float-toolbar-item [name]="item.name" [value]="activeAttrs.has(item.name) ? null : true"
                               [icon]="item.icon" [title]="item.intro" [active]="activeAttrs.has(item.name)">
        </bc-float-toolbar-item>
      }

      <bc-float-toolbar-item name="link" value="true" icon="bc_lianjie" title="链接" *ngIf="isLinkAble">
      </bc-float-toolbar-item>

      <span class="bc-float-toolbar__divider"></span>
      <bc-float-toolbar-item icon="bc_sepan" [bcOverlayTrigger]="colorPicker" [positions]="['bottom-left']" [offsetY]="8"/>

    </bc-float-toolbar>

    <ng-template #colorPicker>
      <color-picker (colorPicked)="onColorPicked($event)" [activeColors]="activeColors"></color-picker>
    </ng-template>

    <ng-template #alignFloatBar>
      <bc-float-toolbar [direction]="'column'" (onItemClick)="onItemClicked($event)">
        <bc-float-toolbar-item *ngFor="let item of alignList" [name]="item.name"
                               [active]="activeTextAlign === item.value"
                               [value]="item.value" [icon]="item.icon">{{ item.intro }}
        </bc-float-toolbar-item>
      </bc-float-toolbar>
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
export class FloatTextToolbarComponent {
  @Input({required: true})
  doc!: BlockCraft.Doc

  @Input({required: true})
  utils!: TextToolbarUtils

  @HostBinding('style')
  @Input()
  style: string = ''

  @Output()
  onDestroy: EventEmitter<void> = new EventEmitter<void>()

  @HostListener('mouseenter', ['$event'])
  onMouseEnter(e: MouseEvent) {
    e.stopPropagation()
    e.preventDefault()
  }

  @HostListener('mousemove', ['$event'])
  onMouseMove(e: MouseEvent) {
    e.stopPropagation()
    e.preventDefault()
  }

  defaultMenuList: IToolbarMenuItem[] = DEFAULT_MENU_LIST
  alignList: IToolbarMenuItem[] = ALIGN_LIST

  @Input({required: true})
  activeAttrs = new Set<string>()

  @Input({required: true})
  activeColors: Record<string, string | null> = {}

  @Input({required: true})
  activeTextAlign: string | undefined | null = undefined

  isLinkAble = false

  constructor() {
  }

  ngOnInit() {
    const selection = this.doc.selection.value!
    this.isLinkAble = selection.isInSameBlock && selection.from.type === 'text'
  }

  ngOnDestroy() {
    this.onDestroy.emit()
  }

  onItemClicked(evt: BcFloatToolbarItemComponent) {
    switch (evt.name) {
      case 'align':
        this.setTextAlign(evt.value as string)
        break
      case 'italic':
      case 'bold':
      case 'underline':
      case 'strike':
      case 'code':
      case 'sub':
      case 'sup':
        this.formatText({['a:' + evt.name]: evt.value})
        evt.value === true ? this.activeAttrs.add(evt.name) : this.activeAttrs.delete(evt.name)
        break
      case 'link':
        this.onLink()
        break
    }
  }

  setTextAlign(textAlign: string) {
    const selection = this.doc.selection.value
    if (!selection) return

    this.doc.crud.transact(() => {
      const between = this.doc.queryBlocksBetween(selection.firstBlock, selection.lastBlock, true)
      for (const id of between) {
        const block = this.doc.getBlockById(id)
        if (!this.doc.isEditable(block) || block.flavour === 'code') continue;
        block.updateProps({'textAlign': textAlign as any})
      }
      this.activeTextAlign = textAlign
    }, ORIGIN_SKIP_SYNC)
  }

  formatText(attrs: IInlineNodeAttrs) {
    this.utils.formatText(attrs)
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

  onLink() {
    const selection = this.doc.selection.value!
    const selectionJSON = selection.toJSON()

    const rect = selection.raw.getBoundingClientRect()
    const fake = this.doc.selection.createFakeRange(selection)
    const overlay = this.doc.injector.get(Overlay)

    const positionStrategy = overlay.position().global().top(rect.bottom + 'px').left(rect.left + 'px')
    const portal = new ComponentPortal(LinkInputPad)
    const ovr = overlay.create({
      positionStrategy,
      hasBackdrop: true,
      backdropClass: 'cdk-overlay-transparent-backdrop',
    })

    const close = () => {
      ovr.dispose()
      fake.remove()
      this.doc.selection.replay(selectionJSON)
    }
    const cpr = ovr.attach(portal)
    merge(ovr.backdropClick(), cpr.instance.onCancel).pipe(takeUntilDestroyed(cpr.instance.destroyRef)).subscribe(close)
    cpr.instance.onConfirm.pipe(takeUntilDestroyed(cpr.instance.destroyRef)).subscribe((url: string) => {
      close()
      if (selection.from.type !== 'text') return
      const {index, length} = selection.from
      // const deltas: DeltaOperation[] = []
      // if (index > 0) {
      //   deltas.push({retain: index})
      // }
      // deltas.push({delete: length})
      // deltas.push({
      //   insert: {link: range.toString()},
      //   attributes: {'d:href': url}
      // })
      selection.from.block.formatText(index, length, {'a:link': url})
    })
  }
}
