import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, Output } from "@angular/core";
import { BcFloatToolbarItemComponent, FloatingToolbarComponent, FloatingToolbarState } from "../../../components";
import { CsTooltipDirective } from "@cses/ui";
import {
  BLOCK_OBJECT_LAYOUT_OPTIONS,
  BlockObjectLayout,
} from "../../../framework";
import {INLINE_IMAGE_WRAP_LAYOUT_OPTION} from './inline-image-layout-options';
import {OBJECT_FORMAT_POPUP_STYLES, ObjectFormatPopupState} from '../../object-format-toolbar/object-format-popup';

export interface IImageToolbarItem {
  name: string
  icon: string
  label: string
}

const ALIGN_LIST = [
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
@Component({
  selector: 'bc-image-toolbar',
  host: {'(mousedown)': '$event.preventDefault()'},
  template: `
    <bc-floating-toolbar [state]="toolbarState" [side]="side" [constrainHeight]="true" label="图片工具栏" (collapsedChange)="popup.close()">
      @if (!toolbarState.collapsed()) {
        <div class="object-format" [class.object-format--left]="side === 'left'" contenteditable="false" data-bc-image-format-toolbar>
          <nav class="object-format__rail" aria-label="图片快捷工具">
            @if (!isGrouped) {
              <button type="button" aria-label="布局" csTooltip="布局" [csTooltipDisabled]="!!popup.activePanel"
                [class.active]="popup.activePanel === 'layout'" [attr.aria-expanded]="popup.activePanel === 'layout'"
                (click)="popup.toggle('layout')">
                <i class="bc_icon bc_buju" aria-hidden="true"></i>
              </button>
            }
            @if (!isAbsolute) {
              <button type="button" [attr.aria-label]="imgBlock.childrenLength ? '取消图片标题' : '添加图片标题'"
                [csTooltip]="imgBlock.childrenLength ? '取消图片标题' : '添加图片标题'" [csTooltipDisabled]="!!popup.activePanel"
                [class.active]="imgBlock.childrenLength > 0" [attr.aria-pressed]="imgBlock.childrenLength > 0" (click)="activate(captionItem)">
                <bc-float-toolbar-item #captionItem name="caption" icon="bc_tianjiamiaoshu" aria-hidden="true" />
              </button>
            }
            <button type="button" aria-label="下载图片" csTooltip="下载图片" [csTooltipDisabled]="!!popup.activePanel" (click)="activate(downloadItem)">
              <bc-float-toolbar-item #downloadItem name="download" icon="bc_xiazai" aria-hidden="true" />
            </button>
            <button type="button" aria-label="复制图片链接" csTooltip="复制图片链接" [csTooltipDisabled]="!!popup.activePanel" (click)="activate(copyItem)">
              <bc-float-toolbar-item #copyItem name="copy-url" icon="bc_tupianlianjie" aria-hidden="true" />
            </button>
            @if (extraItems.length) {
              <span class="object-format__rail-divider"></span>
              @for (item of extraItems; track item.name) {
                <button type="button" [attr.aria-label]="item.label" [csTooltip]="item.label" [csTooltipDisabled]="!!popup.activePanel" (click)="activate(extraItem)">
                  <bc-float-toolbar-item #extraItem [name]="item.name" [icon]="item.icon" aria-hidden="true" />
                </button>
              }
            }
          </nav>
          @if (popup.activePanel === 'layout' && !isGrouped) {
            <aside class="object-format__panel object-layout-panel" aria-label="图片布局">
              <div class="object-format__scroll">
                <div class="object-layout-list">
                  @for (item of layoutOptions; track item.value) {
                    <button type="button" class="object-layout-option" [class.active]="objectLayout === item.value"
                      [attr.aria-pressed]="objectLayout === item.value" [attr.aria-label]="item.label" [csTooltip]="item.label" (click)="activate(layoutItem)">
                      <bc-float-toolbar-item #layoutItem name="object-layout" [value]="item.value" [icon]="item.icon" aria-hidden="true" />
                      <span>{{ item.label }}</span>
                      @if (objectLayout === item.value) {<i class="bc_icon bc_xuanzhong object-layout-option__check" aria-hidden="true"></i>}
                    </button>
                  }
                </div>
                @if (!isAbsolute) {
                  <div class="object-layout-tools object-layout-segmented" aria-label="图片对齐">
                    @for (item of ALIGN_LIST; track item.value) {
                      <button type="button" class="object-layout-action" [class.active]="imgBlock.props.align === item.value"
                        [attr.aria-pressed]="imgBlock.props.align === item.value" [attr.aria-label]="item.intro" [csTooltip]="item.intro" (click)="activate(alignItem)">
                        <bc-float-toolbar-item #alignItem name="align" [value]="item.value" [icon]="item.icon" aria-hidden="true" />
                        <span>{{ item.intro }}</span>
                      </button>
                    }
                  </div>
                }
                @if (isAbsolute) {
                  <div class="object-layout-tools">
                    <button type="button" class="object-layout-action" aria-label="上移一层" csTooltip="上移一层" [disabled]="!canMoveForward" (click)="activate(forwardItem)">
                      <bc-float-toolbar-item #forwardItem name="move-forward" icon="bc_cengji-shangyi" [disabled]="!canMoveForward" aria-hidden="true" /><span>上移一层</span>
                    </button>
                    <button type="button" class="object-layout-action" aria-label="下移一层" csTooltip="下移一层" [disabled]="!canMoveBackward" (click)="activate(backwardItem)">
                      <bc-float-toolbar-item #backwardItem name="move-backward" icon="bc_cengji-xiayi" [disabled]="!canMoveBackward" aria-hidden="true" /><span>下移一层</span>
                    </button>
                  </div>
                }
              </div>
            </aside>
          }
        </div>
      }
    </bc-floating-toolbar>
  `,
  styles: `${OBJECT_FORMAT_POPUP_STYLES}
    button{display:flex;align-items:center;justify-content:center;box-sizing:border-box;border:0;border-radius:6px;background:transparent;color:inherit;font:inherit;cursor:pointer}
    button:hover:not(:disabled){background:var(--bc-float-toolbar-item-hover-bg,#f1f5f9)}
    button:focus-visible{outline:2px solid var(--bc-active-color,#4857e2);outline-offset:1px}
    button:disabled{opacity:.45;cursor:not-allowed}
    button.active{background:color-mix(in srgb,var(--bc-active-color,#4857e2) 8%,transparent);color:var(--bc-active-color,#4857e2)}
    bc-float-toolbar-item{display:inline-flex;align-items:center;justify-content:center;font-size:14px;pointer-events:none}
    bc-float-toolbar-item ::ng-deep .bc_icon{font-size:inherit}

  `,
  imports: [BcFloatToolbarItemComponent, CsTooltipDirective, FloatingToolbarComponent],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ImageToolbar {

  @Input() toolbarState = new FloatingToolbarState();
  @Input() side: 'left' | 'right' = 'right';
  readonly popup = new ObjectFormatPopupState<'layout'>();
  @Output() readonly panelChange = this.popup.panelChange;

  activate(item: BcFloatToolbarItemComponent): void {
    if (item.disabled || (item.name === 'align' && this.isAbsolute)) return;
    this.onItemClicked.emit(item);
  }

  private _imgBlock!: BlockCraft.IBlockComponents['image'];
  @Input({ required: true })
  set imgBlock(val: BlockCraft.IBlockComponents['image']) {
    this._imgBlock = val;
  }

  get imgBlock() {
    return this._imgBlock;
  }

  get objectLayout(): BlockObjectLayout {
    return this._imgBlock?.doc.placement.getObjectLayout(this._imgBlock) ?? 'top-bottom'
  }

  get isAbsolute(): boolean {
    return this._imgBlock?.doc.placement.getState(this._imgBlock).mode ===
      'absolute'
  }

  get isGrouped(): boolean {
    return this._imgBlock?.doc.placement.isInObjectGroup?.(this._imgBlock) ?? false
  }

  get layoutOptions() {
    return this.LAYOUT_OPTIONS.filter(({value}) =>
      (value !== 'wrap' || this.isAbsolute) &&
      this.imgBlock.doc.placement.supportsObjectLayout(this.imgBlock, value === 'wrap' ? 'inline' : value))
  }

  get canMoveForward(): boolean {
    return this._imgBlock?.doc.placement.canMoveForward(this._imgBlock) ?? false
  }

  get canMoveBackward(): boolean {
    return this._imgBlock?.doc.placement.canMoveBackward(this._imgBlock) ?? false
  }

  @Input()
  extraItems: IImageToolbarItem[] = []

  @Output()
  readonly onItemClicked = new EventEmitter<BcFloatToolbarItemComponent>();

  constructor(
    public readonly cdr: ChangeDetectorRef
  ) {
  }

  protected readonly ALIGN_LIST = ALIGN_LIST;
  protected readonly LAYOUT_OPTIONS = [
    BLOCK_OBJECT_LAYOUT_OPTIONS[0],
    INLINE_IMAGE_WRAP_LAYOUT_OPTION,
    ...BLOCK_OBJECT_LAYOUT_OPTIONS.slice(1),
  ] as const;
}
