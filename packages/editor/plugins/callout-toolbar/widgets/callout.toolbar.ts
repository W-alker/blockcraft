import { ChangeDetectionStrategy, Component, Input } from "@angular/core";
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
      <bc-float-toolbar-item icon="bc_sepan" [bcOverlayTrigger]="colorPicker" />
    </bc-float-toolbar>

    <ng-template #colorPicker>
      <bc-color-picker (colorPicked)="onColorPicked($event)" [gapAround]="8" [activeColors]="activeColors" [colorGroups]="colorGroups"></bc-color-picker>
    </ng-template>
  `,
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
  containerBlock!: BlockCraft.IBlockComponents['callout'] | BlockCraft.IBlockComponents['render-unit']

  colorGroups: ColorGroup[] = []
  activeColors: Record<string, string | null> = {}

  ngOnInit() {
    const surfaceGroups: ColorGroup[] = [
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
    this.colorGroups = this.containerBlock.flavour === 'callout'
      ? [{
        title: '字体颜色',
        type: 'color',
        list: BUILTIN_COLOR_LIST,
        templateUse: 'font'
      }, ...surfaceGroups]
      : surfaceGroups

    const textColor = this.containerBlock.props['color']
    this.activeColors = {
      ...(this.containerBlock.flavour === 'callout' && typeof textColor === 'string'
        ? {color: textColor}
        : {}),
      backColor: this.containerBlock.props.backColor ?? null,
      borderColor: this.containerBlock.props.borderColor ?? null
    }
  }

  onColorPicked($event: { type: string; color: string | null }) {
    if (!this.colorGroups.some(group => group.type === $event.type)) return

    this.containerBlock.updateProps({
      [`${$event.type}`]: $event.color
    })
    this.activeColors = {
      ...this.activeColors,
      [`${$event.type}`]: $event.color
    }
  }
}
