import {ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, Output} from "@angular/core";
import {BcFloatToolbarComponent, BcFloatToolbarItemComponent} from "../../../components";

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
      <bc-float-toolbar-item icon="bc_tianjiamiaoshu" name="caption" [active]="imgBlock.childrenLength > 0">
      </bc-float-toolbar-item>

      <span class="bc-float-toolbar__divider"></span>

      @for (item of ALIGN_LIST; track item.value) {
        <bc-float-toolbar-item [name]="item.name" [icon]="item.icon" [value]="item.value"
                               [title]="item.intro" [active]="imgBlock.props.align === item.value"></bc-float-toolbar-item>
      }

      <span class="bc-float-toolbar__divider"></span>
<!--      <bc-float-toolbar-item icon="bc_huanyige" name="change" title="更换图片"></bc-float-toolbar-item>-->
      <bc-float-toolbar-item icon="bc_xiazai-2" name="download" title="下载图片"></bc-float-toolbar-item>
      <bc-float-toolbar-item icon="bc_tupianlianjie" name="copy-url" title="复制图片地址"></bc-float-toolbar-item>
<!--      <bc-float-toolbar-item icon="bc_huanyige" name="delete"></bc-float-toolbar-item>-->
    </bc-float-toolbar>
  `,
  styles: [``],
  imports: [
    BcFloatToolbarComponent,
    BcFloatToolbarItemComponent
  ],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ImageToolbar {

  private _imgBlock!: BlockCraft.IBlockComponents['image'];
  @Input({required: true})
  set imgBlock(val: BlockCraft.IBlockComponents['image']) {
    this._imgBlock = val;
  }

  get imgBlock() {
    return this._imgBlock;
  }

  @Output()
  readonly onItemClicked = new EventEmitter<BcFloatToolbarItemComponent>();

  constructor(
    public readonly cdr: ChangeDetectorRef
  ) {
  }

  protected readonly ALIGN_LIST = ALIGN_LIST;
}
