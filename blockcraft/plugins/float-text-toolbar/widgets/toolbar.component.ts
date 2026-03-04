import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  HostBinding,
  Input,
  Output,
  SimpleChanges
} from "@angular/core";
import {
  BcFloatToolbarComponent,
  BcFloatToolbarItemComponent,
  BcOverlayTriggerDirective,
  ColorGroup,
  ColorPickerComponent
} from "../../../components";
import {BlockCraftError, ErrorCode, IS_MAC, nextTick, SimpleValue} from "../../../global";
import {NgForOf, NgIf} from "@angular/common";
import {IInlineNodeAttrs, IEditableBlockProps} from "../../../framework";
import {Overlay} from "@angular/cdk/overlay";
import {ComponentPortal} from "@angular/cdk/portal";
import {merge} from "rxjs";
import {takeUntilDestroyed} from "@angular/core/rxjs-interop";
import {LinkInputPad} from "./link-input-pad";
import {TextToolbarUtils} from "../utils";
import {NzTooltipDirective} from "ng-zorro-antd/tooltip";

export interface IToolbarMenuItem {
  label?: string
  name: string
  value: SimpleValue
  active?: boolean
  icon?: string
  intro?: string
  divide?: boolean
  tip?: string
}

const HEADING_LIST: IToolbarMenuItem[] = [
  {
    name: "heading",
    icon: "bc_wenben",
    intro: "正文",
    value: null,
  },
  {
    name: "heading",
    value: 1,
    icon: "bc_biaoti_1",
    intro: "一级标题",
  },
  {
    name: "heading",
    value: 2,
    icon: "bc_biaoti_2",
    intro: "二级标题",
  },
  {
    name: "heading",
    value: 3,
    icon: "bc_biaoti_3",
    intro: "三级标题",
  },
  {
    name: "heading",
    value: 4,
    icon: "bc_biaoti_4",
    intro: "四级标题",
  }
]

export const LIST_LIST: IToolbarMenuItem[] = [
  {
    name: "list",
    icon: "bc_youxuliebiao",
    intro: "有序列表",
    value: "ordered",
  },
  {
    name: "list",
    icon: "bc_wuxuliebiao",
    intro: "无序列表",
    value: "bullet",
  },
  {
    name: "list",
    icon: "bc_gongzuoshixiang",
    intro: "待办事项",
    value: "todo",
  }
]

const ALIGN_LIST: IToolbarMenuItem[] = [
  {
    name: "align",
    icon: "bc_zuoduiqi",
    intro: "左对齐",
    value: 'left',
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
    divide: true,
    tip: `加粗：${IS_MAC ? '⌘' : 'Ctrl'}+b`
  },
  {
    name: "strike",
    icon: "bc_shanchuxian",
    intro: "删除线",
    value: true,
    tip: `删除线：${IS_MAC ? '⌘' : 'Ctrl'}+d`
  },
  {
    name: "underline",
    icon: "bc_xiahuaxian",
    intro: "下划线",
    value: true,
    tip: `下划线：${IS_MAC ? '⌘' : 'Ctrl'}+u`
  },
  {
    name: "italic",
    icon: "bc_xieti",
    intro: "斜体",
    value: true,
    tip: `斜体：${IS_MAC ? '⌘' : 'Ctrl'}+i`
  },
  {
    name: "code",
    icon: "bc_daimakuai",
    intro: "行内代码",
    value: true,
    tip: `行内代码：${IS_MAC ? '⌘' : 'Ctrl'}+e`
  },
  {
    name: "sup",
    icon: "bc_shangbiao",
    intro: "上标",
    value: true,
    tip: `上标`
  },
  {
    name: "sub",
    icon: "bc_xiabiao",
    intro: "下标",
    value: true,
    tip: `下标`
  }
]

const BG_GRAPH_LIST: Array<{ attr: string | null; class: string }> = [
  {
    attr: null,
    class: 'none'
  },
  {
    attr: 'r1',
    class: 'radius-1'
  },
  {
    attr: 'rb',
    class: 'right-border'
  }
]

