import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, Output } from "@angular/core";
import { BcFloatToolbarComponent, BcFloatToolbarItemComponent } from "../../../components";
import { NzTooltipDirective } from "ng-zorro-antd/tooltip";
import {
  BLOCK_OBJECT_LAYOUT_OPTIONS,
  BlockObjectLayout,
} from "../../../framework";
import {INLINE_IMAGE_WRAP_LAYOUT_OPTION} from './inline-image-layout-options';

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
  template: `
    <bc-float-toolbar (onItemClick)="onItemClicked.emit($event)">
      <bc-float-toolbar-item
        icon="bc_tianjiamiaoshu"
        name="caption"
        [nz-tooltip]="imgBlock.childrenLength > 0 ? '取消图片标题' : '添加图片标题'"
        [attr.aria-label]="imgBlock.childrenLength > 0 ? '取消图片标题' : '添加图片标题'"
        [active]="imgBlock.childrenLength > 0">
      </bc-float-toolbar-item>

      <span class="bc-float-toolbar__divider"></span>

      @for (item of ALIGN_LIST; track item.value) {
        <bc-float-toolbar-item [name]="item.name" [icon]="item.icon" [value]="item.value"
                               [nz-tooltip]="item.intro" [attr.aria-label]="item.intro"
                               [active]="imgBlock.props.align === item.value"></bc-float-toolbar-item>
      }

      <span class="bc-float-toolbar__divider"></span>
      @for (item of LAYOUT_OPTIONS; track item.value) {
        @if (item.value !== 'wrap' || isAbsolute) {
          <bc-float-toolbar-item
            [icon]="item.icon"
            name="object-layout"
            [value]="item.value"
            [nz-tooltip]="item.label"
            [attr.aria-label]="item.label"
            [active]="objectLayout === item.value">
          </bc-float-toolbar-item>
        }
      }

      @if (isAbsolute) {
        <span class="bc-float-toolbar__divider"></span>
        <bc-float-toolbar-item
          icon="bc_cengji-shangyi"
          name="move-forward"
          nz-tooltip="上移一层"
          aria-label="上移一层"
          [disabled]="!canMoveForward">
        </bc-float-toolbar-item>
        <bc-float-toolbar-item
          icon="bc_cengji-xiayi"
          name="move-backward"
          nz-tooltip="下移一层"
          aria-label="下移一层"
          [disabled]="!canMoveBackward">
        </bc-float-toolbar-item>
      }

      <span class="bc-float-toolbar__divider"></span>
      <bc-float-toolbar-item
        icon="bc_xiazai"
        name="download"
        nz-tooltip="下载图片"
        aria-label="下载图片">
      </bc-float-toolbar-item>
      <bc-float-toolbar-item
        icon="bc_tupianlianjie"
        name="copy-url"
        nz-tooltip="复制图片链接"
        aria-label="复制图片链接">
      </bc-float-toolbar-item>

      @if (extraItems.length) {
        <span class="bc-float-toolbar__divider"></span>
        @for (item of extraItems; track item.name) {
          <bc-float-toolbar-item
            [icon]="item.icon"
            [name]="item.name"
            [nz-tooltip]="item.label"
            [attr.aria-label]="item.label">
          </bc-float-toolbar-item>
        }
      }
    </bc-float-toolbar>
  `,
  styles: [``],
  imports: [
    BcFloatToolbarComponent,
    BcFloatToolbarItemComponent,
    NzTooltipDirective
  ],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ImageToolbar {

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
