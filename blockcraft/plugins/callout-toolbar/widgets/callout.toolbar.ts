import {ChangeDetectionStrategy, Component, Input} from "@angular/core";
import {
  BcFloatToolbarComponent,
  BcFloatToolbarItemComponent,
  BcOverlayTriggerDirective,
  BUILTIN_BG_COLOR_LIST,
  BUILTIN_COLOR_LIST,
  ColorGroup,
  ColorPickerComponent
} from "../../../components";

@Component({
  selector: "callout-block-toolbar",
  template: `
    <bc-float-toolbar>
      <bc-float-toolbar-item icon="bc_sepan" [bcOverlayTrigger]="colorPicker" [positions]="['bottom-left']" [offsetY]="8"/>
    </bc-float-toolbar>

    <ng-template #colorPicker>
      <color-picker (colorPicked)="onColorPicked($event)" [activeColors]="activeColors" [colorGroups]="colorGroups"></color-picker>
    </ng-template>
  `,
  styles: [``],
  imports: [
    ColorPickerComponent,
    BcFloatToolbarItemComponent,
    BcOverlayTriggerDirective,
    BcFloatToolbarComponent
  ],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CalloutBlockToolbar {
  @Input()
  calloutBlock!: BlockCraft.IBlockComponents['callout']

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
    },
    {
      title: '边框颜色',
      type: 'borderColor',
      list: BUILTIN_BG_COLOR_LIST,
      templateUse: 'fill'
    }
  ]
  activeColors: Record<string, string | null> = {}

  ngOnInit() {
    this.activeColors = {
      color: this.calloutBlock.props.color,
      backColor: this.calloutBlock.props.backColor,
      borderColor: this.calloutBlock.props.borderColor
    }
  }

  onColorPicked($event: { type: string; color: string | null}) {
    this.calloutBlock.updateProps({
      [`${$event.type}`]: $event.color
    })
    this.activeColors = {
      ...this.activeColors,
      [`${$event.type}`]: $event.color
    }
  }
}