@Component({
  selector: "div.float-text-toolbar",
  template: `
    <bc-float-toolbar (onItemClick)="onItemClicked($event)">
      <bc-float-toolbar-item icon="bc_wenben" [expandable]="true"
                             [bcOverlayTrigger]="formatFloatBar" [offsetX]="8">
        {{ activeHeading.intro }}
      </bc-float-toolbar-item>

      <span class="bc-float-toolbar__divider"></span>

      <bc-float-toolbar-item icon="bc_zuoduiqi" [expandable]="true"
                             [bcOverlayTrigger]="alignFloatBar" [offsetX]="8"/>

      @for (item of defaultMenuList; track item.name + item.value) {
        @if (item.divide) {
          <span class="bc-float-toolbar__divider"></span>
        }

        <bc-float-toolbar-item [name]="item.name" [value]="activeAttrs.has(item.name) ? null : true"
                               [icon]="item.icon" [title]="item.intro" [active]="activeAttrs.has(item.name)"
                               [nz-tooltip]="item.tip">
        </bc-float-toolbar-item>
      }


      <bc-float-toolbar-item name="link" [value]="activeAttrs.has('link') ? null : true"
                             [active]="activeAttrs.has('link')"
                             icon="bc_lianjie" title="链接" *ngIf="isLinkAble">
      </bc-float-toolbar-item>

      <bc-float-toolbar-item name="formula" [value]="true"
                             icon="bc_gongshi" title="行内公式" *ngIf="isLinkAble"
                             nz-tooltip="行内公式">
      </bc-float-toolbar-item>

      <span class="bc-float-toolbar__divider"></span>
      <bc-float-toolbar-item icon="bc_bianji" [bcOverlayTrigger]="colorPicker"
                             [style.color]="activeColors['color']"
                             [style.background-color]="activeColors['backColor']"/>

      <!--      @if (config.withComment && isLinkAble && !activeAttrs.has('comment')) {-->
      <!--        <span class="bc-float-toolbar__divider"></span>-->
      <!--        <bc-float-toolbar-item name="comment" [value]="activeAttrs.get('comment')"-->
      <!--                               icon="bc_pinglun" title="评论" [active]="activeAttrs.has('comment')">-->
      <!--        </bc-float-toolbar-item>-->
      <!--      }-->

    </bc-float-toolbar>

    <ng-template #formatFloatBar>
      <bc-float-toolbar [direction]="'column'" (onItemClick)="onItemClicked($event)" [gapAround]="8">
        <bc-float-toolbar-item *ngFor="let item of headingList" [name]="item.name"
                               [active]="activeHeading.value == item.value"
                               [value]="item.value" [icon]="item.icon">{{ item.intro }}
        </bc-float-toolbar-item>
        <span class="bc-float-toolbar__divider"></span>
        <bc-float-toolbar-item *ngFor="let item of listList" [name]="item.name"
                               [active]="activeFlavour == item.value"
                               [value]="item.value" [icon]="item.icon">{{ item.intro }}
        </bc-float-toolbar-item>
      </bc-float-toolbar>
    </ng-template>

    <ng-template #colorPicker>
      <bc-color-picker (colorPicked)="onColorPicked($event)" [gapAround]="8"
                       [activeColors]="activeColors">
        <div class="bc-color-group">
          <div class="bc-color-group-title">背景图形</div>
          <div class="bg-list">
            @for (item of bgGraphList; track item.attr) {
              <div class="bg-graph-item"
                   [class]="item.class"
                   [class.active]="activeAttrs.get('bg') == item.attr"
                   (click)="onBgGraphPicked(item.attr)">
                <span [style.background-color]="activeColors['backColor'] || '#f4a1a1'"
                      [style.color]="activeColors['color'] || '#ffffff'">文本</span>
              </div>
            }
          </div>
        </div>
      </bc-color-picker>
    </ng-template>

    <ng-template #alignFloatBar>
      <bc-float-toolbar [direction]="'column'" (onItemClick)="onItemClicked($event)" [gapAround]="8">
        <bc-float-toolbar-item *ngFor="let item of alignList" [name]="item.name"
                               [active]="activeProps.textAlign == item.value"
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

    .bg-list {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }

    .bg-graph-item {
      width: 46px;
      height: 27px;
      border-radius: 2px;
      border: 1px solid var(--bc-border-color);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
    }

    .bg-graph-item.active {
      border: 2px solid var(--bc-active-color);
    }

    .bg-graph-item:hover {
      border: 2px solid var(--bc-active-color-light);
    }

    .bg-graph-item > span {
      width: 35px;
      height: 16px;
      font-size: 11px;
      color: #fff;
      text-align: center;
      background-color: #f4a1a1;
    }

    .bg-graph-item.none {
      background: linear-gradient(-29deg, transparent 49%, var(--bc-color-dark) 50%, transparent 51%);
    }

    .bg-graph-item.none > span {
      display: none;
    }

    .bg-graph-item.radius-1 > span {
      border-radius: 1em;
    }

    .bg-graph-item.right-border > span {
      border-radius: .3em;
      border-right: .25em solid var(--bc-active-color);
    }
  `],
  imports: [
    BcFloatToolbarComponent,
    BcFloatToolbarItemComponent,
    BcOverlayTriggerDirective,
    NgForOf,
    ColorPickerComponent,
    NgIf,
    NzTooltipDirective
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

  defaultMenuList: IToolbarMenuItem[] = DEFAULT_MENU_LIST
  alignList: IToolbarMenuItem[] = ALIGN_LIST
  headingList: IToolbarMenuItem[] = HEADING_LIST
  listList: IToolbarMenuItem[] = LIST_LIST
  bgGraphList = BG_GRAPH_LIST

  @Input({required: true})
  activeAttrs = new Map<string, any>()

  @Input({required: true})
  activeColors: Record<string, string | null> = {}

  @Input({required: true})
  activeProps: Partial<IEditableBlockProps> = {}

  @Input()
  activeFlavour: BlockCraft.BlockFlavour = 'paragraph'

  protected activeHeading = HEADING_LIST[0]

  isLinkAble = false

  constructor() {
  }

  ngOnInit() {
    this.syncSelectionState()
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['activeProps'] || changes['activeFlavour']) {
      this.syncSelectionState()
    }
  }

  private syncSelectionState() {
    const selection = this.doc.selection.value!
    this.isLinkAble = !!selection && selection.isInSameBlock && selection.from.type === 'text'
    this.activeHeading = HEADING_LIST.find(v => v.value === this.activeProps.heading) || HEADING_LIST[0]
  }

  ngOnDestroy() {
    this.onDestroy.emit()
  }

  onItemClicked(evt: BcFloatToolbarItemComponent) {
    switch (evt.name) {
      case 'heading':
        this.setProps({heading: evt.value as any})
        this.activeHeading = HEADING_LIST.find(v => v.value === this.activeProps.heading) || HEADING_LIST[0]
        break
      case 'align':
        this.setProps({textAlign: evt.value as any})
        break
      case 'list':
        this.transformList(evt.value as any)
        break
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
      case 'link':
        evt.value ? this.onLink() : this.formatText({['a:link']: null})
        evt.value === false && this.activeAttrs.delete(evt.name)
        break
      case 'formula':
        this.onInlineFormula()
        break
    }
  }

  setProps(props: Partial<IEditableBlockProps>) {
    this.utils.updateBlockProps(props)
    this.activeProps = {...this.activeProps, ...props}
  }

  transformList(flavour: BlockCraft.BlockFlavour) {
    this.utils.transformBlocks(flavour)
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
        this.formatText({'s:background': evt.color === 'transparent' ? null : evt.color})
        break
    }
    this.doc.selection.recalculate()
  }

  onBgGraphPicked(bg: string | null) {
    this.formatText({'a:bg': bg})
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
      fake.destroy()
      nextTick().then(() => {
        this.doc.selection.replay(selectionJSON)
      })
    }
    const cpr = ovr.attach(portal)
    merge(ovr.backdropClick(), cpr.instance.onCancel).pipe(takeUntilDestroyed(cpr.instance.destroyRef)).subscribe(close)
    cpr.instance.onConfirm.pipe(takeUntilDestroyed(cpr.instance.destroyRef)).subscribe((url: string) => {
      close()
      if (selection.from.type !== 'text') return
      const {index, length} = selection.from
      selection.from.block.formatText(index, length, {'a:link': url})
    })
  }

  onInlineFormula() {
    const selection = this.doc.selection.value
    if (!selection || selection.from.type !== 'text') return
    const {block, index, length} = selection.from
    const text = selection.raw.toString()
    block.applyDeltaOperations([
      ...(index > 0 ? [{retain: index}] : []),
      {delete: length},
      {insert: {latex: text}}
    ])
  }

  // onComment() {
  //   const commentComponent = this.config.commentComponent
  //   if (!commentComponent) {
  //     throw new BlockCraftError(ErrorCode.DefaultRuntimeError, 'commentComponent is not defined')
  //   }
  //
  //   const selection = this.doc.selection.value!
  //   const selectionJSON = selection.toJSON()
  //
  //   const rect = selection.raw.getBoundingClientRect()
  //   const fake = this.doc.selection.createFakeRange(selection, {bgColor: 'rgba(255, 239, 186, .6)'})
  //   const overlay = this.doc.injector.get(Overlay)
  //
  //   const positionStrategy = overlay.position().global().top(rect.bottom + 'px').left(rect.left + 'px')
  //   const portal = new ComponentPortal(commentComponent, null, this.doc.injector)
  //   const ovr = overlay.create({
  //     positionStrategy,
  //     hasBackdrop: true,
  //     backdropClass: 'cdk-overlay-transparent-backdrop',
  //   })
  //
  //   const close = () => {
  //     ovr.dispose()
  //     fake.destroy()
  //     this.doc.selection.replay(selectionJSON)
  //   }
  //   const cpr = ovr.attach(portal)
  //   cpr.setInput('selection', selectionJSON)
  //   cpr.setInput('doc', this.doc)
  //   cpr.setInput('commentId', this.activeAttrs.get('commentId'))
  //   cpr.setInput('close', close)
  //
  //   merge(ovr.backdropClick(), cpr.instance.onCancel).pipe(takeUntilDestroyed(cpr.instance.destroyRef)).subscribe(close)
  // }
}
